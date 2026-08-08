import "server-only";

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "crypto";
import type { CjShippingQuoteOption, ShippingDestinationInput } from "./types";

type QuoteTokenPayload = {
  version: 3;
  productSlug: string;
  productPriceCop: number;
  productSubtotalCop: number;
  quantity: number;
  variantSku: string;
  destinationFingerprint: string;
  issuedAt: string;
  expiresAt: string;
  supplierCostUsd: number;
  exchangeRateCopPerUsd: number;
  inventoryVerifiedAt: string;
  verifiedStock: number;
  selectedOptions: CjShippingQuoteOption[];
};

export class ShippingQuoteTokenError extends Error {}

function secret() {
  const configured = process.env.CHECKOUT_QUOTE_SECRET?.trim() || process.env.ADMIN_SESSION_SECRET?.trim();
  if (!configured || configured.length < 32) {
    throw new ShippingQuoteTokenError("Falta CHECKOUT_QUOTE_SECRET o un ADMIN_SESSION_SECRET seguro para proteger la cotización.");
  }
  return configured;
}

function encryptionKey() {
  return createHash("sha256").update(secret()).digest();
}

function destinationCanonical(destination: ShippingDestinationInput) {
  return [
    destination.recipientName,
    destination.email,
    destination.phone,
    destination.address1,
    destination.address2 || "",
    destination.district || "",
    destination.city,
    destination.region,
    destination.countryCode,
    destination.postalCode,
    destination.houseNumber || "",
  ].map((value) => value.normalize("NFKC").trim().toLowerCase()).join("|");
}

export function destinationFingerprint(destination: ShippingDestinationInput) {
  return createHmac("sha256", secret()).update(destinationCanonical(destination)).digest("hex");
}

export function createShippingQuoteToken(payload: QuoteTokenPayload) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

function validOption(value: unknown): value is CjShippingQuoteOption {
  if (!value || typeof value !== "object") return false;
  const option = value as Partial<CjShippingQuoteOption>;
  return typeof option.id === "string" && option.id.length > 0
    && typeof option.method === "string" && option.method.length > 0
    && typeof option.amountUsd === "number" && Number.isFinite(option.amountUsd) && option.amountUsd >= 0
    && typeof option.amountCop === "number" && Number.isFinite(option.amountCop) && option.amountCop >= 0
    && (option.remoteFeeCop === null || (typeof option.remoteFeeCop === "number" && Number.isFinite(option.remoteFeeCop) && option.remoteFeeCop >= 0))
    && typeof option.sourceCountryCode === "string" && /^[A-Z]{2}$/i.test(option.sourceCountryCode)
    && typeof option.recommended === "boolean"
    && ["cheapest", "fastest", "none"].includes(String(option.recommendation))
    && Array.isArray(option.notices) && option.notices.every((notice) => typeof notice === "string");
}

export function readShippingQuoteToken(token: unknown): QuoteTokenPayload {
  if (typeof token !== "string" || token.length < 48 || token.length > 20_000) throw new ShippingQuoteTokenError("La cotización de envío no es válida. Vuelve a calcularla.");
  let packed: Buffer;
  try {
    packed = Buffer.from(token, "base64url");
  } catch {
    throw new ShippingQuoteTokenError("La cotización de envío no es válida. Vuelve a calcularla.");
  }
  if (packed.length < 29) throw new ShippingQuoteTokenError("La cotización de envío no es válida. Vuelve a calcularla.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), packed.subarray(0, 12));
    decipher.setAuthTag(packed.subarray(12, 28));
    const parsed = JSON.parse(Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString("utf8")) as Partial<QuoteTokenPayload>;
    const expiresAt = typeof parsed.expiresAt === "string" ? Date.parse(parsed.expiresAt) : NaN;
    const inventoryVerifiedAt = typeof parsed.inventoryVerifiedAt === "string" ? Date.parse(parsed.inventoryVerifiedAt) : NaN;
    if (parsed.version !== 3 || typeof parsed.productSlug !== "string" || typeof parsed.variantSku !== "string"
      || typeof parsed.destinationFingerprint !== "string" || !Number.isFinite(parsed.productPriceCop)
      || !Number.isSafeInteger(parsed.productSubtotalCop) || (parsed.productSubtotalCop || 0) <= 0
      || !Number.isSafeInteger(parsed.quantity) || (parsed.quantity || 0) < 1 || (parsed.quantity || 0) > 10
      || parsed.productSubtotalCop !== (parsed.productPriceCop || 0) * (parsed.quantity || 0)
      || !Number.isFinite(parsed.supplierCostUsd) || !Number.isFinite(parsed.exchangeRateCopPerUsd)
      || !Number.isFinite(inventoryVerifiedAt) || !Number.isSafeInteger(parsed.verifiedStock) || (parsed.verifiedStock || 0) < 0
      || !Array.isArray(parsed.selectedOptions) || !parsed.selectedOptions.every(validOption)
      || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      throw new ShippingQuoteTokenError("La cotización de envío venció o ya no es válida. Vuelve a calcularla.");
    }
    return parsed as QuoteTokenPayload;
  } catch (error) {
    if (error instanceof ShippingQuoteTokenError) throw error;
    throw new ShippingQuoteTokenError("La cotización de envío no es válida. Vuelve a calcularla.");
  }
}

export function selectShippingQuote(token: QuoteTokenPayload, methodId: unknown, destination: ShippingDestinationInput) {
  if (destinationFingerprint(destination) !== token.destinationFingerprint) {
    throw new ShippingQuoteTokenError("Los datos de entrega cambiaron. Vuelve a calcular el envío antes de pagar.");
  }
  if (typeof methodId !== "string" || !methodId.trim()) throw new ShippingQuoteTokenError("Selecciona un método de envío antes de pagar.");
  const selected = token.selectedOptions.find((option) => option.id === methodId);
  if (!selected) throw new ShippingQuoteTokenError("El método de envío ya no pertenece a esta cotización. Vuelve a calcularla.");
  return selected;
}

export type { QuoteTokenPayload };

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { checkoutAuditActive, downloadCheckoutAudit, readCheckoutAudit, recordCheckoutAuditEvent } from "@/lib/checkout-audit";
import { clearPendingPurchase, readPendingPurchase, trackCommerceEvent } from "@/lib/analytics/client";
import { markets, type Market } from "@/lib/i18n/config";
import { useCart } from "./cart-context";

type VerifiedStatus = "PENDING" | "APPROVED" | "DECLINED" | "VOIDED" | "ERROR" | "REVIEW";
type DisplayStatus = VerifiedStatus | "CHECKING" | "UNAVAILABLE" | "CANCELLED";
const maximumVerificationAttempts = 60;
const transientStatusCodes = new Set([404, 429, 502, 503, 504]);

function retryDelay(response: Response) {
  const header = response.headers.get("retry-after");
  if (!header) return 5000;
  const seconds = Number(header);
  const milliseconds = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
  return Math.min(60_000, Math.max(1000, Number.isFinite(milliseconds) ? milliseconds : 5000));
}

function copyFor(status: DisplayStatus, market: Market, provider: string | undefined) {
  const es = market === "co";
  const processor = provider === "paypal" ? "PayPal" : "Wompi";
  if (status === "APPROVED") return { title: es ? "Pago aprobado" : "Payment approved", detail: es ? `${processor} confirmó el pago y Nexora lo concilió con tu pedido. Recibirás las novedades en el correo registrado.` : `${processor} confirmed the payment and Nexora reconciled it with your order. Updates will be sent to the email provided.`, tone: "text-emerald" };
  if (status === "DECLINED") return { title: es ? "Pago rechazado" : "Payment declined", detail: es ? `${processor} no aprobó la transacción. Tu carrito se conserva para que revises el medio de pago.` : `${processor} did not approve the transaction. Your cart is preserved so you can review the payment method.`, tone: "text-red-200" };
  if (status === "VOIDED") return { title: es ? "Pago anulado" : "Payment voided", detail: es ? `${processor} confirmó que la transacción fue anulada.` : `${processor} confirmed that the transaction was voided.`, tone: "text-amber-100" };
  if (status === "CANCELLED") return { title: es ? "Pago cancelado" : "Checkout cancelled", detail: es ? "Regresaste antes de completar el pago. No se marca ningún pedido como pagado y tu carrito se conserva." : "You returned before completing payment. No order is marked as paid and your cart is preserved.", tone: "text-amber-100" };
  if (status === "ERROR") return { title: es ? "Pago no completado" : "Payment not completed", detail: es ? `${processor} reportó un error. Tu carrito permanece disponible.` : `${processor} reported an error. Your cart remains available.`, tone: "text-red-200" };
  if (status === "REVIEW") return { title: es ? "Pago recibido, en conciliación" : "Payment received, reconciling", detail: es ? `${processor} reportó el pago, pero Nexora debe terminar de conciliar el monto. No vuelvas a pagar.` : `${processor} reported the payment, but Nexora must finish reconciling the amount. Do not pay again.`, tone: "text-amber-100" };
  if (status === "PENDING") return { title: es ? "Pago en proceso" : "Payment processing", detail: es ? `${processor} aún está procesando la transacción. No repitas el pago.` : `${processor} is still processing the transaction. Do not submit another payment.`, tone: "text-amber-100" };
  if (status === "UNAVAILABLE") return { title: es ? "Confirmación pendiente" : "Confirmation pending", detail: es ? "No pudimos consultar el resultado oficial ahora. Conserva el comprobante y revisa el correo antes de pagar otra vez." : "The official result is temporarily unavailable. Keep your receipt and check your email before trying to pay again.", tone: "text-amber-100" };
  return { title: es ? "Verificando tu pago" : "Verifying your payment", detail: es ? `Consultamos directamente a ${processor} y al libro privado; no confiamos sólo en la URL de regreso.` : `We are checking ${processor} and the private order ledger; the browser return URL alone is not trusted.`, tone: "text-white" };
}

type CheckoutResultStatusProps = {
  provider?: string;
  transactionId?: string;
  token?: string;
  reference?: string;
  cancelled?: boolean;
  market: Market;
};

export function CheckoutResultStatus({ provider, transactionId, token, reference, cancelled = false, market }: CheckoutResultStatusProps) {
  const { clearCart } = useCart();
  const providerOrderId = provider === "paypal" ? token : transactionId;
  const supportedProvider = provider === "wompi" || provider === "paypal";
  const canVerify = !cancelled && supportedProvider && Boolean(providerOrderId && reference);
  const [status, setStatus] = useState<DisplayStatus>(cancelled ? "CANCELLED" : canVerify ? "CHECKING" : "UNAVAILABLE");
  const [message, setMessage] = useState<string | null>(null);
  const [auditId, setAuditId] = useState<string | null>(null);
  const es = market === "co";

  useEffect(() => {
    if (!checkoutAuditActive()) return;
    const snapshot = readCheckoutAudit();
    queueMicrotask(() => setAuditId(snapshot?.auditId || null));
    recordCheckoutAuditEvent("payment-returned", { provider: provider || "unknown", reference: reference || "missing", transactionIdPresent: Boolean(providerOrderId), cancelled });
  }, [cancelled, provider, providerOrderId, reference]);

  useEffect(() => {
    if (!canVerify || !providerOrderId || !reference || !supportedProvider) return;
    const verifiedProviderId = providerOrderId;
    const verifiedReference = reference;
    const endpoint = provider === "paypal" ? "/api/payments/paypal/status" : "/api/payments/wompi/status";
    let stopped = false;
    let timer: number | undefined;
    let attempts = 0;
    let paypalCaptureRequested = false;

    const scheduleRetry = (delay: number, nextMessage?: string) => {
      if (stopped) return;
      if (attempts >= maximumVerificationAttempts) {
        setStatus("UNAVAILABLE");
        setMessage(nextMessage || (es ? "El procesador aún no entregó un resultado verificable. Revisa tu correo antes de volver a pagar." : "The processor has not returned a verifiable result. Check your email before trying again."));
        return;
      }
      setStatus("PENDING");
      setMessage(nextMessage || null);
      timer = window.setTimeout(verify, delay);
    };

    async function verify() {
      attempts += 1;
      try {
        const params = new URLSearchParams({ reference: verifiedReference });
        params.set(provider === "paypal" ? "token" : "id", verifiedProviderId);
        // La primera confirmación del retorno PayPal solicita la captura con
        // POST. Toda consulta posterior usa GET y no tiene efectos financieros.
        const shouldCapturePayPal = provider === "paypal" && !paypalCaptureRequested;
        if (shouldCapturePayPal) paypalCaptureRequested = true;
        const response = await fetch(shouldCapturePayPal ? endpoint : `${endpoint}?${params}`, shouldCapturePayPal ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: verifiedProviderId, reference: verifiedReference }),
          cache: "no-store",
        } : { method: "GET", cache: "no-store" });
        const payload = await response.json().catch(() => null) as { id?: string; status?: VerifiedStatus; message?: string; amount?: number; currency?: "COP" | "USD"; provider?: string } | null;
        if (!response.ok) {
          if (transientStatusCodes.has(response.status)) {
            recordCheckoutAuditEvent("payment-status-retry", { httpStatus: response.status, attempt: attempts, provider: provider || "unknown" });
            scheduleRetry(retryDelay(response), payload?.message);
            return;
          }
          recordCheckoutAuditEvent("payment-status-failed", { httpStatus: response.status, attempt: attempts, provider: provider || "unknown" });
          setStatus("UNAVAILABLE");
          setMessage(payload?.message || (es ? "La respuesta del procesador no coincide con este pedido." : "The processor response does not match this order."));
          return;
        }
        if (!payload?.status) {
          scheduleRetry(5000, es ? "El procesador aún no devolvió un estado verificable." : "The processor has not returned a verifiable status yet.");
          return;
        }
        if (stopped) return;
        setStatus(payload.status);
        recordCheckoutAuditEvent("payment-status-verified", { status: payload.status, attempt: attempts, provider: provider || "unknown" });
        setMessage(null);
        if (payload.status === "APPROVED" && typeof payload.amount === "number" && payload.currency === markets[market].currency) {
          const stableTransactionId = payload.id || verifiedProviderId;
          const pending = readPendingPurchase(verifiedReference);
          clearCart();
          trackCommerceEvent({
            name: "purchase",
            market,
            currency: payload.currency,
            transactionId: stableTransactionId,
            value: payload.amount,
            paymentType: provider,
            items: pending?.market === market && pending.currency === payload.currency ? pending.items : undefined,
            dedupeKey: `purchase:${stableTransactionId}`,
          });
          clearPendingPurchase(verifiedReference);
        }
        if (payload.status === "PENDING" || payload.status === "REVIEW") scheduleRetry(5000, payload.message);
      } catch (error) {
        if (stopped) return;
        recordCheckoutAuditEvent("payment-status-retry", { attempt: attempts, reason: "network-or-client", provider: provider || "unknown" });
        scheduleRetry(5000, error instanceof Error ? error.message : (es ? "No fue posible consultar el pago." : "Payment status could not be checked."));
      }
    }

    void verify();
    return () => { stopped = true; if (timer) window.clearTimeout(timer); };
  }, [canVerify, clearCart, es, market, provider, providerOrderId, reference, supportedProvider]);

  const content = copyFor(status, market, provider);
  return <section className="w-full max-w-md rounded-2xl border border-silver/20 bg-white/[.025] p-7 text-center" aria-live="polite">
    <p className="text-xs font-bold tracking-[.16em] text-emerald uppercase">Nexora</p>
    <h1 className={`mt-3 text-3xl font-semibold ${content.tone}`}>{content.title}</h1>
    <p className="mt-4 text-sm leading-6 text-silver/75">{content.detail}</p>
    {message && <p className="mt-3 text-xs leading-5 text-amber-100">{message}</p>}
    {(reference || providerOrderId) && <p className="mt-4 break-all rounded-xl border border-silver/15 bg-black/20 px-3 py-2 font-mono text-xs text-silver/70">{es ? "Referencia" : "Reference"}: {reference || providerOrderId}</p>}
    <p className="mt-4 text-xs leading-5 text-silver/60">{es ? "El pedido sólo avanza cuando el procesador confirma el pago y el evento queda conciliado con el total registrado." : "The order advances only after the processor confirms payment and the event is reconciled with the recorded total."}</p>
    {auditId && <button type="button" onClick={() => downloadCheckoutAudit()} className="mt-5 w-full rounded-xl border border-sky-200/35 px-4 py-2.5 text-xs font-semibold text-sky-100 hover:border-sky-100">{es ? "Descargar bitácora técnica de esta compra" : "Download this checkout technical log"}</button>}
    <Link href={markets[market].homePath} className="mt-7 inline-flex rounded-full bg-emerald px-5 py-3 text-sm font-bold text-onyx">{es ? "Volver a la tienda" : "Back to the store"}</Link>
  </section>;
}

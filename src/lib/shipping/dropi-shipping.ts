import "server-only";
import type { ShippingDestinationInput, CjShippingQuoteOption } from "./types";
import { DropiRequestError } from "@/lib/automation/dropi-client";

/** Never substitute a flat fee, fixed FX rate or catalog stock for a live quote. */
export async function getDropiShippingQuote(destination: ShippingDestinationInput, itemCount: number): Promise<CjShippingQuoteOption[]> {
  if (destination.countryCode !== "CO") throw new DropiRequestError("Dropi sólo admite entregas dentro de Colombia.");
  if (!Number.isSafeInteger(itemCount) || itemCount < 1) throw new DropiRequestError("Cantidad Dropi inválida.");
  throw new DropiRequestError("Dropi pendiente de habilitación: falta verificar el contrato de flete e inventario con una integración autorizada para Nexora.");
}

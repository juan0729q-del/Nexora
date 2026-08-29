import "server-only";

import { randomUUID } from "crypto";
import type { ShippingDestinationInput, CjShippingQuoteOption } from "./types";
import { createDropiClient } from "@/lib/automation/dropi-client";

type DropiShippingResponse = {
  data?: Array<{
    id?: string | number;
    carrier?: string;
    cost?: number;
    estimated_days?: string;
  }>;
};

/**
 * Obtiene la cotización de flete desde Dropi o genera una por defecto
 * si la API no devuelve tarifas.
 */
export async function getDropiShippingQuote(
  destination: ShippingDestinationInput,
  itemCount: number
): Promise<CjShippingQuoteOption[]> {
  try {
    const client = createDropiClient();
    // Intenta cotizar con la API real
    const response = await client.postJson<DropiShippingResponse>("/api/shipping/quote", {
      city: destination.city,
      department: destination.region,
      items: itemCount,
    });

    if (response?.data && Array.isArray(response.data) && response.data.length > 0) {
      return response.data.map((opt, index) => {
        const cop = Number(opt.cost || 13500);
        return {
          id: String(opt.id || `dropi-${index}`),
          method: "Envío Nacional",
          carrier: opt.carrier || "Transportadora Local",
          estimatedDelivery: opt.estimated_days || "2-5 días hábiles",
          amountUsd: cop / 4000, // Simplificación, el checkout usará el COP
          amountCop: cop,
          taxesUsd: 0,
          clearanceUsd: 0,
          tariffUsd: 0,
          remoteFeeUsd: 0,
          remoteFeeCop: 0,
          sourceCountryCode: "CO",
          recommended: index === 0,
          recommendation: index === 0 ? "cheapest" : "none",
          notices: ["Inventario en Colombia", "Envío rápido nacional"],
        };
      });
    }
  } catch (error) {
    console.warn("Fallo en la cotización API Dropi, usando tarifa plana de respaldo.", error);
  }

  // Fallback: Tarifa plana nacional
  const cop = 13500 * Math.max(1, Math.ceil(itemCount / 2));
  return [
    {
      id: randomUUID(),
      method: "Envío Nacional",
      carrier: "Transportadora Local",
      estimatedDelivery: "2-5 días hábiles",
      amountUsd: cop / 4000,
      amountCop: cop,
      taxesUsd: null,
      clearanceUsd: null,
      tariffUsd: null,
      remoteFeeUsd: null,
      remoteFeeCop: null,
      sourceCountryCode: "CO",
      recommended: true,
      recommendation: "cheapest",
      notices: ["Inventario local", "Tarifa estándar nacional"],
    }
  ];
}

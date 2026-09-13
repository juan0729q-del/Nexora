import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createCjClient, CjRequestError } from "@/lib/automation/cj-client";
import { getCatalog } from "@/lib/catalog-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Consulta acotada: ajustes gratuitos y una ficha (10 puntos). Sin pedidos. */
export async function POST() {
  if (!(await isAdmin())) return NextResponse.json({ message: "Sesión administrativa requerida." }, { status: 401 });
  const client = createCjClient();
  const stages: unknown[] = [];
  for (const [stage, url] of [
    ["settings", "https://developers.cjdropshipping.com/api2.0/v1/setting/get"],
    ["categories", "https://developers.cjdropshipping.com/api2.0/v1/product/getCategory"],
    ["product-probe", (await getCatalog()).find((product) => (product.supplier.source ?? "cj") === "cj")?.supplier.sourceUrl],
  ]) {
    if (!url) continue;
    try {
      const result = await client.getJson<{ pointsInfo?: unknown }>(url);
      stages.push({ stage, ok: true, reportedPoints: result.pointsInfo, telemetry: client.getTelemetry() });
    } catch (error) {
      stages.push({ stage, ok: false, message: error instanceof Error ? error.message : "Error CJ", telemetry: client.getTelemetry(), code: error instanceof CjRequestError ? error.code : undefined });
      break;
    }
  }
  return NextResponse.json({ stages }, { headers: { "Cache-Control": "no-store" } });
}

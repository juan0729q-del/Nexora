import { NextResponse } from "next/server";
import { CjQuotaError } from "@/lib/automation/cj-client";
import { enrichPublishedCatalogDetails } from "@/lib/automation/niche-rotation";
import { hasValidCatalogImportAuthorization } from "@/lib/automation/runtime-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Actualiza únicamente las fichas existentes con Product Details de CJ: texto,
 * medidas, variantes e imágenes nativas. La respuesta es inmutable en Vercel;
 * GitHub Actions la valida y la convierte en un commit de catalog.json.
 */
export async function POST(request: Request) {
  if (!(await hasValidCatalogImportAuthorization(request.headers.get("authorization")))) return NextResponse.json({ message: "No autorizado" }, { status: 401 });

  try {
    const result = await enrichPublishedCatalogDetails();
    return NextResponse.json({ status: "validated", ...result, nativeProviderImages: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Catalog enrichment failed", error);
    const message = error instanceof Error ? error.message : "No fue posible enriquecer las fichas del proveedor.";
    if (error instanceof CjQuotaError) return NextResponse.json({ message, status: "rate-limited" }, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "60" } });
    return NextResponse.json({ message }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

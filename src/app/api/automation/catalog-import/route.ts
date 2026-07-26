import { NextResponse } from "next/server";
import { collectInitialCatalog } from "@/lib/automation/niche-rotation";
import { hasValidCatalogImportAuthorization } from "@/lib/automation/runtime-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Obtiene y valida candidatos reales sin escribir en el filesystem efímero de
 * Vercel. El operador importa el JSON resultante al repositorio y lo publica
 * con Git, preservando un historial auditable.
 */
export async function POST(request: Request) {
  if (!(await hasValidCatalogImportAuthorization(request.headers.get("authorization")))) return NextResponse.json({ message: "No autorizado" }, { status: 401 });
  try {
    const requested = Number(new URL(request.url).searchParams.get("perNiche") || 5);
    const perNiche = Math.min(10, Math.max(5, Number.isFinite(requested) ? Math.floor(requested) : 5));
    const { products, selection } = await collectInitialCatalog(perNiche);
    return NextResponse.json({
      status: "validated",
      imported: products.length,
      products,
      selection,
      nativeProviderImages: true,
      persistence: "Use scripts/persist-catalog-import.mjs to validate and version this payload in catalog.json.",
    });
  } catch (error) {
    console.error("Catalog import preview failed", error);
    const message = error instanceof Error ? error.message : "No fue posible consultar el catálogo.";
    const validationFailure = message.startsWith("CJ solo devolvió") || message.startsWith("CJ no devolvió una categoría");
    return NextResponse.json({ message }, { status: validationFailure ? 422 : 502 });
  }
}

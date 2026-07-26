import { NextResponse } from "next/server";
import { getAutomationConfiguration, hasValidCronAuthorization } from "@/lib/automation/runtime-auth";
import { optimizeCatalog } from "@/lib/automation/catalog-optimizer";
import { getTopSellingConfiguration, rotateCatalogByNiche } from "@/lib/automation/niche-rotation";
import { syncSupplierCatalog } from "@/lib/automation/supplier-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function run(request: Request) {
  if (!hasValidCronAuthorization(request.headers.get("authorization"))) return NextResponse.json({ message: "No autorizado" }, { status: 401 });
  if (!getAutomationConfiguration().catalogAutomationEnabled) return NextResponse.json({ status: "skipped", reason: "Automatización de catálogo desactivada" });
  try {
    const catalog = await optimizeCatalog();
    const topSelling = getTopSellingConfiguration();
    const [supplier, rotation] = await Promise.all([
      syncSupplierCatalog(),
      topSelling.configured
        ? rotateCatalogByNiche(catalog.byNiche)
        : Promise.resolve({ replacements: [], persistence: { status: "skipped", store: "catalog.json versionado", reason: topSelling.reason } }),
    ]);
    return NextResponse.json({ status: "planned", supplier, catalog, rotation });
  } catch (error) {
    console.error("Catalog automation failed", error);
    return NextResponse.json({ message: "Falló la automatización del catálogo." }, { status: 502 });
  }
}

// Vercel Cron invoca GET; POST está disponible para un agente de IA autorizado.
export const GET = run;
export const POST = run;

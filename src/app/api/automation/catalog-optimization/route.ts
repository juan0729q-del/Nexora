import { NextResponse } from "next/server";
import { getAutomationConfiguration, hasValidCronAuthorization } from "@/lib/automation/runtime-auth";
import { optimizeCatalog } from "@/lib/automation/catalog-optimizer";
import { syncSupplierCatalog } from "@/lib/automation/supplier-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function run(request: Request) {
  if (!hasValidCronAuthorization(request.headers.get("authorization"))) return NextResponse.json({ message: "No autorizado" }, { status: 401 });
  if (!getAutomationConfiguration().catalogAutomationEnabled) return NextResponse.json({ status: "skipped", reason: "Automatización de catálogo desactivada" });
  try {
    const [supplier, catalog] = await Promise.all([syncSupplierCatalog(), Promise.resolve(optimizeCatalog())]);
    // Hook de persistencia: guardar stock/costos del proveedor y las decisiones
    // feature/pause en BD; la portada ya aplica estas reglas de forma determinista.
    return NextResponse.json({ status: "completed", supplier, catalog });
  } catch (error) {
    console.error("Catalog automation failed", error);
    return NextResponse.json({ message: "Falló la automatización del catálogo." }, { status: 502 });
  }
}

// Vercel Cron invoca la ruta por GET; POST se conserva para agentes externos.
export const GET = run;
export const POST = run;

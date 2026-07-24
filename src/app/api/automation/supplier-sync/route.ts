import { NextResponse } from "next/server";
import { hasValidCronAuthorization } from "@/lib/automation/runtime-auth";
import { syncSupplierCatalog } from "@/lib/automation/supplier-sync";

export const runtime = "nodejs";
async function run(request: Request) {
  if (!hasValidCronAuthorization(request.headers.get("authorization"))) return NextResponse.json({ message: "No autorizado" }, { status: 401 });
  try { return NextResponse.json(await syncSupplierCatalog()); }
  catch (error) { console.error("Supplier sync failed", error); return NextResponse.json({ message: "Falló la sincronización del proveedor." }, { status: 502 }); }
}
export const GET = run;
export const POST = run;

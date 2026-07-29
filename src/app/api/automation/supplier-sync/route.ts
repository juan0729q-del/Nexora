import { NextResponse } from "next/server";
import { CjQuotaError } from "@/lib/automation/cj-client";
import { hasValidCronAuthorization } from "@/lib/automation/runtime-auth";
import { syncSupplierCatalog } from "@/lib/automation/supplier-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run(request: Request) {
  if (!hasValidCronAuthorization(request.headers.get("authorization"))) return NextResponse.json({ message: "No autorizado" }, { status: 401 });

  try {
    return NextResponse.json(await syncSupplierCatalog(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Supplier sync failed", error);
    if (error instanceof CjQuotaError) {
      return NextResponse.json(
        { message: error.message, status: "rate-limited" },
        { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "60" } },
      );
    }
    return NextResponse.json({ message: "Falló la sincronización del proveedor." }, { status: 502 });
  }
}

export const GET = run;
export const POST = run;

import { NextResponse } from "next/server";
import { notifyIndexNow } from "@/lib/indexnow";
import { hasValidCronAuthorization } from "@/lib/automation/runtime-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function run(request: Request) {
  if (!hasValidCronAuthorization(request.headers.get("authorization"))) return NextResponse.json({ message: "No autorizado" }, { status: 401 });

  try {
    return NextResponse.json(await notifyIndexNow(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("IndexNow submission failed", error);
    return NextResponse.json({ message: "No fue posible notificar las URLs a IndexNow." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

export const GET = run;
export const POST = run;

import { NextResponse } from "next/server";
import { buildSeoContentPrompt, type RawProductSpecs } from "@/lib/automation/seo-content";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authorization !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ message: "No autorizado" }, { status: 401 });
  const specs = await request.json() as RawProductSpecs;
  if (!specs.name || !specs.category || !Array.isArray(specs.features) || !specs.audience) return NextResponse.json({ message: "Especificaciones incompletas" }, { status: 400 });
  // Conecta aquí el SDK de IA de tu proveedor y almacena el borrador para revisión humana.
  return NextResponse.json({ status: "draft_requested", prompt: buildSeoContentPrompt(specs) });
}

import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getColombiaDepartment } from "@/lib/colombia-locations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let publicTokenCache: { value: string; expiresAt: number } | undefined;
const requestWindows = new Map<string, { startedAt: number; count: number }>();

function enforceRateLimit(request: Request) {
  const now = Date.now();
  const forwarded = request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for") || "unknown";
  const key = createHash("sha256").update(`${forwarded.split(",")[0]}|${request.headers.get("user-agent") || ""}`).digest("hex");
  const current = requestWindows.get(key);
  if (!current || now - current.startedAt >= 60_000) requestWindows.set(key, { startedAt: now, count: 1 });
  else if (current.count >= 20) throw new Error("rate-limit");
  else current.count += 1;
  if (requestWindows.size > 1_000) {
    for (const [entryKey, entry] of requestWindows) if (now - entry.startedAt >= 60_000) requestWindows.delete(entryKey);
  }
}

async function publicViewerToken() {
  if (publicTokenCache && publicTokenCache.expiresAt > Date.now()) return publicTokenCache.value;
  const response = await fetch("https://visor.codigopostal.gov.co/472/visor/javascript/layout.aspx", {
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("No fue posible abrir el visor postal.");
  const script = await response.text();
  const token = script.match(/userToken472\s*=\s*['\"]([a-f0-9-]{30,})['\"]/i)?.[1];
  if (!token) throw new Error("4-72 no entregó una sesión pública válida.");
  publicTokenCache = { value: token, expiresAt: Date.now() + 5 * 60_000 };
  return token;
}

function normalizedText(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

export async function POST(request: Request) {
  try {
    enforceRateLimit(request);
    const body = await request.json() as Record<string, unknown>;
    const department = getColombiaDepartment(normalizedText(body.departmentId, 12));
    const municipality = normalizedText(body.municipality, 120);
    const daneCode = normalizedText(body.municipalityDaneCode, 8);
    const address = normalizedText(body.address, 300);
    if (!department || !municipality || !/^\d{5}$/.test(daneCode) || !address) {
      return NextResponse.json({ message: "Completa departamento, municipio y dirección para calcular el código postal." }, { status: 400 });
    }

    const token = await publicViewerToken();
    const response = await fetch("https://visor.codigopostal.gov.co/RestService472/CodigoPostal/EntryOrdinary", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ token, departamento: department.name, municipio: municipality, dvp: daneCode, direccion: address }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`4-72 respondió ${response.status}`);
    const payload = await response.json() as { status?: unknown; cp?: unknown; cp_ampliado?: unknown; direccion_estandar?: unknown };
    const postalCode = normalizedText(payload.cp, 6);
    if (String(payload.status) !== "200" || !/^\d{6}$/.test(postalCode)) {
      return NextResponse.json({ message: "4-72 no pudo identificar el código postal de esa dirección. Revísala o ingrésalo manualmente." }, { status: 422 });
    }
    return NextResponse.json({
      postalCode,
      expandedPostalCode: normalizedText(payload.cp_ampliado, 12) || null,
      standardizedAddress: normalizedText(payload.direccion_estandar, 320) || null,
      source: "4-72",
    });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ message: "Solicitud postal inválida." }, { status: 400 });
    if (error instanceof Error && error.message === "rate-limit") return NextResponse.json({ message: "Espera un minuto antes de volver a consultar el código postal." }, { status: 429, headers: { "Retry-After": "60" } });
    return NextResponse.json({ message: "El servicio postal de 4-72 no respondió. Puedes ingresar el código postal manualmente." }, { status: 503 });
  }
}

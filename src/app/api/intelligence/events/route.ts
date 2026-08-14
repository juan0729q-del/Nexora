import { NextResponse } from "next/server";
import { intelligenceEventTypes, type IntelligenceEvent } from "@/lib/intelligence/types";
import { recordIntelligenceEvents } from "@/lib/sales-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const windows = new Map<string, { startedAt: number; count: number }>();
const allowedTypes = new Set<string>(intelligenceEventTypes);
function text(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function finite(value: unknown, max: number) { const number = Number(value); return Number.isFinite(number) ? Math.max(0, Math.min(max, number)) : undefined; }

function fingerprint(request: Request) {
  return text(request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for") || "unknown", 100).split(",")[0];
}

function allowed(request: Request) {
  const key = fingerprint(request);
  const now = Date.now();
  const current = windows.get(key);
  if (!current || now - current.startedAt > 60_000) { windows.set(key, { startedAt: now, count: 1 }); return true; }
  current.count += 1;
  if (windows.size > 2_000) for (const [id, entry] of windows) if (now - entry.startedAt > 60_000) windows.delete(id);
  return current.count <= 120;
}

function parseEvent(value: unknown): IntelligenceEvent | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const eventId = text(row.eventId, 100);
  const sessionId = text(row.sessionId, 100);
  const type = text(row.type, 60);
  const occurredAt = text(row.occurredAt, 40);
  const page = text(row.page, 220);
  if (!eventId || !sessionId || !allowedTypes.has(type) || !page || !Number.isFinite(Date.parse(occurredAt))) return null;
  const niche = text(row.niche, 40);
  return {
    eventId, sessionId, type: type as IntelligenceEvent["type"], occurredAt, page,
    productSlug: text(row.productSlug, 140) || undefined,
    productSku: text(row.productSku, 100) || undefined,
    variantSku: text(row.variantSku, 120) || undefined,
    niche: ["jewelry", "technologyHome", "wellbeing"].includes(niche) ? niche as IntelligenceEvent["niche"] : undefined,
    quantity: finite(row.quantity, 50), valueCop: finite(row.valueCop, 100_000_000), source: "storefront",
    value: finite(row.value, 100_000_000),
    market: row.market === "co" || row.market === "us" ? row.market : undefined,
    locale: row.locale === "es-CO" || row.locale === "en-US" ? row.locale : undefined,
    currency: row.currency === "COP" || row.currency === "USD" ? row.currency : undefined,
  };
}

export async function POST(request: Request) {
  if (!allowed(request)) return NextResponse.json({ accepted: true, persisted: false }, { status: 202 });
  try {
    const body = await request.json() as { events?: unknown };
    if (!Array.isArray(body.events) || body.events.length < 1 || body.events.length > 20) return NextResponse.json({ message: "Lote inválido." }, { status: 400 });
    const events = body.events.map(parseEvent).filter((event): event is IntelligenceEvent => Boolean(event));
    if (events.length !== body.events.length) return NextResponse.json({ message: "Evento inválido." }, { status: 400 });
    await recordIntelligenceEvents(events);
    return NextResponse.json({ accepted: true, persisted: true }, { status: 202 });
  } catch {
    // El análisis nunca bloquea una interacción comercial.
    return NextResponse.json({ accepted: true, persisted: false }, { status: 202 });
  }
}

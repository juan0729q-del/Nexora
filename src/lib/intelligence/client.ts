import type { IntelligenceEvent, IntelligenceEventType } from "./types";

type EventInput = Omit<IntelligenceEvent, "eventId" | "sessionId" | "occurredAt" | "source">;
const sessionKey = "nexora_intelligence_session_v1";

function sessionId() {
  if (typeof window === "undefined") return "server";
  const current = window.sessionStorage.getItem(sessionKey);
  if (current) return current;
  const next = crypto.randomUUID();
  window.sessionStorage.setItem(sessionKey, next);
  return next;
}

/** Telemetría anónima y prescindible: nunca bloquea catálogo, envío o pago. */
export function trackIntelligenceEvent(input: EventInput) {
  if (typeof window === "undefined") return;
  const event: IntelligenceEvent = { ...input, eventId: crypto.randomUUID(), sessionId: sessionId(), occurredAt: new Date().toISOString(), source: "storefront" };
  void fetch("/api/intelligence/events", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events: [event] }), keepalive: true,
  }).catch(() => undefined);
}

export function trackSimple(type: IntelligenceEventType, page: string, context: Partial<Pick<IntelligenceEvent, "market" | "locale" | "currency">> = {}) {
  trackIntelligenceEvent({ type, page, ...context });
}

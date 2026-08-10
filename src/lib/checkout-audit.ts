const storageKey = "nexora.checkout.audit.v1";
const auditVersion = 1;

type AuditValue = string | number | boolean | null | AuditValue[] | { [key: string]: AuditValue };

export type CheckoutAuditEvent = {
  at: string;
  type: string;
  page: string;
  details?: Record<string, AuditValue>;
};

export type CheckoutAuditSnapshot = {
  version: number;
  auditId: string;
  startedAt: string;
  updatedAt: string;
  mode: "manual-real-purchase";
  privacy: string;
  events: CheckoutAuditEvent[];
};

function browserAvailable() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function safeRead(): CheckoutAuditSnapshot | null {
  if (!browserAvailable()) return null;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(storageKey) || "null") as CheckoutAuditSnapshot | null;
    return parsed?.version === auditVersion && Array.isArray(parsed.events) ? parsed : null;
  } catch {
    return null;
  }
}

function write(snapshot: CheckoutAuditSnapshot) {
  if (!browserAvailable()) return;
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(snapshot));
  } catch {
    // La auditoría es auxiliar: nunca debe bloquear la compra si el navegador
    // impide sessionStorage o alcanza su cuota local.
  }
}

function newAudit(): CheckoutAuditSnapshot {
  const now = new Date().toISOString();
  return {
    version: auditVersion,
    auditId: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `nexora-${Date.now()}`,
    startedAt: now,
    updatedAt: now,
    mode: "manual-real-purchase",
    privacy: "No contiene nombre, correo, teléfono, dirección, credenciales, datos de tarjeta ni tokens firmados de envío.",
    events: [],
  };
}

export function checkoutAuditActive() {
  if (!browserAvailable()) return false;
  return new URLSearchParams(window.location.search).get("audit") === "1" || Boolean(safeRead());
}

export function startCheckoutAudit(details: Record<string, AuditValue>) {
  if (!browserAvailable()) return null;
  const requested = new URLSearchParams(window.location.search).get("audit") === "1";
  let snapshot = safeRead();
  if (!requested && !snapshot) return null;
  snapshot ||= newAudit();
  write(snapshot);
  recordCheckoutAuditEvent("audit-started", details);
  return snapshot.auditId;
}

export function recordCheckoutAuditEvent(type: string, details?: Record<string, AuditValue>) {
  if (!browserAvailable()) return;
  const snapshot = safeRead();
  if (!snapshot) return;
  const now = new Date().toISOString();
  snapshot.updatedAt = now;
  snapshot.events.push({
    at: now,
    type: type.slice(0, 80),
    page: window.location.pathname,
    ...(details ? { details } : {}),
  });
  snapshot.events = snapshot.events.slice(-200);
  write(snapshot);
}

export function readCheckoutAudit() {
  return safeRead();
}

export function downloadCheckoutAudit() {
  const snapshot = safeRead();
  if (!snapshot || !browserAvailable()) return false;
  recordCheckoutAuditEvent("audit-downloaded", { eventCount: snapshot.events.length });
  const current = safeRead() || snapshot;
  const blob = new Blob([`${JSON.stringify(current, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `auditoria-compra-nexora-${current.auditId}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}

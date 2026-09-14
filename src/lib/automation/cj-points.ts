export type CjPointsInfo = { usedToday?: number; remaining?: number; total?: number };
export type CjPointsSnapshot = { points?: CjPointsInfo; observedAt?: number };

function nonnegativeNumber(value: unknown) {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  if (typeof value === "string" && !value.trim()) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

export function parseCjPoints(value: unknown): CjPointsInfo | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const points = { usedToday: nonnegativeNumber(raw.usedToday), remaining: nonnegativeNumber(raw.remaining), total: nonnegativeNumber(raw.total) };
  return Object.values(points).some(value => value !== undefined) ? points : undefined;
}

/** CJ repone puntos por minuto: un saldo anterior no puede bloquear indefinidamente. */
export function freshCjPoints(snapshot: CjPointsSnapshot, now = Date.now()) {
  const age = snapshot.observedAt === undefined ? Infinity : now - snapshot.observedAt;
  // Un total sin asignación no demuestra agotamiento. Conservamos la telemetría
  // original, pero dejamos que CJ autorice o rechace la siguiente petición.
  if (snapshot.points?.total === 0) return undefined;
  return age >= 0 && age < 60_000 ? snapshot.points : undefined;
}

export async function verifyCjPoints(
  read: () => CjPointsSnapshot,
  refresh: () => Promise<void>,
  required: number,
  now: () => number = Date.now,
) {
  let points = freshCjPoints(read(), now());
  if (points?.remaining === undefined || points.remaining < required) {
    await refresh();
    points = freshCjPoints(read(), now());
  }
  // Un dato ausente no representa cero; la respuesta real de CJ sigue siendo autoritativa.
  return points;
}

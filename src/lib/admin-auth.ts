import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "nexora_admin";
const SESSION_SECONDS = 60 * 60 * 8;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;

type SessionPayload = {
  v: 1;
  iat: number;
  exp: number;
  nonce: string;
};

type LoginWindow = { startedAt: number; failures: number };
const loginWindows = new Map<string, LoginWindow>();

function configuration() {
  const password = process.env.ADMIN_PASSWORD?.trim();
  const secret = process.env.ADMIN_SESSION_SECRET?.trim();
  return password && secret ? { password, secret } : null;
}

function digest(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest();
}

function safeEqual(left: Buffer, right: Buffer) {
  return left.length === right.length && timingSafeEqual(left, right);
}

function sessionSignature(encodedPayload: string, password: string, secret: string) {
  // Incorporar la contraseña invalida todas las sesiones si se rota cualquiera
  // de las dos credenciales administrativas.
  return createHmac("sha256", digest(password, secret)).update(encodedPayload).digest("base64url");
}

function createSessionToken(password: string, secret: string) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    v: 1,
    iat: issuedAt,
    exp: issuedAt + SESSION_SECONDS,
    nonce: randomUUID(),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${sessionSignature(encodedPayload, password, secret)}`;
}

function validSessionToken(value: string, password: string, secret: string) {
  const [encodedPayload, receivedSignature, extra] = value.split(".");
  if (!encodedPayload || !receivedSignature || extra) return false;
  const expectedSignature = sessionSignature(encodedPayload, password, secret);
  if (!safeEqual(Buffer.from(receivedSignature), Buffer.from(expectedSignature))) return false;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<SessionPayload>;
    const now = Math.floor(Date.now() / 1000);
    return payload.v === 1
      && Number.isInteger(payload.iat)
      && Number.isInteger(payload.exp)
      && typeof payload.nonce === "string"
      && payload.nonce.length >= 16
      && (payload.iat as number) <= now + 60
      && (payload.exp as number) > now
      && (payload.exp as number) - (payload.iat as number) === SESSION_SECONDS;
  } catch {
    return false;
  }
}

function loginFingerprint(rawFingerprint: string, secret: string) {
  return createHmac("sha256", secret).update(rawFingerprint.slice(0, 512)).digest("hex");
}

function loginBlocked(key: string) {
  const current = loginWindows.get(key);
  if (!current) return false;
  if (Date.now() - current.startedAt >= LOGIN_WINDOW_MS) {
    loginWindows.delete(key);
    return false;
  }
  return current.failures >= MAX_FAILED_ATTEMPTS;
}

function recordFailedLogin(key: string) {
  const now = Date.now();
  const current = loginWindows.get(key);
  if (!current || now - current.startedAt >= LOGIN_WINDOW_MS) {
    loginWindows.set(key, { startedAt: now, failures: 1 });
  } else {
    current.failures += 1;
  }

  if (loginWindows.size > 1_000) {
    for (const [entryKey, entry] of loginWindows) {
      if (now - entry.startedAt >= LOGIN_WINDOW_MS) loginWindows.delete(entryKey);
    }
  }
}

/**
 * El límite es una barrera local complementaria al Firewall de Vercel. Nunca
 * conserva IP, user-agent o contraseña en claro y la respuesta es genérica.
 */
export async function authenticateAdmin(password: string, rawFingerprint = "unknown") {
  const config = configuration();
  if (!config) return false;
  const fingerprint = loginFingerprint(rawFingerprint, config.secret);
  if (loginBlocked(fingerprint)) return false;

  const received = digest(password, config.secret);
  const expected = digest(config.password, config.secret);
  if (!safeEqual(received, expected)) {
    recordFailedLogin(fingerprint);
    return false;
  }

  loginWindows.delete(fingerprint);
  const jar = await cookies();
  jar.set(COOKIE_NAME, createSessionToken(config.password, config.secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  return true;
}

export async function isAdmin() {
  const config = configuration();
  if (!config) return false;
  const jar = await cookies();
  const current = jar.get(COOKIE_NAME)?.value;
  return Boolean(current && validSessionToken(current, config.password, config.secret));
}

export async function clearAdminSession() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

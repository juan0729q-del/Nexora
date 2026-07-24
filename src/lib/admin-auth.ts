import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "nexora_admin";
function configuration() { const password = process.env.ADMIN_PASSWORD; const secret = process.env.ADMIN_SESSION_SECRET; return password && secret ? { password, secret } : null; }
function token(password: string, secret: string) { return createHmac("sha256", secret).update(password).digest("hex"); }
export async function authenticateAdmin(password: string) { const config = configuration(); if (!config) return false; const received = Buffer.from(password); const expected = Buffer.from(config.password); if (received.length !== expected.length || !timingSafeEqual(received, expected)) return false; const jar = await cookies(); jar.set(COOKIE_NAME, token(config.password, config.secret), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 60 * 60 * 8 }); return true; }
export async function isAdmin() { const config = configuration(); if (!config) return false; const jar = await cookies(); const current = jar.get(COOKIE_NAME)?.value; const expected = token(config.password, config.secret); return Boolean(current && current.length === expected.length && timingSafeEqual(Buffer.from(current), Buffer.from(expected))); }
export async function clearAdminSession() { const jar = await cookies(); jar.delete(COOKIE_NAME); }

import "server-only";

import { createPublicKey, timingSafeEqual, verify, type JsonWebKey } from "node:crypto";
import { getCjCredentialConfiguration } from "./cj-client";

const githubActionsIssuer = "https://token.actions.githubusercontent.com";
const githubActionsJwksUrl = `${githubActionsIssuer}/.well-known/jwks`;
const githubActionsAudience = "nexora-catalog-import";
const githubActionsRepository = "juan0729q-del/Nexora";
const githubActionsWorkflowRefs = new Set([
  "juan0729q-del/Nexora/.github/workflows/sync-cj-catalog.yml@refs/heads/main",
  "juan0729q-del/Nexora/.github/workflows/enrich-cj-product-details.yml@refs/heads/main",
]);
const jwksCacheDurationMs = 60 * 60 * 1_000;

type JwtHeader = { alg?: unknown; kid?: unknown; typ?: unknown };
type JwtClaims = {
  aud?: unknown;
  exp?: unknown;
  iat?: unknown;
  iss?: unknown;
  nbf?: unknown;
  ref?: unknown;
  repository?: unknown;
  sub?: unknown;
  workflow_ref?: unknown;
};

type GithubJwk = {
  alg?: string;
  e?: string;
  kid?: string;
  kty?: string;
  n?: string;
  use?: string;
};

let cachedGithubJwks: GithubJwk[] | undefined;
let githubJwksExpiresAt = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function secureBearerMatch(authorization: string | null, expectedSecret: string | undefined) {
  if (!authorization?.startsWith("Bearer ") || !expectedSecret) return false;
  const actual = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(expectedSecret);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function decodeJwtPart<T extends Record<string, unknown>>(value: string): T | undefined {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) return undefined;
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    return isRecord(parsed) ? parsed as T : undefined;
  } catch {
    return undefined;
  }
}

function audienceIncludes(value: unknown, expected: string) {
  return value === expected || (Array.isArray(value) && value.some((entry) => entry === expected));
}

function numericClaim(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isUsableGithubJwk(value: unknown): value is GithubJwk {
  if (!isRecord(value)) return false;
  return value.kty === "RSA" && typeof value.kid === "string" && typeof value.n === "string" && typeof value.e === "string";
}

async function githubJwks(forceRefresh = false) {
  if (!forceRefresh && cachedGithubJwks && Date.now() < githubJwksExpiresAt) return cachedGithubJwks;

  const response = await fetch(githubActionsJwksUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error("GitHub OIDC JWKS unavailable");

  const payload = await response.json() as unknown;
  const keys = isRecord(payload) && Array.isArray(payload.keys) ? payload.keys.filter(isUsableGithubJwk) : [];
  if (!keys.length) throw new Error("GitHub OIDC JWKS has no usable keys");

  cachedGithubJwks = keys;
  githubJwksExpiresAt = Date.now() + jwksCacheDurationMs;
  return keys;
}

function verifyJwtSignature(parts: readonly string[], key: GithubJwk) {
  try {
    const publicKey = createPublicKey({ key: key as JsonWebKey, format: "jwk" });
    return verify(
      "RSA-SHA256",
      Buffer.from(`${parts[0]}.${parts[1]}`),
      publicKey,
      Buffer.from(parts[2], "base64url"),
    );
  } catch {
    return false;
  }
}

/**
 * Permite al único workflow de sincronización de este repositorio autenticarse
 * sin copiar CRON_SECRET a GitHub. Se valida firma RS256, issuer, audiencia,
 * repositorio, rama y archivo del workflow antes de aceptar la petición.
 */
async function hasValidGithubActionsOidcAuthorization(authorization: string | null) {
  if (!authorization?.startsWith("Bearer ")) return false;
  const token = authorization.slice("Bearer ".length);
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const header = decodeJwtPart<JwtHeader>(parts[0]);
  const claims = decodeJwtPart<JwtClaims>(parts[1]);
  if (!header || !claims || header.alg !== "RS256" || header.typ !== "JWT" || typeof header.kid !== "string") return false;

  const now = Math.floor(Date.now() / 1_000);
  const exp = numericClaim(claims.exp);
  const nbf = numericClaim(claims.nbf);
  const iat = numericClaim(claims.iat);
  const validClaims = claims.iss === githubActionsIssuer
    && audienceIncludes(claims.aud, githubActionsAudience)
    && claims.repository === githubActionsRepository
    && claims.ref === "refs/heads/main"
    && typeof claims.workflow_ref === "string"
    && githubActionsWorkflowRefs.has(claims.workflow_ref)
    && typeof claims.sub === "string"
    && typeof exp === "number" && exp > now - 30
    && (nbf === undefined || nbf <= now + 30)
    && (iat === undefined || iat <= now + 30);
  if (!validClaims) return false;

  try {
    let keys = await githubJwks();
    let key = keys.find((candidate) => candidate.kid === header.kid && (candidate.alg === undefined || candidate.alg === "RS256") && (candidate.use === undefined || candidate.use === "sig"));
    if (!key) {
      keys = await githubJwks(true);
      key = keys.find((candidate) => candidate.kid === header.kid && (candidate.alg === undefined || candidate.alg === "RS256") && (candidate.use === undefined || candidate.use === "sig"));
    }
    return Boolean(key && verifyJwtSignature(parts, key));
  } catch {
    // No se degrada la protección si GitHub no está disponible; se devuelve 401.
    return false;
  }
}

/** Centraliza la protección de procesos iniciados por Vercel Cron o un agente de IA. */
export function hasValidCronAuthorization(authorization: string | null) {
  return secureBearerMatch(authorization, process.env.CRON_SECRET);
}

/**
 * La importación acepta un secreto de operador o una identidad OIDC firmada por
 * GitHub Actions. El segundo camino evita guardar una copia de CRON_SECRET en
 * GitHub y queda limitado a los dos workflows versionados de CJ en main.
 */
export async function hasValidCatalogImportAuthorization(authorization: string | null) {
  return hasValidCronAuthorization(authorization)
    || secureBearerMatch(authorization, process.env.CATALOG_IMPORT_SECRET)
    || hasValidGithubActionsOidcAuthorization(authorization);
}

export function getAutomationConfiguration() {
  const cjCredential = getCjCredentialConfiguration();
  return {
    cronConfigured: Boolean(process.env.CRON_SECRET),
    supplierConfigured: cjCredential.configured,
    supplierUsingLegacyCredentialName: cjCredential.usingLegacyName,
    productDiscoveryConfigured: cjCredential.configured,
    productSyncConfigured: Boolean(process.env.CJ_DROPSHIPPING_PRODUCT_SYNC_URL && cjCredential.configured),
    adminSessionConfigured: Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_SESSION_SECRET),
    catalogAutomationEnabled: process.env.CATALOG_AUTOMATION_ENABLED !== "false",
  };
}

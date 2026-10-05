const OFFICIAL_ORIGIN = "https://api.rocketfy.co";

export class RocketfyConfigurationError extends Error {}

export function rocketfyBaseUrl(env: Record<string, string | undefined> = process.env) {
  const configured = env.ROCKETFY_API_BASE_URL?.trim() || OFFICIAL_ORIGIN;
  let url: URL;
  try { url = new URL(configured); } catch { throw new RocketfyConfigurationError("ROCKETFY_API_BASE_URL no es una URL válida."); }
  if (url.protocol !== "https:" || url.origin !== OFFICIAL_ORIGIN || (url.pathname !== "/" && url.pathname !== "")) {
    throw new RocketfyConfigurationError("Rocketfy debe usar exclusivamente https://api.rocketfy.co.");
  }
  return OFFICIAL_ORIGIN;
}

const allowedPaths = new Set([
  "/api/public/connect",
  "/api/public/calculateShipping",
  "/api/public/createOrder",
  "/api/public/shippings/get",
]);

export function rocketfyRequestUrl(path: string, env: Record<string, string | undefined> = process.env) {
  if (!allowedPaths.has(path)) throw new RocketfyConfigurationError("La operación solicitada no pertenece al contrato público verificado de Rocketfy.");
  return `${rocketfyBaseUrl(env)}${path}`;
}

export function rocketfyCommerceEnabled(env: Record<string, string | undefined> = process.env) {
  return env.ROCKETFY_LOCAL_COMMERCE_ENABLED?.trim().toLowerCase() === "true";
}

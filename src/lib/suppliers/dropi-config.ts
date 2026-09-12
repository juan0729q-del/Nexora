const origins = { test: "https://test-api.dropi.co", production: "https://api.dropi.co" };

export function dropiBaseUrl(env: Record<string, string | undefined> = process.env) {
  const environment = env.DROPI_ENVIRONMENT?.trim() || "test";
  if (environment !== "test" && environment !== "production") throw new Error("DROPI_ENVIRONMENT debe ser test o production.");
  const url = new URL(env.DROPI_API_BASE_URL?.trim() || `${origins[environment]}/integrations`);
  if (url.origin !== origins[environment] || url.username || url.password || url.search || url.hash || url.pathname.replace(/\/$/, "") !== "/integrations") {
    throw new Error("La URL Dropi debe usar el host oficial del ambiente y /integrations.");
  }
  return `${url.origin}/integrations`;
}

export function dropiRequestUrl(path: string, env: Record<string, string | undefined> = process.env) {
  const base = dropiBaseUrl(env);
  const url = new URL(`${base}/${path.replace(/^\//, "")}`);
  if (url.origin !== new URL(base).origin || !url.pathname.startsWith("/integrations/") || path.includes("..") || path.includes("\\") || url.hash) throw new Error("Ruta Dropi inválida.");
  return url.toString();
}

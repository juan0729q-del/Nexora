import { dropiBaseUrl, dropiRequestUrl } from "../src/lib/suppliers/dropi-config.ts";

try { process.loadEnvFile(); } catch { /* Environment may be injected by the caller. */ }
const environment = process.argv.includes("--production") ? "production" : "test";
const config = { DROPI_ENVIRONMENT: environment };
const key = process.env.DROPI_INTEGRATION_KEY?.trim() || process.env.DROPI_API_KEY?.trim();
if (!key) throw new Error("Falta la clave Dropi del servidor.");
const response = await fetch(dropiRequestUrl("/products/index", config), {
  method: "POST", headers: { "dropi-integration-key": key, "Content-Type": "application/json", Accept: "application/json" },
  body: JSON.stringify({ pageSize: 1, startData: 0, no_count: true }),
  redirect: "error", signal: AbortSignal.timeout(12000),
});
const payload = await response.json().catch(() => null);
const ok = response.ok && payload?.isSuccess === true;
console.log(JSON.stringify({ environment, baseUrl: dropiBaseUrl(config), httpStatus: response.status, authenticated: ok,
  detail: ok ? "Consulta de productos aceptada; revisar esquema antes de importar." : "Dropi no autorizó o no confirmó la consulta. No se importó ni creó ningún pedido." }, null, 2));
if (!ok) process.exitCode = 1;

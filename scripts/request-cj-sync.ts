import { readFile, writeFile, appendFile } from "node:fs/promises";
import { recoverCatalogRead, type SyncPayload } from "../src/lib/automation/sync-recovery";

const mode = process.argv[2];
if (mode !== "inventory" && mode !== "discovery") throw new Error("Modo de sincronización inválido.");
const catalog = JSON.parse(await readFile("src/data/catalog.json", "utf8"));
const url = new URL(process.env.NEXORA_CATALOG_IMPORT_URL || "");
if (url.protocol !== "https:" || url.username || url.password) throw new Error("Endpoint de sincronización inválido.");
url.searchParams.set("mode", mode);
url.searchParams.set("version", String(catalog.version));
const expectedSkus: string[] | undefined = mode === "inventory" ? catalog.products.filter((p: { supplier: { source?: string } }) => p.supplier.source !== "dropi").map((p: { sku: string }) => p.sku) : undefined;
const result = await recoverCatalogRead(async () => {
  const tokenUrl = new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL || "");
  tokenUrl.searchParams.set("audience", "nexora-catalog-import");
  const tokenResponse = await fetch(tokenUrl, { headers: { Authorization: `bearer ${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` }, signal: AbortSignal.timeout(15_000) });
  if (!tokenResponse.ok) return { status: 401, payload: { message: "No se pudo autenticar GitHub Actions." } };
  const token = (await tokenResponse.json()).value;
  if (!token) return { status: 401, payload: { message: "GitHub no entregó una identidad válida." } };
  const response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(70_000) });
  const raw = await response.json().catch(() => null);
  const payload: SyncPayload = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : { message: "Respuesta no interpretable." };
  console.log(`Consulta ${mode}: HTTP ${response.status}; ${payload.updates?.length ?? payload.products?.length ?? 0} registros recibidos.`);
  return { status: response.status, payload };
}, ms => new Promise(resolve => setTimeout(resolve, ms)), expectedSkus);

await writeFile(`.catalog-${mode}.json`, JSON.stringify(result.payload, null, 2));
const usable = result.status === 200 && (mode === "inventory" ? Boolean(result.payload.updates?.length) : Boolean(result.payload.products?.length));
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `usable=${usable}\ncomplete=${result.payload.complete !== false}\n`);
if (!usable) throw new Error(`No se obtuvo una sincronización utilizable (HTTP ${result.status}). El catálogo permanece intacto.`);

import { readFile, writeFile, appendFile } from "node:fs/promises";
import { hasCompleteEditorial } from "../src/lib/product-presentation";
import type { Product } from "../src/lib/products";

const payload = JSON.parse(await readFile(".catalog-discovery.json", "utf8"));
if (!Array.isArray(payload.products) || !payload.products.length) throw new Error("No hay candidatos oficiales para revisar.");
const pending = (payload.products as Product[]).filter(product => !hasCompleteEditorial(product, "co") || !hasCompleteEditorial(product, "us"));
await writeFile("src/data/catalog-candidates.json", `${JSON.stringify({ observedAt: new Date().toISOString(), products: pending }, null, 2)}\n`);
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `publishable=${pending.length === 0}\n`);
console.log(`${pending.length} novedades pendientes de edición; el inventario operativo se sincroniza de forma independiente.`);

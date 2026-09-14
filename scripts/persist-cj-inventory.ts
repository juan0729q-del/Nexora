import { readFile, writeFile } from "node:fs/promises";
import { applyInventoryUpdates } from "../src/lib/automation/inventory-sync-policy";

const catalogPath = "src/data/catalog.json";
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const payload = JSON.parse(await readFile(".catalog-inventory.json", "utf8"));
if (!Array.isArray(payload.updates)) throw new Error("La respuesta no contiene actualizaciones verificadas.");
const next = applyInventoryUpdates(catalog, payload.updates, payload.baseVersion);
await writeFile(catalogPath, `${JSON.stringify(next, null, 2)}\n`);
console.log(`Inventario confirmado: ${next.stockSync.verifiedCount}/${next.stockSync.totalCount}. Actualización ${next.stockSync.complete ? "completa" : "parcial"}.`);

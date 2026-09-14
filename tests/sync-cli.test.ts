import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { resolve, join, sep } from "node:path";
import catalog from "../src/data/catalog.json";

test("los scripts de sincronización arrancan y una novedad sin edición no altera inventario", async () => {
  const root = resolve("tmp");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, "sync-cli-"));
  const execute = (name: string, args: string[] = []) => spawnSync(process.execPath, ["--import", "tsx", resolve("scripts", name), ...args], {
    cwd: directory, encoding: "utf8",
    env: { ...process.env, GITHUB_OUTPUT: join(directory, "outputs.txt"), ACTIONS_ID_TOKEN_REQUEST_URL: "", ACTIONS_ID_TOKEN_REQUEST_TOKEN: "" },
  });
  try {
    const request = execute("request-cj-sync.ts", ["invalid"]);
    assert.equal(request.status, 1);
    assert.match(request.stderr, /Modo de sincronización inválido/);
    assert.doesNotMatch(request.stderr, /Transform failed|Top-level await/);
    await mkdir(join(directory, "src/data"), { recursive: true });
    await writeFile(join(directory, "src/data/catalog.json"), JSON.stringify(catalog));
    await writeFile(join(directory, ".catalog-inventory.json"), JSON.stringify({ baseVersion: catalog.version, updates: catalog.products.map(p => ({ sku: p.sku, stock: p.stock, verifiedAt: "2026-09-13T20:00:00.000Z" })) }));
    const persist = execute("persist-cj-inventory.ts");
    assert.equal(persist.status, 0, persist.stderr);
    const refreshed = await readFile(join(directory, "src/data/catalog.json"), "utf8");
    assert.equal(JSON.parse(refreshed).stockSync.complete, true);
    await writeFile(join(directory, ".catalog-discovery.json"), JSON.stringify({ products: [{ ...catalog.products[0], sku: "PENDING-EDITORIAL" }] }));
    const review = execute("review-catalog-candidates.ts");
    assert.equal(review.status, 0, review.stderr);
    assert.equal((await readFile(join(directory, "src/data/catalog.json"), "utf8")), refreshed);
    assert.equal(JSON.parse(await readFile(join(directory, "src/data/catalog-candidates.json"), "utf8")).products.length, 1);
  } finally {
    if (!resolve(directory).startsWith(root + sep + "sync-cli-")) throw new Error("Ruta temporal inesperada");
    await rm(directory, { recursive: true, force: true });
  }
});

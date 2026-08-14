import assert from "node:assert/strict";
import test from "node:test";
import catalogDocument from "../src/data/catalog.json";
import { cartPath, categoryPath, formatMoney, localizedPathForMarket, productPath } from "../src/lib/i18n/config";
import { getLocalizedPackageContents, getLocalizedSpecifications, getProductPresentation, hasCompleteEditorial, localizeVariantOption, toStorefrontProduct } from "../src/lib/product-presentation";
import type { Product } from "../src/lib/products";

const products = catalogDocument.products as Product[];

test("cada producto real tiene contenido editorial completo para CO y US", () => {
  assert.equal(products.length, 15);
  for (const product of products) {
    assert.equal(hasCompleteEditorial(product, "co"), true, `${product.sku} no tiene editorial CO`);
    assert.equal(hasCompleteEditorial(product, "us"), true, `${product.sku} no tiene editorial US`);
    for (const market of ["co", "us"] as const) {
      const copy = getProductPresentation(product, market);
      assert.ok(copy.title.length >= 8);
      assert.ok(copy.metaDescription.length >= 50);
      assert.ok(copy.detailDescription.length >= 60);
      assert.ok(copy.imageAlt.length >= 8);
      assert.ok(copy.benefits.length > 0);
      assert.ok(copy.features.length > 0);
      assert.ok(copy.warnings.length > 0);
    }
  }
});

test("las URLs localizadas mantienen una contraparte estable", () => {
  const product = products[0];
  assert.equal(productPath("co", product.slug), `/co/productos/${product.slug}`);
  assert.equal(productPath("us", product.slug), `/us/products/${product.slug}`);
  assert.equal(localizedPathForMarket(`/co/productos/${product.slug}`, "us"), `/us/products/${product.slug}`);
  assert.equal(localizedPathForMarket("/us/technology-and-home", "co"), categoryPath("co", "technologyHome"));
  assert.equal(localizedPathForMarket("/co/carrito", "us"), cartPath("us"));
});

test("el formateo comercial no mezcla monedas", () => {
  assert.match(formatMoney(13_400, "co"), /13[.\s]?400/);
  assert.match(formatMoney(12.5, "us"), /\$12\.50/);
});

test("el catálogo conserva exclusivamente imágenes oficiales de proveedor", () => {
  for (const product of products) {
    assert.equal(product.supplier.name, "CJ Dropshipping");
    assert.ok(product.images.length > 0);
    assert.ok(product.images.some((image) => image.src === product.image.src));
    assert.ok(product.images.every((image) => image.source === "provider" && image.src.startsWith("https://")));
  }
});

test("las etiquetas públicas neutralizan términos clínicos sin alterar los datos CJ", () => {
  assert.equal(
    localizeVariantOption("Red black-Acupuncture magnetic therapy-3English", "co"),
    "Rojo Negro-Superficie texturizada con piezas magnéticas-3Manual en inglés",
  );
  assert.equal(
    localizeVariantOption("Red black-Acupuncture magnetic therapy-3English", "us"),
    "Red black-Textured surface with magnetic inserts-3English manual",
  );

  const source = products.find((product) => product.variants.some((variant) => /acupuncture magnetic therapy/i.test(variant.options || "")));
  assert.ok(source);
  const originalOption = source.variants.find((variant) => /acupuncture magnetic therapy/i.test(variant.options || ""))?.options;
  assert.match(originalOption || "", /acupuncture magnetic therapy/i);
  const storefront = toStorefrontProduct(source, "co");
  assert.ok(storefront.variants.every((variant) => !/acupuncture|therapy/i.test(`${variant.label} ${variant.image?.alt || ""}`)));
  for (const market of ["co", "us"] as const) {
    const specifications = getLocalizedSpecifications(source, market);
    const packageContents = getLocalizedPackageContents(source, market);
    assert.ok(specifications.every((entry) => !/health massage|lumbar massage board/i.test(`${entry.label} ${entry.value}`)));
    assert.ok(packageContents.every((entry) => !/back massager/i.test(entry)));
  }
});

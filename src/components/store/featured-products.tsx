import { getStoreCatalog } from "@/lib/catalog-store";
import { toStorefrontProduct } from "@/lib/product-presentation";
import { ProductCard } from "./product-card";

export async function FeaturedProducts() {
  const products = (await getStoreCatalog()).map((product) => toStorefrontProduct(product));
  return <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{products.map((product, index) => <ProductCard key={product.slug} product={product} priority={index === 0} />)}</div>;
}

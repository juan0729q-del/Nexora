import { products } from "@/lib/products";
import { ProductCard } from "./product-card";
export function FeaturedProducts() { return <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{products.filter((product) => product.active).map((product, index) => <ProductCard key={product.slug} product={product} priority={index === 0} />)}</div>; }

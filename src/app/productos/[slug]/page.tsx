import { permanentRedirect } from "next/navigation";
import { getProduct } from "@/lib/catalog-store";
import { productPath } from "@/lib/i18n/config";
import { isStoreProductAvailable } from "@/lib/products";

export const metadata = { robots: { index: false, follow: true } };

export default async function LegacyProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProduct(slug);
  permanentRedirect(productPath("co", product && isStoreProductAvailable(product) ? product.slug : slug));
}

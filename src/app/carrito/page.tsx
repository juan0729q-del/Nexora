import type { Metadata } from "next";
import { CartCheckout } from "@/components/store/cart-checkout";
import { StoreFooter } from "@/components/store/store-footer";
import { StoreHeader } from "@/components/store/store-header";
import { getCatalog } from "@/lib/catalog-store";
import { toStorefrontProduct } from "@/lib/product-presentation";

export const metadata: Metadata = {
  title: "Carrito y envío",
  description: "Revisa cantidades, variantes y opciones de envío oficiales de CJ antes de pagar con Wompi.",
  alternates: { canonical: "/carrito" },
  robots: { index: false, follow: true },
};

export default async function CartPage() {
  const products = (await getCatalog()).map(toStorefrontProduct);
  return <>
    <StoreHeader />
    <main className="mx-auto min-h-[70vh] max-w-7xl px-5 py-10 sm:px-8 lg:px-12">
      <CartCheckout products={products} />
    </main>
    <StoreFooter />
  </>;
}

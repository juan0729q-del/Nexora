import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Carrito y envío",
  description: "Revisa cantidades, estilos y opciones de envío oficiales de CJ antes de pagar con Wompi.",
  robots: { index: false, follow: true },
};

export default async function CartPage() {
  permanentRedirect("/co/carrito");
}

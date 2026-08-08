"use client";

import { createContext, useContext, useMemo, useState } from "react";

type ProductVariantContextValue = {
  variantSku: string;
  setVariantSku: (value: string) => void;
};

const ProductVariantContext = createContext<ProductVariantContextValue | null>(null);

export function ProductVariantProvider({ initialSku = "", children }: { initialSku?: string; children: React.ReactNode }) {
  const [variantSku, setVariantSku] = useState(initialSku);
  const value = useMemo(() => ({ variantSku, setVariantSku }), [variantSku]);
  return <ProductVariantContext.Provider value={value}>{children}</ProductVariantContext.Provider>;
}

export function useOptionalProductVariant() {
  return useContext(ProductVariantContext);
}

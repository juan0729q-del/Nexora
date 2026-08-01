"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type CartItem = {
  productSlug: string;
  variantSku: string;
  quantity: number;
};

type CartContextValue = {
  items: CartItem[];
  itemCount: number;
  addItem: (item: CartItem) => void;
  updateQuantity: (productSlug: string, variantSku: string, quantity: number) => void;
  removeItem: (productSlug: string, variantSku: string) => void;
  clearCart: () => void;
};

const storageKey = "nexora-cart-v1";
export const maxCartLines = 6;
export const maxCartUnits = 20;
export const maxUnitsPerLine = 10;
const CartContext = createContext<CartContextValue | null>(null);

function validStoredItems(value: unknown): CartItem[] {
  if (!Array.isArray(value)) return [];
  const items = value.slice(0, maxCartLines).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Partial<CartItem>;
    if (typeof item.productSlug !== "string" || typeof item.variantSku !== "string"
      || !Number.isInteger(item.quantity) || (item.quantity || 0) < 1 || (item.quantity || 0) > maxUnitsPerLine) return [];
    return [{ productSlug: item.productSlug, variantSku: item.variantSku, quantity: item.quantity as number }];
  });
  const accepted: CartItem[] = [];
  let total = 0;
  for (const item of items) {
    if (total + item.quantity > maxCartUnits) break;
    accepted.push(item);
    total += item.quantity;
  }
  return accepted;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      try {
        setItems(validStoredItems(JSON.parse(window.localStorage.getItem(storageKey) || "[]")));
      } catch {
        setItems([]);
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(handle);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(storageKey, JSON.stringify(items));
  }, [hydrated, items]);

  const addItem = useCallback((item: CartItem) => {
    setItems((current) => {
      const index = current.findIndex((entry) => entry.productSlug === item.productSlug && entry.variantSku === item.variantSku);
      const total = current.reduce((sum, entry) => sum + entry.quantity, 0);
      const requested = Math.min(maxUnitsPerLine, Math.max(1, item.quantity));
      if (index < 0) return current.length >= maxCartLines || total + requested > maxCartUnits
        ? current
        : [...current, { ...item, quantity: requested }];
      const nextQuantity = Math.min(maxUnitsPerLine, current[index].quantity + requested);
      if (total - current[index].quantity + nextQuantity > maxCartUnits) return current;
      return current.map((entry, currentIndex) => currentIndex === index
        ? { ...entry, quantity: nextQuantity }
        : entry);
    });
  }, []);

  const updateQuantity = useCallback((productSlug: string, variantSku: string, quantity: number) => {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxUnitsPerLine) return;
    setItems((current) => {
      const target = current.find((item) => item.productSlug === productSlug && item.variantSku === variantSku);
      if (!target) return current;
      const total = current.reduce((sum, item) => sum + item.quantity, 0);
      if (total - target.quantity + quantity > maxCartUnits) return current;
      return current.map((item) => item === target ? { ...item, quantity } : item);
    });
  }, []);

  const removeItem = useCallback((productSlug: string, variantSku: string) => {
    setItems((current) => current.filter((item) => item.productSlug !== productSlug || item.variantSku !== variantSku));
  }, []);

  const clearCart = useCallback(() => setItems([]), []);
  const value = useMemo<CartContextValue>(() => ({
    items,
    itemCount: items.reduce((total, item) => total + item.quantity, 0),
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
  }), [addItem, clearCart, items, removeItem, updateQuantity]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart debe usarse dentro de CartProvider");
  return context;
}

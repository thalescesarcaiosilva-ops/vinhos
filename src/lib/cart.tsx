import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePurchaseGift, type PurchaseGiftProduct } from "@/lib/purchase-gift";

export type CartItem = {
  id: string;
  name: string;
  slug: string;
  price: number;
  image: string | null;
  quantity: number;
  isGift?: boolean;
};

type CartContextValue = {
  items: CartItem[];
  add: (item: Omit<CartItem, "quantity" | "isGift">, qty?: number) => void;
  remove: (id: string) => void;
  setQty: (id: string, qty: number) => void;
  clear: () => void;
  subtotal: number;
  count: number;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  setDrawerOpen: (open: boolean) => void;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "vinoteca_cart_v1";

function isGiftLine(item: CartItem, giftId?: string | null): boolean {
  return Boolean(item.isGift) || Boolean(giftId && item.id === giftId);
}

function applyPurchaseGiftLine(items: CartItem[], gift: PurchaseGiftProduct | null): CartItem[] {
  const paid = items.filter((item) => !isGiftLine(item, gift?.id));
  if (!gift || gift.stock <= 0 || paid.length === 0) return paid;

  const giftItem: CartItem = {
    id: gift.id,
    name: gift.name,
    slug: gift.slug,
    price: 0,
    image: gift.image_url,
    quantity: 1,
    isGift: true,
  };

  const current = items[items.length - 1];
  if (
    items.length === paid.length + 1 &&
    current &&
    isGiftLine(current, gift.id) &&
    current.price === 0 &&
    current.quantity === 1 &&
    current.isGift
  ) {
    return items;
  }

  return [...paid, giftItem];
}

function cartItemsEqual(a: CartItem[], b: CartItem[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every(
    (item, i) =>
      item.id === b[i].id &&
      item.quantity === b[i].quantity &&
      item.price === b[i].price &&
      Boolean(item.isGift) === Boolean(b[i].isGift),
  );
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data: gift, isFetched } = usePurchaseGift();

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      if (raw) setItems(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    if (!isFetched) return;
    setItems((prev) => {
      const next = applyPurchaseGiftLine(prev, gift ?? null);
      return cartItemsEqual(prev, next) ? prev : next;
    });
  }, [gift, isFetched, items]);

  useEffect(() => {
    if (typeof window !== "undefined")
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const value = useMemo<CartContextValue>(() => ({
    items,
    add: (item, qty = 1) => {
      setItems((prev) => {
        const withPaid = prev.filter((p) => !isGiftLine(p, gift?.id));
        const idx = withPaid.findIndex((p) => p.id === item.id);
        let nextPaid: CartItem[];
        if (gift && item.id === gift.id) {
          nextPaid = withPaid;
        } else if (idx >= 0) {
          nextPaid = [...withPaid];
          nextPaid[idx] = { ...nextPaid[idx], quantity: nextPaid[idx].quantity + qty };
        } else {
          nextPaid = [...withPaid, { ...item, quantity: qty }];
        }
        return applyPurchaseGiftLine(nextPaid, gift ?? null);
      });
      setDrawerOpen(true);
    },
    remove: (id) =>
      setItems((prev) => {
        const target = prev.find((p) => p.id === id);
        if (target && isGiftLine(target, gift?.id)) return prev;
        return applyPurchaseGiftLine(
          prev.filter((p) => p.id !== id),
          gift ?? null,
        );
      }),
    setQty: (id, qty) =>
      setItems((prev) => {
        const target = prev.find((p) => p.id === id);
        if (target && isGiftLine(target, gift?.id)) return prev;
        return applyPurchaseGiftLine(
          prev.map((p) => (p.id === id ? { ...p, quantity: Math.max(1, qty) } : p)),
          gift ?? null,
        );
      }),
    clear: () => setItems([]),
    subtotal: items.reduce((s, i) => s + i.price * i.quantity, 0),
    count: items.filter((i) => !i.isGift).reduce((s, i) => s + i.quantity, 0),
    drawerOpen,
    openDrawer: () => setDrawerOpen(true),
    closeDrawer: () => setDrawerOpen(false),
    setDrawerOpen,
  }), [items, drawerOpen, gift]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}

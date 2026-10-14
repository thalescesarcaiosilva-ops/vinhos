import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  useFirstPurchaseEligible,
  usePurchaseGift,
  type PurchaseGiftProduct,
} from "@/lib/purchase-gift";

export type CartItem = {
  id: string;
  name: string;
  slug: string;
  price: number;
  image: string | null;
  quantity: number;
  isGift?: boolean;
  catalogPrice?: number;
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

function applyPurchaseGiftLine(
  items: CartItem[],
  gift: PurchaseGiftProduct | null,
  eligible: boolean,
): CartItem[] {
  const paid = items.filter((item) => !item.isGift);
  const hasPaidGiftSku = Boolean(gift && paid.some((item) => item.id === gift.id));
  const hasOtherPaid = paid.some((item) => !gift || item.id !== gift.id);

  if (!eligible || !gift || gift.stock <= 0 || !hasOtherPaid || hasPaidGiftSku) {
    return paid;
  }

  const giftItem: CartItem = {
    id: gift.id,
    name: gift.name,
    slug: gift.slug,
    price: 0,
    image: gift.image_url,
    quantity: 1,
    isGift: true,
    catalogPrice: Number(gift.price) || undefined,
  };

  const current = items[items.length - 1];
  if (
    items.length === paid.length + 1 &&
    current?.isGift &&
    current.id === gift.id &&
    current.price === 0 &&
    current.quantity === 1
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
  const { eligible, ready } = useFirstPurchaseEligible();

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      if (raw) setItems(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    if (!isFetched || !ready) return;
    setItems((prev) => {
      const next = applyPurchaseGiftLine(prev, gift ?? null, eligible);
      return cartItemsEqual(prev, next) ? prev : next;
    });
  }, [gift, isFetched, items, eligible, ready]);

  useEffect(() => {
    if (typeof window !== "undefined")
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const value = useMemo<CartContextValue>(() => ({
    items,
    add: (item, qty = 1) => {
      setItems((prev) => {
        const paid = prev.filter((p) => !p.isGift);
        const idx = paid.findIndex((p) => p.id === item.id);
        let nextPaid: CartItem[];
        if (idx >= 0) {
          nextPaid = [...paid];
          nextPaid[idx] = {
            ...nextPaid[idx],
            ...item,
            quantity: nextPaid[idx].quantity + qty,
            isGift: false,
          };
        } else {
          nextPaid = [...paid, { ...item, quantity: qty, isGift: false }];
        }
        return applyPurchaseGiftLine(nextPaid, gift ?? null, eligible);
      });
      setDrawerOpen(true);
    },
    remove: (id) =>
      setItems((prev) => {
        const target = prev.find((p) => p.id === id && !p.isGift) ?? prev.find((p) => p.id === id);
        if (target?.isGift) return prev;
        return applyPurchaseGiftLine(
          prev.filter((p) => !(p.id === id && !p.isGift)),
          gift ?? null,
          eligible,
        );
      }),
    setQty: (id, qty) =>
      setItems((prev) => {
        const target = prev.find((p) => p.id === id && !p.isGift);
        if (!target) return prev;
        return applyPurchaseGiftLine(
          prev.map((p) =>
            p.id === id && !p.isGift ? { ...p, quantity: Math.max(1, qty) } : p,
          ),
          gift ?? null,
          eligible,
        );
      }),
    clear: () => setItems([]),
    subtotal: items.reduce((s, i) => s + i.price * i.quantity, 0),
    count: items.filter((i) => !i.isGift).reduce((s, i) => s + i.quantity, 0),
    drawerOpen,
    openDrawer: () => setDrawerOpen(true),
    closeDrawer: () => setDrawerOpen(false),
    setDrawerOpen,
  }), [items, drawerOpen, gift, eligible]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}

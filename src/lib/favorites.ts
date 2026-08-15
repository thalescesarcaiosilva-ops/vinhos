import { useSyncExternalStore } from "react";
import { toast } from "sonner";

export type FavProduct = {
  id: string;
  name: string;
  slug: string;
  price: number;
  image: string | null;
  country?: string | null;
};

const KEY = "favorites_v1";
const EVENT = "favorites:changed";

function read(): FavProduct[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function write(list: FavProduct[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

// Cache snapshot to keep referential stability between calls.
// getServerSnapshot MUST return the same reference every call —
// returning `[]` allocates a new array and triggers an infinite loop in React.
const EMPTY_FAVORITES: FavProduct[] = [];
let snapshot: FavProduct[] = read();
let snapshotJson = JSON.stringify(snapshot);
function getSnapshot(): FavProduct[] {
  const current = read();
  const json = JSON.stringify(current);
  if (json !== snapshotJson) {
    snapshot = current;
    snapshotJson = json;
  }
  return snapshot;
}
function getServerSnapshot(): FavProduct[] {
  return EMPTY_FAVORITES;
}

export function useFavoritesList(): FavProduct[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useFavorites() {
  const list = useFavoritesList();
  return { data: new Set(list.map((p) => p.id)) };
}

export function useFavoritesCount(): number {
  return useFavoritesList().length;
}

export function addFavorite(product: FavProduct) {
  const list = read();
  if (list.some((p) => p.id === product.id)) return;
  write([...list, product]);
}

export function removeFavorite(id: string) {
  write(read().filter((p) => p.id !== id));
}

export function useToggleFavorite() {
  return {
    mutate: ({ product, isFav }: { product: FavProduct; isFav: boolean }) => {
      if (isFav) {
        removeFavorite(product.id);
        toast.success("Produto removido dos favoritos");
      } else {
        addFavorite(product);
        toast.success("Produto adicionado aos favoritos");
      }
    },
  };
}

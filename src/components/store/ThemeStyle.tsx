import { useStoreSettings } from "@/lib/store-settings";

/** Injects user-configurable color overrides as CSS variables on :root. */
export function ThemeStyle() {
  const { data } = useStoreSettings();
  if (!data) return null;
  const { primary, accent, buy, sectionTitle, productName, productPrice } = data.colors;
  const css = `:root{--primary:${primary};--ring:${primary};--wine:${primary};--accent:${accent};--gold:${accent};--buy:${buy};--section-title:${sectionTitle};--product-name:${productName};--product-price:${productPrice};}`;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { countries } from "@/lib/countries";
import { getSiteUrl } from "@/lib/site-url";
import { PRICE_RANGES } from "@/lib/collection-products";
import { canonicalCountryLabel } from "@/lib/country-aliases";

/** Cliente server-side com chave anon (leitura pública — não exige service_role na Vercel). */
function getPublicSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or VITE_* equivalents) for sitemap generation.",
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Rótulos do banco → slug em countries.ts (via label canônico). */
const labelToCountrySlug = new Map(countries.map((c) => [c.label, c.slug]));

export type SitemapUrl = {
  loc: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
};

function absolute(path: string): string {
  const base = getSiteUrl().replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function formatLastmod(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildRobotsTxt(): string {
  const sitemap = absolute("/sitemap.xml");
  return `# Galvao Vinhos — robots.txt
# https://developers.google.com/search/docs/crawling-indexing/robots/intro
# https://support.google.com/merchants/answer/12467444

User-agent: Googlebot
Disallow:
User-agent: Googlebot-image
Disallow:

User-agent: *
Allow: /

Sitemap: ${sitemap}
`;
}

export function getStaticSitemapUrls(): SitemapUrl[] {
  const urls: SitemapUrl[] = [];
  const seen = new Set<string>();
  const add = (path: string, opts: Omit<SitemapUrl, "loc"> = {}) => {
    const loc = absolute(path);
    if (seen.has(loc)) return;
    seen.add(loc);
    urls.push({ loc, ...opts });
  };

  add("/", { changefreq: "daily", priority: 1 });
  add("/product-feed.xml", { changefreq: "daily", priority: 0.5 });
  add("/fale-conosco", { changefreq: "monthly", priority: 0.5 });
  add("/quem-somos", { changefreq: "monthly", priority: 0.5 });
  add("/rastreio", { changefreq: "monthly", priority: 0.4 });
  return urls;
}

async function countrySlugsWithProducts(supabase: ReturnType<typeof getPublicSupabase>): Promise<string[]> {
  const { data, error } = await supabase
    .from("products")
    .select("country")
    .eq("is_active", true)
    .not("country", "is", null);
  if (error) throw error;

  const slugs = new Set<string>();
  for (const row of data ?? []) {
    const raw = row.country?.trim();
    if (!raw) continue;
    const label = canonicalCountryLabel(raw);
    const slug = labelToCountrySlug.get(label);
    if (slug) slugs.add(slug);
  }
  return [...slugs].sort();
}

async function categorySlugsWithProducts(
  supabase: ReturnType<typeof getPublicSupabase>,
): Promise<Array<{ slug: string; updated_at: string | null }>> {
  const { data, error } = await supabase
    .from("product_categories")
    .select("categories!inner(slug, updated_at, is_active), products!inner(is_active)")
    .eq("categories.is_active", true)
    .eq("products.is_active", true);
  if (error) throw error;

  const bySlug = new Map<string, string | null>();
  for (const row of data ?? []) {
    const cat = row.categories as { slug: string; updated_at: string | null } | null;
    if (cat?.slug && !bySlug.has(cat.slug)) bySlug.set(cat.slug, cat.updated_at ?? null);
  }
  return [...bySlug.entries()]
    .map(([slug, updated_at]) => ({ slug, updated_at }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

async function priceRangeSlugsWithProducts(
  supabase: ReturnType<typeof getPublicSupabase>,
): Promise<string[]> {
  const slugs: string[] = [];
  for (const [slug, range] of Object.entries(PRICE_RANGES)) {
    let q = supabase.from("products").select("id", { count: "exact", head: true }).eq("is_active", true);
    if (range.min != null) q = q.gte("price", range.min);
    if (range.max != null) q = q.lte("price", range.max);
    const { count, error } = await q;
    if (error) throw error;
    if ((count ?? 0) > 0) slugs.push(slug);
  }
  return slugs;
}

async function virtualSlugsWithProducts(
  supabase: ReturnType<typeof getPublicSupabase>,
): Promise<string[]> {
  const slugs: string[] = [];
  const { count: todosCount, error: todosErr } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);
  if (todosErr) throw todosErr;
  if ((todosCount ?? 0) > 0) slugs.push("todos");

  const { count: outletCount, error: outletErr } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true)
    .not("compare_at_price", "is", null);
  if (outletErr) throw outletErr;
  if ((outletCount ?? 0) > 0) slugs.push("outlet");

  return slugs;
}

export async function collectSitemapUrls(): Promise<SitemapUrl[]> {
  const urls = getStaticSitemapUrls();
  const seen = new Set(urls.map((u) => u.loc));

  const add = (path: string, opts: Omit<SitemapUrl, "loc"> = {}) => {
    const loc = absolute(path);
    if (seen.has(loc)) return;
    seen.add(loc);
    urls.push({ loc, ...opts });
  };

  const supabase = getPublicSupabase();

  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("products")
      .select("slug, updated_at")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    for (const product of data) {
      add(`/produto/${product.slug}`, {
        lastmod: formatLastmod(product.updated_at),
        changefreq: "weekly",
        priority: 0.8,
      });
    }
  }

  const [countrySlugs, categoryRows, priceSlugs, virtualSlugs] = await Promise.all([
    countrySlugsWithProducts(supabase),
    categorySlugsWithProducts(supabase),
    priceRangeSlugsWithProducts(supabase),
    virtualSlugsWithProducts(supabase),
  ]);

  for (const slug of countrySlugs) {
    add(`/colecao/${slug}`, { changefreq: "weekly", priority: 0.6 });
  }
  for (const slug of virtualSlugs) {
    add(`/colecao/${slug}`, { changefreq: "weekly", priority: 0.6 });
  }
  for (const slug of priceSlugs) {
    add(`/colecao/${slug}`, { changefreq: "weekly", priority: 0.6 });
  }
  for (const category of categoryRows) {
    add(`/colecao/${category.slug}`, {
      lastmod: formatLastmod(category.updated_at),
      changefreq: "weekly",
      priority: 0.7,
    });
  }

  const { data: settingsRow, error: settingsError } = await supabase
    .from("store_settings")
    .select("data")
    .eq("id", "singleton")
    .maybeSingle();
  if (settingsError) throw settingsError;

  const institutional = (
    settingsRow?.data as { footer?: { institutional?: Array<{ slug?: string }> } } | null
  )?.footer?.institutional;
  if (Array.isArray(institutional)) {
    for (const page of institutional) {
      if (page?.slug && page.slug !== "quem-somos") {
        add(`/politicas/${page.slug}`, { changefreq: "monthly", priority: 0.4 });
      }
    }
  }

  return urls;
}

export function buildSitemapXml(urls: SitemapUrl[]): string {
  const body = urls
    .map((entry) => {
      let block = `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>\n`;
      if (entry.lastmod) block += `    <lastmod>${entry.lastmod}</lastmod>\n`;
      if (entry.changefreq) block += `    <changefreq>${entry.changefreq}</changefreq>\n`;
      if (entry.priority != null)
        block += `    <priority>${entry.priority.toFixed(1)}</priority>\n`;
      block += "  </url>";
      return block;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

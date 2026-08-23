/** node scripts/preview-sitemap.mjs — resumo do sitemap gerado */
import { loadEnvFile } from "./lib/env.mjs";
import { collectSitemapUrls } from "../src/lib/seo-sitemap.ts";

loadEnvFile();
process.env.PUBLIC_SITE_URL = process.env.PUBLIC_SITE_URL || "https://www.galvaovinhos.com.br";

const urls = await collectSitemapUrls();
const colecao = urls.filter((u) => u.loc.includes("/colecao/"));
const politicas = urls.filter((u) => u.loc.includes("/politicas/"));
const produtos = urls.filter((u) => u.loc.includes("/produto/"));

console.log(`Total URLs: ${urls.length}`);
console.log(`Produtos: ${produtos.length}`);
console.log(`Coleções: ${colecao.length}`);
console.log(`Políticas: ${politicas.length}`);
console.log("\nColeções no sitemap:");
for (const u of colecao.sort((a, b) => a.loc.localeCompare(b.loc))) {
  console.log(" ", u.loc.replace(/^https?:\/\/[^/]+/, ""));
}

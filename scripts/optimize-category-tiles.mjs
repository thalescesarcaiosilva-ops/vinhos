#!/usr/bin/env node
/**
 * Reencoda os tiles de categoria (src/assets/cat-*.webp) no tamanho em que são
 * exibidos. Eles aparecem no máximo a 144 CSS px (md:max-w-36), então 288px
 * cobre até 2× de densidade — as artes originais de 330px eram maiores que o
 * necessário em todos os breakpoints.
 *
 *   node scripts/optimize-category-tiles.mjs
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const DIR = path.join(process.cwd(), "src", "assets");
const MAX = 288;

const files = (await readdir(DIR)).filter((f) => f.startsWith("cat-") && f.endsWith(".webp"));

for (const file of files) {
  const full = path.join(DIR, file);
  // Lê para memória antes de reescrever: o sharp mantém o arquivo de entrada aberto.
  const source = await readFile(full);
  const before = source.length;
  const meta = await sharp(source).metadata();
  if (meta.width <= MAX) {
    console.log(`  ok    ${file}: já em ${meta.width}px`);
    continue;
  }
  const out = await sharp(source)
    .resize(MAX, MAX, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 72, effort: 6 })
    .toBuffer();
  await writeFile(full, out);
  const saved = Math.round((1 - out.length / before) * 100);
  console.log(
    `  feito ${file}: ${meta.width}px ${before}b → ${MAX}px ${out.length}b (-${saved}%)`,
  );
}

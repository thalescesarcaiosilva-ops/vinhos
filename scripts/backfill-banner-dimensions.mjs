#!/usr/bin/env node
/**
 * Preenche banners.width / banners.height lendo o cabeçalho da imagem no Storage.
 * Roda depois da migration 20260907220000_banners_intrinsic_size.sql.
 *
 *   node scripts/backfill-banner-dimensions.mjs          # aplica
 *   node scripts/backfill-banner-dimensions.mjs --dry    # só mostra
 */
import { getSupabaseConfig } from "./lib/env.mjs";

const DRY = process.argv.includes("--dry");
const { url, jwt } = getSupabaseConfig();

const headers = { apikey: jwt, Authorization: `Bearer ${jwt}` };

/** Lê largura/altura do cabeçalho — só os primeiros bytes, sem baixar a imagem toda. */
function parseSize(buf) {
  // PNG: IHDR nos bytes 16..23
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // WebP: VP8X / VP8L / VP8
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const fmt = buf.toString("ascii", 12, 16);
    if (fmt === "VP8X") {
      return {
        width: (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1,
        height: (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1,
      };
    }
    if (fmt === "VP8L") {
      const bits = buf.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (fmt === "VP8 ") {
      return {
        width: buf.readUInt16LE(26) & 0x3fff,
        height: buf.readUInt16LE(28) & 0x3fff,
      };
    }
  }
  // JPEG: varre os markers SOFn
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      }
      i += 2 + len;
    }
  }
  return null;
}

/** 64 KiB cobrem o cabeçalho de qualquer formato; JPEG precisa varrer alguns markers. */
async function fetchSize(imageUrl) {
  const absolute = imageUrl.startsWith("http") ? imageUrl : `${url}${imageUrl}`;
  const res = await fetch(absolute, { headers: { Range: "bytes=0-65535" } });
  if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status} em ${absolute}`);
  return parseSize(Buffer.from(await res.arrayBuffer()));
}

async function main() {
  const res = await fetch(`${url}/rest/v1/banners?select=id,title,image_url,width,height`, {
    headers,
  });
  if (!res.ok) throw new Error(`Falha ao listar banners: HTTP ${res.status} ${await res.text()}`);
  const banners = await res.json();

  for (const banner of banners) {
    if (!banner.image_url) continue;
    const label = banner.title?.trim() || banner.id;
    let size;
    try {
      size = await fetchSize(banner.image_url);
    } catch (err) {
      console.error(`  erro  ${label}: ${err.message}`);
      continue;
    }
    if (!size) {
      console.error(`  pulou ${label}: formato não reconhecido`);
      continue;
    }
    if (banner.width === size.width && banner.height === size.height) {
      console.log(`  ok    ${label}: já em ${size.width}×${size.height}`);
      continue;
    }
    if (DRY) {
      console.log(`  dry   ${label}: ${size.width}×${size.height}`);
      continue;
    }
    const patch = await fetch(`${url}/rest/v1/banners?id=eq.${banner.id}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(size),
    });
    if (!patch.ok) {
      console.error(`  erro  ${label}: HTTP ${patch.status} ${await patch.text()}`);
      continue;
    }
    console.log(`  salvo ${label}: ${size.width}×${size.height}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

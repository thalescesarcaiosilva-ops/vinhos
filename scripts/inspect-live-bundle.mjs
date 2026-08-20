const home = await fetch("https://www.galvaovinhos.com.br/");
const html = await home.text();
const scripts = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]);
console.log("Scripts:", scripts.length);
for (const s of scripts.slice(0, 5)) {
  const url = s.startsWith("http") ? s : `https://www.galvaovinhos.com.br${s}`;
  const js = await fetch(url);
  const text = await js.text();
  const hasSupabase = text.includes("aufvvgytbrstsrfomngm");
  const hasStorage = text.includes("/storage/v1/object/public");
  const hasProductImages = text.includes("product-images");
  console.log(s.split("/").pop(), "supabase:", hasSupabase, "storage path:", hasStorage, "product-images:", hasProductImages);
  if (hasSupabase) {
    const m = text.match(/aufvvgytbrstsrfomngm\.supabase\.co/g);
    console.log("  supabase refs:", m?.length);
  }
}

const urls = [
  "https://vinellevinhos.vercel.app/storage/v1/object/public/product-images/VIN1165_1.png",
  "https://vinellevinhos.vercel.app/storage/v1/render/image/public/product-images/VIN1165_1.png?width=400&format=webp&quality=75",
  "https://vinellevinhos.vercel.app/storage/v1/render/image/public/product-images/VIN001_1.jpg?width=400&format=webp&quality=75",
];

for (const url of urls) {
  const r = await fetch(url);
  const ct = r.headers.get("content-type") || "";
  const buf = await r.arrayBuffer();
  const head = Buffer.from(buf.slice(0, 16)).toString("hex");
  console.log(url.split("/").slice(-1)[0].split("?")[0], r.status, ct, buf.byteLength, "magic:", head.slice(0, 24));
}

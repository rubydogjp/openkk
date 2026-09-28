import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourcePath = path.join(root, "resources/icons.json");
const check = process.argv.includes("--check");
if (process.argv.includes("--sync")) {
  if (check) throw new Error("--sync and --check cannot be combined");
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(path.join(root, "../arts/doticons/rubydog.doticons"), { readOnly: true });
  const icons = {};
  try {
    for (const name of ["openkk", "openkk-demo"]) {
      const record = db.prepare("SELECT pixels FROM icons WHERE name = ?").get(name);
      if (!record) throw new Error(`Missing icon: ${name}`);
      icons[name] = JSON.parse(record.pixels);
    }
  } finally {
    db.close();
  }
  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, JSON.stringify(icons, null, 2) + "\n");
}
const icons = JSON.parse(await readFile(sourcePath, "utf8"));
const bundles = { openkk: "openkk", openkk_sim: "openkk", openkk_demo: "openkk-demo" };
const stale = [];

async function output(file, content) {
  const target = path.join(root, file);
  const bytes = Buffer.from(content);
  if (check) {
    const existing = await readFile(target).catch(() => null);
    if (!existing?.equals(bytes)) stale.push(file);
  } else {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
}

function svg(pixels, padding) {
  const size = 8 + padding * 2;
  const rectangles = pixels.map((color, i) => color == null ? "" :
    `<rect x="${i % 8 + padding}" y="${Math.floor(i / 8) + padding}" width="1" height="1" fill="${color}"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#ffffff"/>${rectangles.join("")}</svg>\n`;
}

async function png(pixels, size, padded) {
  const raw = Buffer.alloc(8 * 8 * 4);
  pixels.forEach((color, i) => {
    if (color == null) return;
    for (let c = 0; c < 3; c++) raw[i * 4 + c] = parseInt(color.slice(1 + c * 2, 3 + c * 2), 16);
    raw[i * 4 + 3] = 255;
  });
  const artSize = padded ? Math.floor(size * 0.6 / 8) * 8 : size;
  const art = await sharp(raw, { raw: { width: 8, height: 8, channels: 4 } })
    .resize(artSize, artSize, { kernel: "nearest" }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: "#ffffff" } })
    .composite([{ input: art, gravity: "centre" }]).png().toBuffer();
}

function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const entry = 6 + i * 16;
    header[entry] = header[entry + 1] = size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map(({ data }) => data)]);
}

for (const [bundle, name] of Object.entries(bundles)) {
  const pixels = icons[name];
  if (!Array.isArray(pixels) || pixels.length !== 64 ||
      pixels.some((color) => color !== null && !/^#[0-9a-f]{6}$/i.test(color))) {
    throw new Error(`Invalid 8×8 icon: ${name}`);
  }
  const base = `packages/${bundle}`;
  await output(`${base}/app/icon.svg`, svg(pixels, 2));
  const images = await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(pixels, size, false) })));
  await output(`${base}/app/favicon.ico`, ico(images));
  await output(`${base}/app/apple-icon.png`, await png(pixels, 180, true));
  await output(`${base}/public/images/openkk-icon.png`, await png(pixels, 256, false));
  for (const size of [192, 512]) {
    const image = await png(pixels, size, true);
    await output(`${base}/public/icons/openkk-icon-${size}.png`, image);
    await output(`${base}/public/icons/openkk-icon-maskable-${size}.png`, image);
  }
}
if (stale.length) throw new Error(`Run npm run gen-icons: ${stale.join(", ")}`);
console.log(check ? "Brand icons are up to date" : "Brand icons generated");

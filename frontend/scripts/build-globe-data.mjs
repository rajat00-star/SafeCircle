// Generates the compact geometry the 3D globe loads at runtime (run: npm run globe:data).
// Source: Natural Earth (public domain) via the world-atlas package (ISC). Output is committed in
// public/globe so the site never fetches map data from a third party at runtime.
//   land.bin    Int16 [lat*100, lon*100] pairs: points of a Fibonacci sphere that fall on land
//   coast.bin   Int16 polyline vertices, NaN-free; each line is prefixed by its vertex count
//   borders.bin same format, internal country borders only
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { feature, mesh } from "topojson-client";

const require = createRequire(import.meta.url);
const atlas = (f) => JSON.parse(fs.readFileSync(require.resolve(`world-atlas/${f}`), "utf8"));
const out = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../public/globe");
fs.mkdirSync(out, { recursive: true });

// --- Land mask from the 50m land polygons
const land50 = atlas("land-50m.json");
const landGeo = feature(land50, land50.objects.land);
const polys = [];
for (const f of landGeo.features ?? [landGeo]) {
  const g = f.geometry;
  const list = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  for (const rings of list) {
    let minX = 180, minY = 90, maxX = -180, maxY = -90;
    for (const [x, y] of rings[0]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    polys.push({ rings, minX, minY, maxX, maxY });
  }
}
const inRing = (x, y, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const onLand = (lon, lat) => polys.some((p) => lon >= p.minX && lon <= p.maxX && lat >= p.minY && lat <= p.maxY &&
  inRing(lon, lat, p.rings[0]) && !p.rings.slice(1).some((h) => inRing(lon, lat, h)));

const N = 42000, golden = Math.PI * (3 - Math.sqrt(5)), pts = [];
for (let i = 0; i < N; i++) {
  const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = golden * i;
  const lat = (Math.asin(y) * 180) / Math.PI;
  const lon = ((Math.atan2(Math.sin(th) * r, Math.cos(th) * r) * 180) / Math.PI);
  if (lat < -62) continue; // Antarctica is omitted to keep the composition clean
  if (onLand(lon, lat)) pts.push(Math.round(lat * 100), Math.round(lon * 100));
}
fs.writeFileSync(path.join(out, "land.bin"), Buffer.from(new Int16Array(pts).buffer));

// --- Lines (coastlines from 110m land, internal borders from 110m countries)
const writeLines = (name, ml) => {
  const arr = [];
  for (const line of ml.coordinates) {
    const l = line.filter(([, y]) => y > -62);
    if (l.length < 2) continue;
    arr.push(l.length);
    for (const [x, y] of l) arr.push(Math.round(y * 100), Math.round(x * 100));
  }
  fs.writeFileSync(path.join(out, name), Buffer.from(new Int16Array(arr).buffer));
  return arr.length;
};
const land110 = atlas("land-110m.json");
const countries = atlas("countries-110m.json");
const c = writeLines("coast.bin", mesh(land110, land110.objects.land));
const b = writeLines("borders.bin", mesh(countries, countries.objects.countries, (a, bb) => a !== bb));
console.log(`land points: ${pts.length / 2}, coast values: ${c}, border values: ${b}`);

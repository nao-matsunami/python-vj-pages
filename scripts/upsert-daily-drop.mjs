import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const dropsPath = path.join(rootDir, "data", "drops.json");
const dateArg = process.argv.find((arg) => arg.startsWith("--date="));
const targetDate = dateArg ? dateArg.slice("--date=".length) : localIsoDate(new Date());
const engines = [
  { slug: "pixel-field", titles: ["Frame Noise Bloom", "Procedural Matte Field", "Alpha Contour Drift"], copy: "Pythonで固定FPS連番生成する前提の、ノイズとマスク向け抽象VJループ。", why: "既存系列として、ピクセル処理、波形、マスクを増やす。販売用マスター生成へ接続しやすい。" },
  { slug: "matte-contours", titles: ["Contour Matte Shell", "Elliptic Alpha Plate", "Luma Contour Study"], copy: "輪郭線と楕円マスクを主役にしたPython系VJループ。", why: "黒抜きやアルファMOV向けに、輪郭の明瞭な素材ラインを作る。" },
  { slug: "opencv-bars", titles: ["OpenCV Signal Mask", "Vertical Scan Analyzer", "Histogram Light Gate"], copy: "OpenCV的なバー、スキャン、解析表示を想定したPython系VJループ。", why: "画像解析UIや信号処理風の表現を別エンジンにし、既存のノイズ素材と分ける。" },
  { slug: "particle-raster", titles: ["Pillow Particle Raster", "Raster Particle Bloom", "Offline Dot Scatter"], copy: "Pillowの粒子描画を想定したオフライン生成向けVJループ。", why: "連番画像として粒子配置を固定できる方向を増やす。ブラウザでは軽量プレビューを見せる。" },
];
const data = JSON.parse(await fs.readFile(dropsPath, "utf8"));
if (data.drops.find((drop) => drop.date === targetDate)) {
  console.log(`Daily drop already exists: ${targetDate}`);
  process.exit(0);
}
const seed = hash(targetDate);
const engine = engines[seed % engines.length];
const hueA = fract(seed * 0.0183);
const hueB = fract(hueA + 0.38);
data.drops.unshift({
  date: targetDate,
  title: engine.titles[seed % engine.titles.length],
  engine: engine.slug,
  loopSeconds: [8, 12, 16, 20][seed % 4],
  palette: [...hsv(hueA, 0.72, 0.92), ...hsv(hueB, 0.68, 0.8)],
  copy: engine.copy,
  why: engine.why,
});
data.drops.sort((a, b) => b.date.localeCompare(a.date));
await fs.writeFile(dropsPath, `${JSON.stringify(data, null, 2)}\n`);
console.log(`Added daily drop: ${targetDate}`);
function localIsoDate(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function hash(value) { let out = 2166136261; for (let i = 0; i < value.length; i += 1) { out ^= value.charCodeAt(i); out = Math.imul(out, 16777619); } return Math.abs(out); }
function fract(value) { return value - Math.floor(value); }
function hsv(h, s, v) { const i = Math.floor(h * 6); const f = h * 6 - i; const p = v * (1 - s); const q = v * (1 - f * s); const t = v * (1 - (1 - f) * s); const table = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]]; return table[i % 6].map((n) => Number(n.toFixed(3))); }

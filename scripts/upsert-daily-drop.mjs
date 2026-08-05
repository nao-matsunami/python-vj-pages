import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const dropsPath = path.join(rootDir, "data", "drops.json");
const dateArg = process.argv.find((arg) => arg.startsWith("--date="));
const targetDate = dateArg ? dateArg.slice("--date=".length) : localIsoDate(new Date());
const titles = ["Procedural Matte Field", "OpenCV Signal Mask", "Pillow Particle Raster", "Frame Noise Bloom", "Alpha Contour Drift"];
const copyLines = [
  "Pythonで固定FPS連番生成する前提の、ノイズとマスク向け抽象VJループ。",
  "Pillow/OpenCVの画像処理に展開しやすい、販売用マスター生成向けサンプル。",
  "ブラウザでは軽量プレビュー、Mac miniではMP4/MOV生成に使う日次素材。",
];
const whyLines = [
  "Python/Pillow/OpenCVは連番画像、マスク、アルファ素材、バッチ処理に向く。販売用マスターをMac miniで固定FPS生成する前提にしている。",
  "ブラウザのリアルタイム録画より、Pythonのオフライン生成の方がフレーム精度と再現性を管理しやすい。",
  "画像処理系のVJ素材は、後からOpenCVフィルタやマット生成を足せるため、販売用パックの幅を広げやすい。",
];
const data = JSON.parse(await fs.readFile(dropsPath, "utf8"));
if (data.drops.find((drop) => drop.date === targetDate)) {
  console.log(`Daily drop already exists: ${targetDate}`);
  process.exit(0);
}
const seed = hash(targetDate);
const hueA = fract(seed * 0.0183);
const hueB = fract(hueA + 0.38);
data.drops.unshift({
  date: targetDate,
  title: titles[seed % titles.length],
  loopSeconds: [8, 12, 16, 20][seed % 4],
  palette: [...hsv(hueA, 0.72, 0.92), ...hsv(hueB, 0.68, 0.8)],
  copy: copyLines[seed % copyLines.length],
  why: whyLines[seed % whyLines.length],
});
data.drops.sort((a, b) => b.date.localeCompare(a.date));
await fs.writeFile(dropsPath, `${JSON.stringify(data, null, 2)}\n`);
console.log(`Added daily drop: ${targetDate}`);
function localIsoDate(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function hash(value) { let out = 2166136261; for (let i = 0; i < value.length; i += 1) { out ^= value.charCodeAt(i); out = Math.imul(out, 16777619); } return Math.abs(out); }
function fract(value) { return value - Math.floor(value); }
function hsv(h, s, v) { const i = Math.floor(h * 6); const f = h * 6 - i; const p = v * (1 - s); const q = v * (1 - f * s); const t = v * (1 - (1 - f) * s); const table = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]]; return table[i % 6].map((n) => Number(n.toFixed(3))); }

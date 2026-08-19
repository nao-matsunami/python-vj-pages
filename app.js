const canvas = document.querySelector("#vj-canvas");
const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
const initialIso = new URLSearchParams(window.location.search).get("date") || localIsoDate(new Date());

let sources = [];
let drops = [];
let purchaseConfig = { enabled: false, label: "Full Pack", url: "", note: "映像データの購入先は準備中です。" };
let activePiece;
let animationId = 0;
let startTime = performance.now();
let pausedAt = 0;
let isPaused = false;
let calmMotion = false;
let videoRecorder = null;
let recordingStartedAt = 0;
let recordingProgressId = 0;
let alphaFrameId = 0;

initialize();

async function initialize() {
  await loadData();
  activePiece = pickPiece(initialIso);
  renderContent();
  requestAnimationFrame(draw);
}

async function loadData() {
  try {
    const [dropsResponse, purchaseResponse] = await Promise.all([
      fetch("./data/drops.json", { cache: "no-store" }),
      fetch("./data/purchase.json", { cache: "no-store" }),
    ]);
    if (dropsResponse.ok) {
      const data = await dropsResponse.json();
      if (Array.isArray(data.sources)) sources = data.sources;
      if (Array.isArray(data.drops)) drops = data.drops.sort((a, b) => b.date.localeCompare(a.date));
    }
    if (purchaseResponse.ok) purchaseConfig = { ...purchaseConfig, ...(await purchaseResponse.json()) };
  } catch {
    drops = [];
  }
}

function draw(now) {
  resize();
  const elapsed = isPaused ? pausedAt : (now - startTime) / 1000;
  const speed = calmMotion ? 0.38 : 1;
  const phase = (((elapsed * speed) % activePiece.loopSeconds) / activePiece.loopSeconds) * Math.PI * 2;
  renderFrame(ctx, canvas.width, canvas.height, activePiece, phase, false);
  animationId = requestAnimationFrame(draw);
}

function renderFrame(target, width, height, piece, phase, alpha) {
  const seed = hash(`${piece.date}:${piece.title}`);
  const variant = pieceVariant(piece);
  const engine = pieceEngine(piece);
  const minSide = Math.min(width, height);
  const paletteA = rgb(piece.palette.slice(0, 3));
  const paletteB = rgb(piece.palette.slice(3, 6));
  target.clearRect(0, 0, width, height);
  if (!alpha) {
    target.fillStyle = "#020303";
    target.fillRect(0, 0, width, height);
  }

  if (engine !== "pixel-field") {
    drawPythonEngine(target, engine, width, height, piece, phase, alpha, seed, minSide, paletteA, paletteB);
    return;
  }

  const image = target.getImageData(0, 0, width, height);
  const data = image.data;
  const cx = width / 2;
  const cy = height / 2;
  const step = Math.max(1, Math.floor(minSide / 360));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const nx = (x - cx) / minSide;
      const ny = (y - cy) / minSide;
      const r = Math.hypot(nx, ny);
      const a = Math.atan2(ny, nx);
      let wave = Math.sin(r * 42 - phase * 3 + Math.sin(a * 6 + phase) * 2);
      let grid = Math.sin((nx + Math.sin(phase) * 0.08) * 48) * Math.sin((ny + Math.cos(phase) * 0.08) * 48);
      if (variant === 1) {
        wave = Math.sin((Math.abs(nx) + Math.abs(ny)) * 58 - phase * 4);
        grid = Math.cos(a * 12 + phase * 2) * Math.sin(r * 34 + phase);
      } else if (variant === 2) {
        wave = Math.sin(nx * 72 + phase * 2) * Math.cos(ny * 24 - phase * 3);
        grid = Math.sin((r + Math.sin(a * 5) * 0.08) * 64 - phase * 2);
      } else if (variant === 3) {
        wave = Math.sin((Math.floor((nx + 0.5) * 12.0) + Math.floor((ny + 0.5) * 9.0)) + phase * 4);
        grid = Math.sin(a * 5 + phase) * Math.cos(r * 50 - phase);
      }
      const mask = smoothstep(0.72, 0.08, r);
      const v = Math.max(0, wave * 0.55 + grid * 0.45) * mask;
      if (v <= 0.03) continue;
      const mixValue = 0.5 + 0.5 * Math.sin(a * 3 + phase + seed * 0.001);
      const color = mixColor(paletteA, paletteB, mixValue);
      for (let yy = 0; yy < step; yy += 1) {
        for (let xx = 0; xx < step; xx += 1) {
          const px = x + xx;
          const py = y + yy;
          if (px >= width || py >= height) continue;
          const i = (py * width + px) * 4;
          data[i] = Math.min(255, data[i] + color[0] * v);
          data[i + 1] = Math.min(255, data[i + 1] + color[1] * v);
          data[i + 2] = Math.min(255, data[i + 2] + color[2] * v);
          data[i + 3] = alpha ? Math.max(data[i + 3], Math.min(255, v * 255)) : 255;
        }
      }
    }
  }
  target.putImageData(image, 0, 0);

  target.save();
  target.translate(cx, cy);
  target.globalCompositeOperation = "lighter";
  for (let i = 0; i < 28; i += 1) {
    const t = i / 28;
    const orbit = phase + t * Math.PI * 2;
    const radius = minSide * (0.12 + ((i * 13 + seed) % 100) / 100 * 0.34);
    const x = Math.cos(orbit * (1 + (i % 3) * 0.13)) * radius;
    const y = Math.sin(orbit * (1 - (i % 4) * 0.07)) * radius * 0.72;
    target.globalAlpha = 0.26;
    target.fillStyle = i % 2 === 0 ? `rgb(${paletteA.join(", ")})` : `rgb(${paletteB.join(", ")})`;
    target.beginPath();
    target.arc(x, y, minSide * (0.008 + (i % 5) * 0.003), 0, Math.PI * 2);
    target.fill();
  }
  drawPythonVariant(target, variant, phase, seed, minSide, paletteA, paletteB);
  target.restore();
}

function drawPythonEngine(target, engine, width, height, piece, phase, alpha, seed, minSide, paletteA, paletteB) {
  const cx = width / 2;
  const cy = height / 2;
  target.save();
  target.translate(cx, cy);
  target.globalCompositeOperation = "lighter";
  if (engine === "matte-contours") {
    for (let i = 0; i < 18; i += 1) {
      const t = i / 18;
      const radius = minSide * (0.08 + t * 0.44 + Math.sin(phase + i) * 0.012);
      target.strokeStyle = i % 2 ? `rgba(${paletteA.join(", ")}, ${alpha ? 0.82 : 0.32})` : `rgba(${paletteB.join(", ")}, ${alpha ? 0.82 : 0.32})`;
      target.lineWidth = Math.max(1, minSide * (0.002 + t * 0.004));
      target.beginPath();
      target.ellipse(0, 0, radius * (1.2 + 0.2 * Math.sin(phase)), radius * 0.62, phase * 0.18 + i * 0.1, 0, Math.PI * 2);
      target.stroke();
    }
  } else if (engine === "opencv-bars") {
    for (let i = 0; i < 48; i += 1) {
      const x = (i / 47 - 0.5) * minSide * 1.1;
      const wave = 0.5 + 0.5 * Math.sin(phase * 3 + i * 0.5 + seed * 0.01);
      target.globalAlpha = 0.12 + wave * 0.45;
      target.fillStyle = i % 2 ? `rgb(${paletteA.join(", ")})` : `rgb(${paletteB.join(", ")})`;
      target.fillRect(x, -minSide * 0.42 * wave, minSide * 0.012, minSide * 0.84 * wave);
    }
  } else {
    for (let i = 0; i < 140; i += 1) {
      const t = i / 140;
      const angle = t * Math.PI * 2 + phase * (1 + (i % 5) * 0.04);
      const r = minSide * (0.1 + ((i * 29 + seed) % 100) / 100 * 0.42);
      target.globalAlpha = 0.22;
      target.fillStyle = i % 2 ? `rgb(${paletteA.join(", ")})` : `rgb(${paletteB.join(", ")})`;
      target.beginPath();
      target.arc(Math.cos(angle) * r, Math.sin(angle * 0.82) * r, minSide * (0.004 + (i % 6) * 0.002), 0, Math.PI * 2);
      target.fill();
    }
  }
  target.restore();
}

function drawPythonVariant(target, variant, phase, seed, minSide, paletteA, paletteB) {
  if (variant === 0) return;
  target.globalCompositeOperation = "lighter";
  if (variant === 1) {
    target.strokeStyle = `rgba(${paletteA.join(", ")}, 0.34)`;
    target.lineWidth = Math.max(1, minSide * 0.003);
    for (let i = 0; i < 18; i += 1) {
      const r = minSide * (0.08 + i * 0.018);
      target.beginPath();
      target.rect(-r * 1.45, -r, r * 2.9, r * 2);
      target.stroke();
      target.rotate(phase * 0.035 + 0.08);
    }
  } else if (variant === 2) {
    for (let i = 0; i < 40; i += 1) {
      const t = (i + (seed % 17)) / 40;
      const x = (t - 0.5) * minSide * 1.1;
      const h = minSide * (0.08 + 0.34 * (0.5 + 0.5 * Math.sin(phase * 2 + i)));
      target.strokeStyle = i % 2 ? `rgba(${paletteA.join(", ")}, 0.28)` : `rgba(${paletteB.join(", ")}, 0.28)`;
      target.lineWidth = Math.max(1, minSide * 0.006);
      target.beginPath();
      target.moveTo(x, -h);
      target.lineTo(x + Math.sin(phase + i) * minSide * 0.04, h);
      target.stroke();
    }
  } else {
    target.strokeStyle = `rgba(${paletteB.join(", ")}, 0.36)`;
    target.lineWidth = Math.max(1, minSide * 0.002);
    for (let i = 0; i < 9; i += 1) {
      const s = minSide * (0.14 + i * 0.035);
      target.beginPath();
      target.ellipse(0, 0, s * 1.35, s * 0.72, phase + i * 0.35, 0, Math.PI * 2);
      target.stroke();
    }
  }
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.floor(canvas.clientWidth * dpr);
  const height = Math.floor(canvas.clientHeight * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function renderContent() {
  document.querySelector("#piece-title").textContent = activePiece.title;
  document.querySelector("#piece-date").textContent = activePiece.date;
  document.querySelector("#detail-title").textContent = activePiece.title;
  document.querySelector("#detail-copy").textContent = activePiece.copy;
  document.querySelector("#loop-length").textContent = `${activePiece.loopSeconds}s`;
  document.querySelector("#why-copy").textContent = activePiece.why;
  document.querySelector("#code-output").textContent = makeRecipe(activePiece);
  renderPurchaseLink(activePiece);
  renderSources();
  renderArchive();
}

function renderSources() {
  const sourceList = document.querySelector("#source-list");
  sourceList.innerHTML = "";
  if (Array.isArray(activePiece.research)) {
    activePiece.research.forEach((entry) => {
      const li = document.createElement("li");
      const title = document.createElement("strong");
      title.textContent = `Daily Research ${entry.date}`;
      const note = document.createElement("p");
      note.textContent = entry.summary;
      li.append(title, note);
      if (Array.isArray(entry.sources)) {
        entry.sources.forEach((source) => {
          const link = document.createElement("a");
          link.href = source.url;
          link.target = "_blank";
          link.rel = "noreferrer";
          link.textContent = source.label;
          const sourceNote = document.createElement("p");
          sourceNote.textContent = source.note;
          li.append(link, sourceNote);
        });
      }
      sourceList.append(li);
    });
  }
  sources.forEach((source) => {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = source.label;
    const note = document.createElement("p");
    note.textContent = source.note;
    li.append(link, note);
    sourceList.append(li);
  });
}

function renderArchive() {
  const archive = document.querySelector("#archive-list");
  archive.innerHTML = "";
  drops.forEach((piece) => {
    const item = document.createElement("article");
    item.className = "archive-item";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = piece.title;
    button.addEventListener("click", () => {
      activePiece = piece;
      startTime = performance.now();
      pausedAt = 0;
      renderContent();
    });
    const small = document.createElement("small");
    small.textContent = `${piece.date} / ${piece.loopSeconds}s Python frame loop`;
    item.append(button, small);
    archive.append(item);
  });
}

function renderPurchaseLink(piece) {
  const link = document.querySelector("#purchase-link");
  const note = document.querySelector("#purchase-note");
  const itemUrl = piece.purchaseUrl || purchaseConfig.url;
  const enabled = Boolean(itemUrl && purchaseConfig.enabled);
  link.textContent = piece.purchaseLabel || purchaseConfig.label;
  link.href = enabled ? itemUrl : "#";
  link.target = enabled ? "_blank" : "";
  link.rel = enabled ? "noreferrer" : "";
  link.setAttribute("aria-disabled", String(!enabled));
  note.textContent = piece.purchaseNote || purchaseConfig.note;
}

document.querySelector("#toggle-play").addEventListener("click", () => {
  isPaused = !isPaused;
  const icon = document.querySelector("#play-icon");
  if (isPaused) {
    pausedAt = (performance.now() - startTime) / 1000;
    icon.textContent = ">";
  } else {
    startTime = performance.now() - pausedAt * 1000;
    icon.textContent = "II";
  }
});
document.querySelector("#toggle-motion").addEventListener("click", () => {
  calmMotion = !calmMotion;
  document.querySelector("#toggle-motion").style.color = calmMotion ? "var(--accent-2)" : "";
});
document.querySelector("#save-frame").addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = `${activePiece.date}-${slugify(activePiece.title)}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
});
document.querySelector("#save-video").addEventListener("click", () => recordLoopVideo(false).catch(markVideoError));
document.querySelector("#save-alpha").addEventListener("click", () => recordLoopVideo(true).catch(markAlphaError));
document.querySelector("#copy-code").addEventListener("click", async () => {
  await navigator.clipboard.writeText(makeRecipe(activePiece));
  const button = document.querySelector("#copy-code");
  button.textContent = "COPIED";
  window.setTimeout(() => { button.textContent = "CODE"; }, 1200);
});
document.querySelector("#save-project").addEventListener("click", () => {
  downloadText(`${activePiece.date}-${slugify(activePiece.title)}.python-vj.json`, JSON.stringify({
    project: "daily-python-vj-loop",
    version: 1,
    date: activePiece.date,
    title: activePiece.title,
    loopSeconds: activePiece.loopSeconds,
    palette: activePiece.palette,
    sources,
    recipe: makeRecipe(activePiece),
  }, null, 2), "application/json");
});
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("is-active"));
    document.querySelectorAll(".tab-panel").forEach((item) => item.classList.remove("is-active"));
    tab.classList.add("is-active");
    document.querySelector(`#tab-${tab.dataset.tab}`).classList.add("is-active");
  });
});

async function recordLoopVideo(alpha) {
  if (videoRecorder?.state === "recording") return;
  if (!canvas.captureStream || !window.MediaRecorder) throw new Error("Recording unsupported.");
  const format = alpha ? pickAlphaVideoFormat() : pickVideoFormat();
  if (!format) throw new Error("No video format.");
  const button = document.querySelector(alpha ? "#save-alpha" : "#save-video");
  const chunks = [];
  const stream = canvas.captureStream(60);
  const recorder = new MediaRecorder(stream, { mimeType: format.mimeType, videoBitsPerSecond: alpha ? 10_000_000 : 8_000_000 });
  videoRecorder = recorder;
  recorder.addEventListener("dataavailable", (event) => { if (event.data.size > 0) chunks.push(event.data); });
  const finished = new Promise((resolve) => recorder.addEventListener("stop", resolve, { once: true }));
  button.disabled = true;
  button.classList.add("is-recording");
  startTime = performance.now();
  pausedAt = 0;
  isPaused = false;
  document.querySelector("#play-icon").textContent = "II";
  recordingStartedAt = performance.now();
  if (alpha) alphaFrameId = requestAnimationFrame(() => alphaLoop());
  updateRecordingProgress(button);
  recorder.start(250);
  window.setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, activePiece.loopSeconds * 1000);
  await finished;
  cancelAnimationFrame(alphaFrameId);
  cancelAnimationFrame(recordingProgressId);
  stream.getTracks().forEach((track) => track.stop());
  downloadBlob(`${activePiece.date}-${slugify(activePiece.title)}${alpha ? "-alpha" : ""}.${format.extension}`, new Blob(chunks, { type: format.mimeType }));
  button.classList.remove("is-recording");
  button.textContent = alpha ? "WEBM" : format.extension.toUpperCase();
  window.setTimeout(() => {
    button.textContent = alpha ? "ALPHA" : "MP4";
    button.disabled = false;
    videoRecorder = null;
  }, 1400);
}

function alphaLoop() {
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = frame.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const luminance = pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722;
    pixels[i + 3] = smoothstep(4, 52, luminance) * 255;
  }
  ctx.putImageData(frame, 0, 0);
  alphaFrameId = requestAnimationFrame(alphaLoop);
}

function updateRecordingProgress(button) {
  const elapsed = (performance.now() - recordingStartedAt) / 1000;
  const progress = Math.min(99, Math.floor((elapsed / activePiece.loopSeconds) * 100));
  button.textContent = `REC ${progress}%`;
  recordingProgressId = requestAnimationFrame(() => updateRecordingProgress(button));
}
function markVideoError() { const b = document.querySelector("#save-video"); b.textContent = "NO VIDEO"; b.disabled = false; window.setTimeout(() => { b.textContent = "MP4"; }, 1600); }
function markAlphaError() { const b = document.querySelector("#save-alpha"); b.textContent = "NO ALPHA"; b.disabled = false; window.setTimeout(() => { b.textContent = "ALPHA"; }, 1600); }
function pickVideoFormat() {
  const candidates = [{ mimeType: "video/mp4;codecs=h264", extension: "mp4" }, { mimeType: "video/mp4", extension: "mp4" }, { mimeType: "video/webm;codecs=vp9", extension: "webm" }, { mimeType: "video/webm", extension: "webm" }];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate.mimeType));
}
function pickAlphaVideoFormat() {
  const candidates = [{ mimeType: "video/webm;codecs=vp9", extension: "webm" }, { mimeType: "video/webm;codecs=vp8", extension: "webm" }, { mimeType: "video/webm", extension: "webm" }];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate.mimeType));
}
function pickPiece(date) {
  const direct = drops.find((piece) => piece.date === date);
  if (direct) return direct;
  const seed = hash(date);
  const hueA = fract(seed * 0.0183);
  const hueB = fract(hueA + 0.38);
  return {
    date,
    title: `Generated Python Loop ${date.replaceAll("-", ".")}`,
    loopSeconds: [8, 12, 16, 20][seed % 4],
    palette: [...hsv(hueA, 0.72, 0.92), ...hsv(hueB, 0.68, 0.8)],
    copy: "日付シードから生成されるPython VJループ。販売用映像はMac miniで固定FPS生成する想定。",
    why: "Python/Pillow/OpenCVはオフラインで連番画像、マスク、グリッチ、アルファ素材を作るのに向く。GitHub Pagesでは軽いプレビューだけを見せる。",
  };
}
function pieceVariant(piece) {
  const title = String(piece.title || "").toLowerCase();
  if (title.includes("matte") || title.includes("contour")) return 1;
  if (title.includes("opencv") || title.includes("signal")) return 2;
  if (title.includes("pillow") || title.includes("particle")) return 3;
  return hash(`${piece.date}:${piece.title}:python`) % 4;
}
function pieceEngine(piece) {
  return piece.engine || "pixel-field";
}
function makeRecipe(piece) {
  return `# Daily Python VJ Loop
# Date: ${piece.date}
# Title: ${piece.title}
# Loop seconds: ${piece.loopSeconds}
# Engine: ${pieceEngine(piece)}
# Variant: ${pieceVariant(piece)}
# Pipeline: Pillow / OpenCV fixed-FPS frame generation
# Palette A: ${rgb(piece.palette.slice(0, 3)).join(", ")}
# Palette B: ${rgb(piece.palette.slice(3, 6)).join(", ")}
# See offline/generate_preview.py for the starter renderer.`;
}
function localIsoDate(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function hash(value) { let out = 2166136261; for (let i = 0; i < value.length; i += 1) { out ^= value.charCodeAt(i); out = Math.imul(out, 16777619); } return Math.abs(out); }
function fract(value) { return value - Math.floor(value); }
function smoothstep(edge0, edge1, value) { const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0))); return t * t * (3 - 2 * t); }
function hsv(h, s, v) { const i = Math.floor(h * 6); const f = h * 6 - i; const p = v * (1 - s); const q = v * (1 - f * s); const t = v * (1 - (1 - f) * s); const table = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]]; return table[i % 6].map((n) => Number(n.toFixed(3))); }
function rgb(values) { return values.map((value) => Math.round(value * 255)); }
function mixColor(a, b, t) { return a.map((value, index) => value * (1 - t) + b[index] * t); }
function slugify(value) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }
function downloadText(filename, text, type) { downloadBlob(filename, new Blob([text], { type })); }
function downloadBlob(filename, blob) { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.download = filename; link.href = url; link.click(); URL.revokeObjectURL(url); }
window.addEventListener("beforeunload", () => cancelAnimationFrame(animationId));

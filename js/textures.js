// Canvas-drawn textures: neon signs, floor tiles and the seven-segment credit display.
import * as THREE from "three";

const FONT = 'system-ui, "Microsoft JhengHei", "PingFang TC", sans-serif';

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")];
}

function toTexture(c, repeat = null) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

// Glowing text on a dark plate. Used by the machine header and the shop signs.
export function drawNeon(ctx, x, y, w, h, text, color, bg = "#120a1c") {
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, h * 0.04);
  ctx.strokeRect(x + h * 0.08, y + h * 0.08, w - h * 0.16, h - h * 0.16);
  let size = h * 0.56;
  ctx.font = `900 ${size}px ${FONT}`;
  const tw = ctx.measureText(text).width;
  if (tw > w * 0.86) size *= (w * 0.86) / tw;
  ctx.font = `900 ${size}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = color;
  for (const blur of [h * 0.3, h * 0.12]) {
    ctx.shadowBlur = blur;
    ctx.fillStyle = color;
    ctx.fillText(text, x + w / 2, y + h / 2 + size * 0.04);
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#fff";
  ctx.globalAlpha = 0.55;
  ctx.fillText(text, x + w / 2, y + h / 2 + size * 0.04);
  ctx.globalAlpha = 1;
}

export function neonTexture(text, color, w = 512, h = 160) {
  const [c, ctx] = canvas(w, h);
  drawNeon(ctx, 0, 0, w, h, text, color);
  return toTexture(c);
}

// Several signs in one texture. Returns the texture and each sign's UV rect [u0, v0, u1, v1].
export function neonAtlas(items, cellW = 512, cellH = 128) {
  const [c, ctx] = canvas(cellW, cellH * items.length);
  const rects = items.map(([text, color], i) => {
    drawNeon(ctx, 0, i * cellH, cellW, cellH, text, color);
    const v1 = 1 - (i * cellH) / c.height;
    return [0, v1 - cellH / c.height, 1, v1];
  });
  return { texture: toTexture(c), rects };
}

// Classic two-tone terrazzo-like tiles with grout lines.
export function tileTexture(repeat) {
  const [c, ctx] = canvas(256, 256);
  const cell = 128;
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      ctx.fillStyle = (i + j) % 2 ? "#d9d4cc" : "#b9b3ab";
      ctx.fillRect(i * cell, j * cell, cell, cell);
      for (let k = 0; k < 90; k++) {
        ctx.fillStyle = `rgba(${60 + Math.random() * 80},${60 + Math.random() * 60},${70 + Math.random() * 60},0.18)`;
        ctx.fillRect(i * cell + Math.random() * cell, j * cell + Math.random() * cell, 2 + Math.random() * 3, 2 + Math.random() * 3);
      }
    }
  }
  ctx.strokeStyle = "#8d877f";
  ctx.lineWidth = 3;
  for (let k = 0; k <= 2; k++) {
    ctx.beginPath();
    ctx.moveTo(k * cell, 0);
    ctx.lineTo(k * cell, 256);
    ctx.moveTo(0, k * cell);
    ctx.lineTo(256, k * cell);
    ctx.stroke();
  }
  return toTexture(c, repeat);
}

// Seven-segment digits. Segment order a b c d e f g.
const SEGS = {
  0: "1111110", 1: "0110000", 2: "1101101", 3: "1111001", 4: "0110011",
  5: "1011011", 6: "1011111", 7: "1110000", 8: "1111111", 9: "1111011", "-": "0000001", " ": "0000000",
};

function drawDigit(ctx, ch, x, y, w, h, on, off) {
  const t = w * 0.18; // segment thickness
  const segs = SEGS[ch] || SEGS[" "];
  const hs = (sx, sy) => ctx.fillRect(x + sx + t * 0.6, y + sy - t / 2, w - t * 1.2, t);
  const vs = (sx, sy) => ctx.fillRect(x + sx - t / 2, y + sy + t * 0.6, t, h / 2 - t * 1.2);
  const parts = [
    () => hs(0, t / 2),
    () => vs(w - t / 2, t / 2),
    () => vs(w - t / 2, h / 2),
    () => hs(0, h - t / 2),
    () => vs(t / 2, h / 2),
    () => vs(t / 2, t / 2),
    () => hs(0, h / 2),
  ];
  parts.forEach((draw, i) => {
    ctx.fillStyle = segs[i] === "1" ? on : off;
    ctx.shadowBlur = segs[i] === "1" ? 8 : 0;
    draw();
  });
  ctx.shadowBlur = 0;
}

// Two red LED groups: credits (left) and seconds left (right). Redraws only when a value changes.
export function createSegDisplay() {
  const [c, ctx] = canvas(256, 96);
  const texture = toTexture(c);
  let last = "";
  function set(credits, seconds) {
    const a = String(Math.min(99, credits)).padStart(2, " ");
    const b = seconds == null ? "--" : String(Math.max(0, Math.ceil(seconds))).padStart(2, " ");
    const key = a + b;
    if (key === last) return;
    last = key;
    ctx.fillStyle = "#140404";
    ctx.fillRect(0, 0, 256, 96);
    ctx.shadowColor = "#ff2a2a";
    const on = "#ff3b2f", off = "#3a0d0d";
    const dw = 34, dh = 60, y = 22;
    [...a].forEach((ch, i) => drawDigit(ctx, ch, 14 + i * 44, y, dw, dh, on, off));
    [...b].forEach((ch, i) => drawDigit(ctx, ch, 156 + i * 44, y, dw, dh, on, off));
    ctx.fillStyle = "#ff9a8a";
    ctx.font = `700 15px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("次數", 58, 3);
    ctx.fillText("秒數", 200, 3);
    texture.needsUpdate = true;
  }
  set(0, null);
  return { texture, set };
}

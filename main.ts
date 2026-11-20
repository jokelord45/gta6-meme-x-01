// gta6-meme-x-01 — the entrypoint the grader runs (Node 22, standard library only).
//
// It does two things, both deterministic (no network, no wall clock, no files
// outside the repository; the same input bytes always produce the same output):
//   1. Generates the meme image as meme.svg in the output directory. The SVG is
//      drawn entirely in code below: a synthwave Vice City sunset, the make.fun
//      ghost mascot (white ghost, sparkle eyes, magenta star coin) and the
//      caption. meme.png in this repository is that SVG rasterised with resvg
//      (a standard SVG rasteriser) for posting to X, which needs PNG/JPEG/WebP.
//   2. Copies POST.json from the repository root to the output directory, where
//      the gate reads it (the starter's behaviour; POST.json names the X post).
//
// Local run (as the grader does it):
//   mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
// Then rasterise: node /tmp/resvg-test/render.mjs out/meme.svg meme.png
// (or any SVG rasteriser; the PNG is a mechanical render of this program's SVG).

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BOT_DIR = process.env.MAKEFUN_BOT_DIR ?? '/bot';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const W = 1200;
const H = 675;
const HORIZON = 440; // y of the horizon line / top of the grid floor

// --- tiny deterministic PRNG (fixed seed; Math.random is never used) ---
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fmt = (n: number): string => String(Math.round(n * 100) / 100);

// --- star polygons ---------------------------------------------------------
function starPoints(cx: number, cy: number, outer: number, inner: number, points: number, rotDeg = -90): string {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = ((rotDeg + (i * 180) / points) * Math.PI) / 180;
    pts.push(`${fmt(cx + r * Math.cos(a))},${fmt(cy + r * Math.sin(a))}`);
  }
  return pts.join(' ');
}

// 4-point sparkle (the ghost's eyes): long verticals, short horizontals.
function sparkle(cx: number, cy: number, r: number): string {
  return `M ${fmt(cx)} ${fmt(cy - r)} Q ${fmt(cx + r * 0.18)} ${fmt(cy - r * 0.18)} ${fmt(cx + r)} ${fmt(cy)} Q ${fmt(cx + r * 0.18)} ${fmt(cy + r * 0.18)} ${fmt(cx)} ${fmt(cy + r)} Q ${fmt(cx - r * 0.18)} ${fmt(cy + r * 0.18)} ${fmt(cx - r)} ${fmt(cy)} Q ${fmt(cx - r * 0.18)} ${fmt(cy - r * 0.18)} ${fmt(cx)} ${fmt(cy - r)} Z`;
}

// --- the make.fun ghost ----------------------------------------------------
// White ghost body, sparkle eyes, small smile, rosy cheeks, and the magenta
// star coin it presents. Drawn from scratch in code (no fetched assets).
function ghost(cx: number, top: number, w: number, h: number): string {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const yTop = top;
  const ySide = top + h * 0.42;
  const yBot = top + h;
  // Wavy bottom edge: three downward bumps back from right to left.
  const bumps = 3;
  const step = w / bumps;
  let waves = '';
  for (let i = 0; i < bumps; i++) {
    const sx = x1 - i * step;
    const ex = x1 - (i + 1) * step;
    const mx = (sx + ex) / 2;
    waves += ` Q ${fmt(sx - step * 0.25)} ${fmt(yBot + 20)} ${fmt(mx)} ${fmt(yBot)} Q ${fmt(ex + step * 0.25)} ${fmt(yBot + 20)} ${fmt(ex)} ${fmt(yBot)}`;
  }
  const body = `M ${fmt(x0)} ${fmt(yBot)} L ${fmt(x0)} ${fmt(ySide)} C ${fmt(x0)} ${fmt(yTop + h * 0.12)} ${fmt(cx - w * 0.32)} ${fmt(yTop)} ${fmt(cx)} ${fmt(yTop)} C ${fmt(cx + w * 0.32)} ${fmt(yTop)} ${fmt(x1)} ${fmt(yTop + h * 0.12)} ${fmt(x1)} ${fmt(ySide)} L ${fmt(x1)} ${fmt(yBot)}${waves} Z`;
  const eyeY = top + h * 0.42;
  const eyeDX = w * 0.17;
  const eyeR = w * 0.085;
  const star = starPoints(cx + w * 0.42, top + h * 0.78, 30, 12, 5);
  return `
  <g>
    <ellipse cx="${fmt(cx)}" cy="${fmt(yBot + 14)}" rx="${fmt(w * 0.52)}" ry="16" fill="#000000" opacity="0.35"/>
    <path d="${body}" fill="#ffffff"/>
    <path d="${sparkle(cx - eyeDX, eyeY, eyeR)}" fill="#1a0b2e"/>
    <path d="${sparkle(cx + eyeDX, eyeY, eyeR)}" fill="#1a0b2e"/>
    <ellipse cx="${fmt(cx - eyeDX - 6)}" cy="${fmt(eyeY + 34)}" rx="11" ry="6" fill="#ffb3d9" opacity="0.75"/>
    <ellipse cx="${fmt(cx + eyeDX + 6)}" cy="${fmt(eyeY + 34)}" rx="11" ry="6" fill="#ffb3d9" opacity="0.75"/>
    <path d="M ${fmt(cx - 15)} ${fmt(eyeY + 52)} Q ${fmt(cx)} ${fmt(eyeY + 63)} ${fmt(cx + 15)} ${fmt(eyeY + 52)}" stroke="#1a0b2e" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    <circle cx="${fmt(cx + w * 0.42)}" cy="${fmt(top + h * 0.78)}" r="40" fill="#ff2e88" opacity="0.25"/>
    <polygon points="${star}" fill="#ff2e88" stroke="#ffffff" stroke-width="3" stroke-linejoin="round"/>
  </g>`;
}

// --- palm tree silhouette ---------------------------------------------------
function palm(baseX: number, baseY: number, scale: number, lean: 1 | -1): string {
  const crownX = baseX + lean * 34 * scale;
  const crownY = baseY - 168 * scale;
  // Trunk: tapered curve from base to crown.
  const trunk = `M ${fmt(baseX - 13 * scale)} ${fmt(baseY)} Q ${fmt(baseX - 16 * scale)} ${fmt(baseY - 90 * scale)} ${fmt(crownX - 7 * scale)} ${fmt(crownY + 6 * scale)} L ${fmt(crownX + 7 * scale)} ${fmt(crownY + 6 * scale)} Q ${fmt(baseX + 8 * scale)} ${fmt(baseY - 84 * scale)} ${fmt(baseX + 13 * scale)} ${fmt(baseY)} Z`;
  // Fronds: stroked arcs fanning out of the crown, drooping at the tips.
  const dirs = [-168, -138, -108, -78, -48, -18, 8];
  let fronds = '';
  for (const deg of dirs) {
    const a = (deg * Math.PI) / 180;
    const len = (78 + ((deg + 168) % 3) * 7) * scale;
    const tipX = crownX + Math.cos(a) * len;
    const tipY = crownY + Math.sin(a) * len * 0.55 + 44 * scale;
    const ctrlX = crownX + Math.cos(a) * len * 0.55;
    const ctrlY = crownY + Math.sin(a) * len * 0.55 - 16 * scale;
    fronds += `<path d="M ${fmt(crownX)} ${fmt(crownY)} Q ${fmt(ctrlX)} ${fmt(ctrlY)} ${fmt(tipX)} ${fmt(tipY)}" stroke="#0d0118" stroke-width="${fmt(9 * scale)}" fill="none" stroke-linecap="round"/>`;
  }
  const nuts = [0, 1, 2]
    .map((i) => `<circle cx="${fmt(crownX - 8 + i * 9)}" cy="${fmt(crownY + 12 + (i % 2) * 6)}" r="${fmt(6 * scale)}" fill="#0d0118"/>`)
    .join('');
  return `<g>${fronds}<path d="${trunk}" fill="#0d0118"/>${nuts}</g>`;
}

// --- skyline silhouette ------------------------------------------------------
function skyline(): string {
  const rnd = mulberry32(20261120);
  let x = -10;
  let out = '';
  while (x < W + 10) {
    const bw = 34 + rnd() * 62;
    const bh = 26 + rnd() * 78;
    out += `<rect x="${fmt(x)}" y="${fmt(HORIZON - bh)}" width="${fmt(bw)}" height="${fmt(bh)}" fill="#160a2e"/>`;
    // A few lit windows, sparse.
    if (rnd() > 0.55) {
      const wx = x + 6 + rnd() * (bw - 16);
      const wy = HORIZON - bh + 8 + rnd() * (bh - 20);
      out += `<rect x="${fmt(wx)}" y="${fmt(wy)}" width="5" height="7" fill="#ffd319" opacity="0.85"/>`;
    }
    x += bw + 2 + rnd() * 10;
  }
  return out;
}

// --- stars -------------------------------------------------------------------
function stars(): string {
  const rnd = mulberry32(1337);
  let out = '';
  for (let i = 0; i < 42; i++) {
    const x = rnd() * W;
    const y = rnd() * 300;
    const r = 1 + rnd() * 2.1;
    const o = 0.25 + rnd() * 0.65;
    out += `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(r)}" fill="#ffffff" opacity="${fmt(o)}"/>`;
  }
  return out;
}

// --- the picture ---------------------------------------------------------------
function buildSvg(): string {
  // Striped synthwave sun: circle, then horizontal bars filled with the sky
  // gradient (same userSpaceOnUse gradient, so they read as gaps in the sun).
  // Each bar is clipped to the circle's width at its height.
  const sunCx = 600;
  const sunCy = 285;
  const sunR = 148;
  const bars = [
    [320, 7],
    [348, 10],
    [378, 14],
    [410, 18],
  ]
    .map(([y, h]) => {
      const dy = y + h / 2 - sunCy;
      const half = Math.sqrt(Math.max(0, sunR * sunR - dy * dy));
      return `<rect x="${fmt(sunCx - half - 2)}" y="${y}" width="${fmt(half * 2 + 4)}" height="${h}" fill="url(#sky)"/>`;
    })
    .join('');
  // Neon grid floor: verticals fanning from the vanishing point, horizontals
  // with growing gaps towards the viewer.
  let grid = `<line x1="0" y1="${HORIZON}" x2="${W}" y2="${HORIZON}" stroke="#ff2e88" stroke-width="3" opacity="0.9"/>`;
  for (let k = -7; k <= 7; k++) {
    grid += `<line x1="600" y1="${HORIZON}" x2="${fmt(600 + k * 175)}" y2="${H}" stroke="#ff2e88" stroke-width="2" opacity="0.45"/>`;
  }
  [448, 462, 480, 502, 528, 558, 592, 630].forEach((y, i) => {
    grid += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#ff2e88" stroke-width="${fmt(1 + i * 0.25)}" opacity="${fmt(0.3 + i * 0.06)}"/>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${HORIZON}">
      <stop offset="0" stop-color="#12042b"/>
      <stop offset="0.38" stop-color="#4b0f54"/>
      <stop offset="0.62" stop-color="#a4136b"/>
      <stop offset="0.85" stop-color="#ff2e63"/>
      <stop offset="1" stop-color="#ff9a3d"/>
    </linearGradient>
    <radialGradient id="sunGlow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ff9a3d" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#ff9a3d" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="sun" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffd319"/>
      <stop offset="1" stop-color="#ff2975"/>
    </linearGradient>
    <linearGradient id="refl" gradientUnits="userSpaceOnUse" x1="0" y1="${HORIZON}" x2="0" y2="580">
      <stop offset="0" stop-color="#ff9a3d" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#ff9a3d" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect x="0" y="0" width="${W}" height="${HORIZON}" fill="url(#sky)"/>
  ${stars()}
  <circle cx="${sunCx}" cy="${sunCy}" r="${sunR + 55}" fill="url(#sunGlow)"/>
  <circle cx="${sunCx}" cy="${sunCy}" r="${sunR}" fill="url(#sun)"/>
  ${bars}
  ${skyline()}
  <rect x="0" y="${HORIZON}" width="${W}" height="${H - HORIZON}" fill="#0d0218"/>
  <rect x="${fmt(sunCx - 46)}" y="${HORIZON}" width="92" height="140" fill="url(#refl)"/>
  ${grid}
  ${palm(96, HORIZON + 2, 1.05, 1)}
  ${palm(1108, HORIZON + 2, 0.92, -1)}
  ${ghost(600, 348, 182, 212)}

  <text x="600" y="82" text-anchor="middle" font-family="'Noto Sans', sans-serif" font-weight="900" font-size="56" letter-spacing="1" fill="#ffffff" stroke="#14042e" stroke-width="10" paint-order="stroke" stroke-linejoin="round">WAITED 13 YEARS FOR GTA VI</text>
  <text x="600" y="636" text-anchor="middle" font-family="'Noto Sans', sans-serif" font-weight="900" font-size="60" letter-spacing="1" fill="#ffd319" stroke="#14042e" stroke-width="10" paint-order="stroke" stroke-linejoin="round">1 SICK DAY. 0 REGRETS.</text>

  <g>
    <rect x="26" y="614" width="168" height="40" rx="20" fill="#ff2e88"/>
    <text x="110" y="642" text-anchor="middle" font-family="'Noto Sans', sans-serif" font-weight="900" font-size="25" fill="#ffffff">make.fun</text>
  </g>
</svg>
`;
}

mkdirSync(OUTPUT_DIR, { recursive: true });
const svg = buildSvg();
writeFileSync(join(OUTPUT_DIR, 'meme.svg'), svg);
try {
  copyFileSync(join(BOT_DIR, 'POST.json'), join(OUTPUT_DIR, 'POST.json'));
} catch (err) {
  console.error(`POST.json could not be copied from ${BOT_DIR}: ${(err as Error).message}`);
  process.exit(1);
}
console.log(`meme.svg written (${svg.length} bytes); POST.json copied to ${OUTPUT_DIR}`);

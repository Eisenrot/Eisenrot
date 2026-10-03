import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";

/*
 * Elation // A Stacked Deck of Stars
 *
 * The contribution calendar is kept as a real 52-week map, but rendered as a
 * constellation. A small set of genuine activity peaks become staged supernovae:
 * the data stays legible first, then the punchline arrives.
 */

const USER = process.env.GH_USER;
const DISPLAY_NAME = process.env.DISPLAY_NAME || "Virt\u00f9";
const TOKEN = process.env.GITHUB_TOKEN;
const OUT = "assets/elation-constellation.svg";
const README = "README.md";

if (!TOKEN) throw new Error("GITHUB_TOKEN is required");
if (!USER) throw new Error("GH_USER is required");

const query = [
  "query($login:String!){",
  " user(login:$login){",
  "  contributionsCollection{",
  "   contributionCalendar{",
  "    totalContributions",
  "    weeks{ contributionDays{ date contributionCount contributionLevel weekday } }",
  "   }",
  "  }",
  " }",
  "}"
].join("");

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    authorization: "Bearer " + TOKEN,
    "content-type": "application/json",
    "user-agent": "elation-constellation"
  },
  body: JSON.stringify({ query, variables: { login: USER } })
});

if (!response.ok) {
  throw new Error("GitHub GraphQL failed: " + response.status + " " + await response.text());
}

const payload = await response.json();
if (payload.errors?.length) throw new Error(JSON.stringify(payload.errors));

const calendar = payload.data?.user?.contributionsCollection?.contributionCalendar;
if (!calendar) throw new Error("No contribution calendar returned for " + USER);

const weeks = calendar.weeks;
const total = calendar.totalContributions;

const LEVEL = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4
};

const W = 920;
const H = 214;
const PITCH = 13;
const GRID_W = (weeks.length - 1) * PITCH;
const GRID_H = 6 * PITCH;
const GRID_X = Math.round((W - GRID_W) / 2);
const GRID_Y = 72;
const LOOP = 16;
const BURST_START = 0.19;
const BURST_END = 0.70;
const RESET = 0.925;

const STAR = [
  "#2c2730",
  "#665b69",
  "#a999a7",
  "#f1e9ee",
  "#df314d"
];

const FIREWORK = [
  "#f7f0ea",
  "#df314d",
  "#a83262",
  "#8b68ff"
];

const RUN_SEED = process.env.ELATION_SEED || randomBytes(12).toString("hex");

function seed32(value) {
  return createHash("sha256").update(String(value)).digest().readUInt32LE(0);
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = state + 0x6D2B79F5 | 0;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(seed32(RUN_SEED));
const rand = (min = 0, max = 1) => min + rng() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const pick = (items) => items[Math.floor(rng() * items.length)];

function shuffle(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;"
  }[c]));
}

function hashText(s) {
  let h = 2166136261;
  for (const ch of String(s)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function center(day) {
  return {
    x: GRID_X + day.wi * PITCH,
    y: GRID_Y + day.weekday * PITCH
  };
}

function starPath(cx, cy, outer, inner = outer * 0.28) {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const angle = -Math.PI / 2 + (Math.PI / 4) * i;
    const r = i % 2 === 0 ? outer : inner;
    pts.push([
      cx + Math.cos(angle) * r,
      cy + Math.sin(angle) * r
    ]);
  }
  return pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(2) + " " + p[1].toFixed(2)).join(" ") + " Z";
}

const days = [];
weeks.forEach((week, wi) => {
  week.contributionDays.forEach((day) => {
    days.push({
      wi,
      weekday: day.weekday,
      date: day.date,
      count: day.contributionCount,
      level: LEVEL[day.contributionLevel] ?? 0
    });
  });
});

const active = days.filter((d) => d.count > 0);

function pickPeaks(target = 8) {
  const strongest = [...active].sort(
    (a, b) => b.count - a.count || b.level - a.level || a.wi - b.wi || a.weekday - b.weekday
  );
  const pool = shuffle(strongest.slice(0, Math.min(strongest.length, Math.max(target + 6, 14))));
  const chosen = [];

  for (const candidate of pool) {
    if (chosen.length >= target) break;
    const tooClose = chosen.some((d) =>
      d.wi === candidate.wi && Math.abs(d.weekday - candidate.weekday) <= 1
    );
    if (!tooClose) chosen.push(candidate);
  }

  for (const candidate of pool) {
    if (chosen.length >= target) break;
    if (!chosen.some((d) => d.date === candidate.date)) chosen.push(candidate);
  }

  return chosen.sort((a, b) => a.wi - b.wi || a.weekday - b.weekday);
}

const peaks = pickPeaks();

const decorativeStars = Array.from({ length: randInt(42, 58) }, () => {
  const x = rand(18, W - 18);
  const y = rand(14, H - 16);
  const r = rand(.26, .74);
  const o = rand(.08, .24);
  return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r.toFixed(2) + '" fill="#f3eee8" opacity="' + o.toFixed(2) + '"/>';
}).join("");

const ghostGrid = days.map((d) => {
  const p = center(d);
  return '<circle cx="' + p.x + '" cy="' + p.y + '" r=".72" fill="#353039" opacity=".58"/>';
}).join("");

function activeStar(d) {
  const p = center(d);
  const base = STAR[d.level];
  const radius = 1.3 + d.level * 0.58;
  const h = hashText(d.date + RUN_SEED);
  const twinkle = rand(2.8, 5.9) + (h % 7) / 20;
  const begin = -rand(0, 4.2);
  const isPeak = peaks.some((x) => x.date === d.date);

  const core = d.level >= 3
    ? '<path d="' + starPath(p.x, p.y, radius + (d.level === 4 ? 1.15 : 0.55)) + '" fill="' + base + '" opacity="' + (d.level === 4 ? ".98" : ".84") + '"/>'
    : '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + radius.toFixed(2) + '" fill="' + base + '"/>';

  return [
    '<g>',
    '<title>' + esc(d.date + ": " + d.count + " contributions") + '</title>',
    '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + (radius + 2.7).toFixed(2) + '" fill="' + base + '" opacity="' + (isPeak ? ".10" : ".045") + '" filter="url(#softGlow)"/>',
    '<g opacity=".78">',
    '<animate attributeName="opacity" dur="' + twinkle.toFixed(1) + 's" begin="' + begin.toFixed(1) + 's" repeatCount="indefinite" values=".62;1;.74;.9;.62" keyTimes="0;.22;.48;.73;1"/>',
    core,
    '</g>',
    '</g>'
  ].join("");
}

const activeGrid = active.map(activeStar).join("");

const peakPoints = peaks.map(center);
const constellationPath = peakPoints.length
  ? "M " + peakPoints.map((p) => p.x.toFixed(1) + " " + p.y.toFixed(1)).join(" L ")
  : "";

const burstOrder = shuffle(peaks);

function burstFraction(index) {
  if (burstOrder.length <= 1) return BURST_START;
  return BURST_START + (BURST_END - BURST_START) * (index / (burstOrder.length - 1));
}

function burst(day, index) {
  const p = center(day);
  const t = burstFraction(index);
  const t0 = Math.max(0, t - 0.008);
  const t1 = Math.min(RESET - 0.13, t + rand(.014, .024));
  const t2 = Math.min(RESET - 0.09, t + rand(.043, .062));
  const t3 = Math.min(RESET - 0.045, t + rand(.082, .105));
  const times = [0, t0, t, t1, t2, t3, RESET, 1].map((v) => v.toFixed(5)).join(";");

  const rayCount = randInt(7, 11);
  const rayRotation = rand(0, 360 / rayCount);
  const rayReach = rand(20, 28);
  const rays = Array.from({ length: rayCount }, (_, j) => {
    const a = (Math.PI * 2 * j) / rayCount + rayRotation * Math.PI / 180;
    const x1 = Math.cos(a) * rand(5.5, 8.0);
    const y1 = Math.sin(a) * rand(5.5, 8.0);
    const x2 = Math.cos(a) * rayReach * rand(.88, 1.12);
    const y2 = Math.sin(a) * rayReach * rand(.88, 1.12);
    return '<line x1="' + x1.toFixed(2) + '" y1="' + y1.toFixed(2) + '" x2="' + x2.toFixed(2) + '" y2="' + y2.toFixed(2) + '"/>';
  }).join("");

  const particleCount = randInt(12, 18);
  const particles = Array.from({ length: particleCount }, (_, j) => {
    const angle = (360 / particleCount) * j + rand(-10, 10);
    const distance = rand(18, 38);
    const color = pick(FIREWORK);
    const shapeKind = randInt(0, 3);
    const shape = shapeKind === 0
      ? '<rect x="-1.8" y="-.7" width="3.6" height="1.4" rx=".3" fill="' + color + '"/>'
      : shapeKind === 1
        ? '<path d="M0 -2.1 L.7 -.7 L2.1 0 L.7 .7 L0 2.1 L-.7 .7 L-2.1 0 L-.7 -.7 Z" fill="' + color + '"/>'
        : '<circle cx="0" cy="0" r="' + rand(.72, 1.28).toFixed(2) + '" fill="' + color + '"/>';

    return [
      '<g transform="rotate(' + angle.toFixed(1) + ')">',
      '<g opacity="0">',
      '<animate attributeName="opacity" dur="' + LOOP + 's" repeatCount="indefinite" keyTimes="' + times + '" values="0;0;1;1;.78;0;0;0"/>',
      '<animateTransform attributeName="transform" type="translate" dur="' + LOOP + 's" repeatCount="indefinite" calcMode="linear" keyTimes="' + times + '" values="0 0;0 0;0 0;' + (distance * .34).toFixed(1) + ' 0;' + (distance * .72).toFixed(1) + ' 0;' + distance.toFixed(1) + ' 0;' + (distance * 1.06).toFixed(1) + ' 0;0 0"/>',
      shape,
      '</g>',
      '</g>'
    ].join("");
  }).join("");

  return [
    '<g transform="translate(' + p.x + " " + p.y + ')">',
    '<g opacity="0" fill="none" stroke-linecap="round">',
    '<animate attributeName="opacity" dur="' + LOOP + 's" repeatCount="indefinite" keyTimes="' + times + '" values="0;0;1;.9;.44;0;0;0"/>',
    '<animateTransform attributeName="transform" type="scale" dur="' + LOOP + 's" repeatCount="indefinite" keyTimes="' + times + '" values=".10;.10;.18;.72;1.08;1.25;1.25;.10"/>',
    '<circle r="' + rand(17, 22).toFixed(1) + '" stroke="#df314d" stroke-width="1.1"/>',
    '<circle r="' + rand(9, 13).toFixed(1) + '" stroke="#f3eee8" stroke-width=".75" stroke-dasharray="2.2 3.5"/>',
    '<g stroke="#f7f0ea" stroke-width="1.05">' + rays + '</g>',
    '</g>',
    particles,
    '<circle r="2.2" fill="#fff8f3" opacity="0">',
    '<animate attributeName="r" dur="' + LOOP + 's" repeatCount="indefinite" keyTimes="' + times + '" values="1.8;1.8;5.4;3.1;1.2;1;1;1.8"/>',
    '<animate attributeName="opacity" dur="' + LOOP + 's" repeatCount="indefinite" keyTimes="' + times + '" values="0;0;1;1;.48;0;0;0"/>',
    '</circle>',
    '</g>'
  ].join("");
}

const bursts = burstOrder.map(burst).join("");

const lineStart = Math.max(0, BURST_START - 0.035);
const lineEnd = Math.min(RESET - 0.09, BURST_END + 0.08);

const constellation = constellationPath ? [
  '<path d="' + constellationPath + '" pathLength="1" fill="none" stroke="#df314d" stroke-width=".85" stroke-dasharray="1" stroke-dashoffset="1" opacity="0">',
  '<animate attributeName="stroke-dashoffset" dur="' + LOOP + 's" repeatCount="indefinite" keyTimes="0;' + lineStart.toFixed(5) + ';' + lineEnd.toFixed(5) + ';' + RESET.toFixed(5) + ';1" values="1;1;0;0;1"/>',
  '<animate attributeName="opacity" dur="' + LOOP + 's" repeatCount="indefinite" keyTimes="0;' + lineStart.toFixed(5) + ';' + lineEnd.toFixed(5) + ';' + RESET.toFixed(5) + ';1" values="0;.06;.42;0;0"/>',
  '</path>'
].join("") : "";

const finaleT = Math.min(0.80, BURST_END + 0.055);
const finaleEnd = Math.min(RESET - 0.025, finaleT + 0.08);
const stampX = GRID_X + GRID_W - 6 + rand(-9, 7);
const stampY = 166 + rand(-4, 4);
const stampRotation = rand(-5.2, 2.4);
const confettiStart = Math.min(RESET - .13, finaleT + .035);

function confettiCannon(side, count = 34) {
  const left = side === "left";
  const originX = left ? 4 : W - 4;
  const originY = rand(128, 153);
  const direction = left ? 1 : -1;

  const flashT0 = Math.max(0, confettiStart - .006);
  const flashT1 = Math.min(RESET - .09, confettiStart + .025);
  const flashT2 = Math.min(RESET - .05, confettiStart + .065);
  const flashTimes = [0, flashT0, confettiStart, flashT1, flashT2, RESET, 1].map((v) => v.toFixed(5)).join(";");

  const cannonFlash = [
    '<g transform="translate(' + originX.toFixed(1) + ' ' + originY.toFixed(1) + ')" opacity="0">',
    '<animate attributeName="opacity" dur="' + LOOP + 's" repeatCount="indefinite" keyTimes="' + flashTimes + '" values="0;0;1;.9;0;0;0"/>',
    '<circle r="4.5" fill="#f7f0ea" opacity=".9"/>',
    '<circle r="11" fill="none" stroke="#df314d" stroke-width="1.1">',
    '<animate attributeName="r" dur="' + LOOP + 's" repeatCount="indefinite" keyTimes="' + flashTimes + '" values="3;3;5;15;22;22;3"/>',
    '</circle>',
    '</g>'
  ].join("");

  const pieces = Array.from({ length: count }, (_, i) => {
    const delay = rand(0, .030);
    const t0 = Math.min(RESET - .12, confettiStart + delay);
    const t1 = Math.min(RESET - .09, t0 + rand(.018, .032));
    const t2 = Math.min(RESET - .045, t0 + rand(.060, .085));
    const t3 = Math.min(RESET - .008, t0 + rand(.108, .135));
    const times = [0, t0, t1, t2, t3, RESET, 1].map((v) => v.toFixed(5)).join(";");

    const dx = direction * rand(105, 360);
    const rise = -rand(28, 105);
    const fall = rand(26, 88);
    const color = pick(FIREWORK);
    const spin = direction * rand(260, 980) * (rng() > .5 ? 1 : -1);
    const width = rand(2.4, 5.2);
    const height = rand(1.2, 2.6);
    const kind = randInt(0, 4);
    const shape = kind === 0
      ? '<circle r="' + rand(.9, 1.6).toFixed(2) + '" fill="' + color + '"/>'
      : kind === 1
        ? '<path d="M0 -2.4 L.75 -.75 L2.4 0 L.75 .75 L0 2.4 L-.75 .75 L-2.4 0 L-.75 -.75 Z" fill="' + color + '"/>'
        : '<rect x="' + (-width / 2).toFixed(2) + '" y="' + (-height / 2).toFixed(2) + '" width="' + width.toFixed(2) + '" height="' + height.toFixed(2) + '" rx=".3" fill="' + color + '"/>';

    return [
      '<g transform="translate(' + originX.toFixed(1) + ' ' + originY.toFixed(1) + ')">',
      '<g opacity="0">',
      '<animate attributeName="opacity" dur="' + LOOP + 's" repeatCount="indefinite" keyTimes="' + times + '" values="0;0;1;1;0;0;0"/>',
      '<animateTransform attributeName="transform" type="translate" dur="' + LOOP + 's" repeatCount="indefinite" calcMode="linear" keyTimes="' + times + '" values="0 0;0 0;' + (dx * .28).toFixed(1) + ' ' + (rise * .55).toFixed(1) + ';' + (dx * .72).toFixed(1) + ' ' + rise.toFixed(1) + ';' + dx.toFixed(1) + ' ' + fall.toFixed(1) + ';' + (dx * 1.03).toFixed(1) + ' ' + (fall + 18).toFixed(1) + ';0 0"/>',
      '<g>',
      '<animateTransform attributeName="transform" type="rotate" dur="' + LOOP + 's" repeatCount="indefinite" keyTimes="' + times + '" values="0;0;' + (spin * .22).toFixed(0) + ';' + (spin * .65).toFixed(0) + ';' + spin.toFixed(0) + ';' + spin.toFixed(0) + ';0"/>',
      shape,
      '</g>',
      '</g>',
      '</g>'
    ].join("");
  }).join("");

  return cannonFlash + pieces;
}

const celebration = confettiCannon("left") + confettiCannon("right");

const svg = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '" role="img" aria-labelledby="title desc">',
  '<title id="title">Who Turned the Commits Into Fireworks? — ' + esc(DISPLAY_NAME) + ' contribution constellation</title>',
  '<desc id="desc">' + esc(DISPLAY_NAME + "'s real 52-week GitHub contribution calendar rendered as a dark constellation. Activity peaks erupt into staged fireworks and confetti before the scene resets.") + '</desc>',
  '<defs>',
  '<linearGradient id="stage" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#050407"/><stop offset=".60" stop-color="#09060b"/><stop offset="1" stop-color="#13070c"/></linearGradient>',
  '<linearGradient id="rule" x1="0" x2="1"><stop stop-color="#df314d"/><stop offset=".18" stop-color="#8d2038"/><stop offset=".70" stop-color="#30222e"/><stop offset="1" stop-color="#171319"/></linearGradient>',
  '<radialGradient id="nebula"><stop stop-color="#a83262" stop-opacity=".18"/><stop offset=".45" stop-color="#6d274d" stop-opacity=".08"/><stop offset="1" stop-color="#050407" stop-opacity="0"/></radialGradient>',
  '<filter id="softGlow" x="-250%" y="-250%" width="600%" height="600%"><feGaussianBlur stdDeviation="2.1"/></filter>',
  '<filter id="titleGlow" x="-50%" y="-100%" width="200%" height="300%"><feGaussianBlur stdDeviation=".9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
  '</defs>',

  '<rect x="1" y="1" width="' + (W - 2) + '" height="' + (H - 2) + '" rx="12" fill="url(#stage)" stroke="#2c1c29" stroke-width="1.2"/>',
  '<ellipse cx="' + (W * rand(.73, .82)).toFixed(1) + '" cy="' + (H * rand(.34, .46)).toFixed(1) + '" rx="' + rand(185, 225).toFixed(0) + '" ry="' + rand(88, 108).toFixed(0) + '" fill="url(#nebula)"/>',
  decorativeStars,

  '<text x="' + GRID_X + '" y="22" fill="#9e969e" font-size="9.4" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" letter-spacing="1.55">' + esc(DISPLAY_NAME.toUpperCase()) + ' // A STACKED DECK OF STARS</text>',
  '<text x="' + (GRID_X + GRID_W) + '" y="22" text-anchor="end" fill="#756c78" font-size="9.2" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" letter-spacing=".7">' + total + ' CONTRIBUTIONS</text>',
  '<text x="' + GRID_X + '" y="47" fill="#f7f0ea" font-size="17.2" font-family="Georgia,Times New Roman,serif" font-style="italic" letter-spacing=".85" filter="url(#titleGlow)">WHO TURNED THE COMMITS INTO FIREWORKS?</text>',
  '<path d="M ' + GRID_X + ' 57 H ' + (GRID_X + GRID_W) + '" stroke="url(#rule)" stroke-width=".9"/>',
  '<path d="M ' + GRID_X + ' 57 H ' + (GRID_X + 92) + '" stroke="#df314d" stroke-width="1.5"/>',

  '<g>' + ghostGrid + '</g>',
  '<g>' + constellation + '</g>',
  '<g>' + activeGrid + '</g>',
  '<g>' + bursts + '</g>',

  '<g opacity="0" transform="translate(' + stampX.toFixed(1) + ' ' + stampY.toFixed(1) + ') rotate(' + stampRotation.toFixed(2) + ')">',
  '<animate attributeName="opacity" dur="' + LOOP + 's" repeatCount="indefinite" keyTimes="0;' + finaleT.toFixed(5) + ';' + (finaleT + .02).toFixed(5) + ';' + finaleEnd.toFixed(5) + ';' + RESET.toFixed(5) + ';1" values="0;0;1;1;0;0"/>',
  '<rect x="-142" y="-13" width="142" height="23" fill="#12080d" stroke="#df314d" stroke-width=".8"/>',
  '<text x="-71" y="2" text-anchor="middle" fill="#df314d" font-size="9.2" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-weight="700" letter-spacing="1.15">CERTIFIED BY NOBODY™</text>',
  '</g>',
  '<g>' + celebration + '</g>',

  '<text x="' + GRID_X + '" y="194" fill="#786e79" font-size="8.8" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" letter-spacing=".68">THE SKY WAS VERSION-CONTROLLED. THIS WAS THE FIRST MISTAKE.</text>',
  '<text x="' + (GRID_X + GRID_W) + '" y="194" text-anchor="end" fill="#4f4652" font-size="8.6" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace">52-WEEK LIVE CONSTELLATION</text>',
  '</svg>'
].join("");

const revision = createHash("sha1")
  .update(JSON.stringify(days.map((d) => [d.date, d.count, d.level])))
  .update(svg)
  .digest("hex")
  .slice(0, 12);

await mkdir("assets", { recursive: true });
await writeFile(OUT, svg, "utf8");

const readme = await readFile(README, "utf8");
const busted = readme.replace(
  /elation-constellation\.svg(?:\?v=[^"]*)?/g,
  "elation-constellation.svg?v=" + revision
);

if (busted !== readme) await writeFile(README, busted, "utf8");

console.log(
  "Wrote " + OUT +
  " for " + USER +
  " (" + total + " contributions, " + active.length + " active days, " +
  peaks.length + " staged supernovae, seed " + RUN_SEED + ", revision " + revision + ")"
);

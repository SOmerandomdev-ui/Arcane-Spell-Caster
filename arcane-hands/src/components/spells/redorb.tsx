import {
  BlurFilter,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Texture,
} from "pixi.js";
import { GlowFilter } from "pixi-filters";
import type { HandState } from "../handTypes.ts";

type RedOrbPalm = {
  x: number;
  y: number;
  palmwidth: number;
  state: HandState;
};

/**
 * One comet-like ribbon: an eccentric orbit around the origin —
 * near-center at perihelion, bulging far out at aphelion — tilted to an
 * arbitrary plane so ribbons fan out across different angles.
 */
type StreakSeed = {
  yaw: number;
  incl: number;
  roll: number;
  theta0: number;
  squish: number;
  skew: number;
  turns: number;
  rMinFrac: number;
  rMaxFrac: number;
  eccPower: number;
  warpAmp: number;
  warpFreq: number;
  warpPhase: number;
  spiral: number;
  speed: number;
  phase: number;
  width: number;
  tailLen: number;
  hueBias: number;
};

export type RedOrbFx = {
  root: Container;
  haze: Sprite;
  /** Soft sphere axes / meridians behind the shell (esp. Z-depth ellipse). */
  axesBack: Graphics;
  /** Streaks with z ≥ 0 (behind / through sphere). */
  streaksBack: Graphics;
  shell: Sprite;
  core: Sprite;
  hot: Graphics;
  /** Soft sphere axes / meridians in front of the shell. */
  axesFront: Graphics;
  /** Streaks with z < 0 (in front of sphere). */
  streaksFront: Graphics;
  streakSeeds: StreakSeed[];
  ageSec: number;
};

/** Linear grow: tiny start → ~1.8× og over 3 seconds, then hold (~40% under prior max). */
const GROW_START = 0.18;
const GROW_MAX = 1.8;
const GROW_DURATION_SEC = 3;

/**
 * Max streak reach from orb center ≈ 2× orb diameter (= 4× radius).
 */
const STREAK_REACH_MUL = 4;
/** Converge / slide speed multiplier. */
const ARC_SPEED_MUL = 10;
/** Relative slide speed. */
const SPEED_SCALE = 0.21;
/** Stroke thickness relative to base seed width. */
const WIDTH_SCALE = 0.55;
/** Outer glow pass: width multiplier and alpha multiplier vs core. */
const GLOW_WIDTH_MUL = 2.6;
const GLOW_ALPHA_MUL = 0.32;
/** Core pass: width multiplier vs base width. */
const CORE_WIDTH_MUL = 0.42;

const C = {
  white: 0xfff5f8,
  hotPink: 0xff6b9d,
  ruby: 0xff1a3c,
  crimson: 0xc40028,
} as const;

function radialTexture(
  size: number,
  stops: ReadonlyArray<readonly [number, string]>
): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return Texture.WHITE;

  const half = size / 2;
  const gradient = context.createRadialGradient(
    half,
    half,
    0,
    half,
    half,
    half
  );
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return Texture.from(canvas);
}

/** Random integer in [lo, hi] inclusive. */
function randInt(lo: number, hi: number): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function makeStreakSeeds(count = randInt(8, 13)): StreakSeed[] {
  return Array.from({ length: count }, () => {
    const yaw = Math.random() * Math.PI * 2;
    const incl = Math.asin(Math.random() * 2 - 1);
    const roll = Math.random() * Math.PI * 2;
    return {
      yaw,
      incl,
      roll,
      theta0: Math.random() * Math.PI * 2,
      squish: 0.25 + Math.random() * 1.05,
      skew: (Math.random() - 0.5) * 0.85,
      turns: 0.35 + Math.random() * 1.8,
      rMinFrac: 0.04 + Math.random() * 0.18,
      rMaxFrac: 0.78 + Math.random() * 0.32,
      eccPower: 0.45 + Math.random() * 1.7,
      warpAmp: Math.random() * 0.55,
      warpFreq: 0.6 + Math.random() * 2.8,
      warpPhase: Math.random() * Math.PI * 2,
      spiral: (Math.random() - 0.5) * 2.4,
      speed: (0.045 + Math.random() * 0.13) * ARC_SPEED_MUL * SPEED_SCALE,
      phase: Math.random(),
      width: (2.4 + Math.random() * 7.2) * WIDTH_SCALE,
      tailLen: 0.12 + Math.random() * 0.34,
      hueBias: Math.random(),
    };
  });
}

/** Perspective project. +Z = behind orb, −Z = toward camera. */
function project3d(
  x: number,
  y: number,
  z: number,
  focal: number
): { x: number; y: number; scale: number } {
  const denom = Math.max(focal * 0.18, focal + z);
  const scale = focal / denom;
  return { x: x * scale, y: y * scale, scale };
}

/**
 * Sample a warped eccentric ribbon: near-center at t≈0, sweeping out and
 * back — the classic red-orb streak pattern.
 */
function sampleStreak(
  seed: StreakSeed,
  t: number,
  sphereR: number
): { x: number; y: number; z: number; rFrac: number } {
  const theta = seed.theta0 + t * Math.PI * 2 * seed.turns;

  const eccRaw = (1 - Math.cos(theta - seed.theta0)) / 2;
  const ecc = Math.pow(Math.max(0, Math.min(1, eccRaw)), seed.eccPower);
  const r = sphereR * (seed.rMinFrac + (seed.rMaxFrac - seed.rMinFrac) * ecc);

  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  let lx = r * (cosT + seed.skew * sinT);
  let ly = r * seed.squish * sinT;
  let lz = r * seed.warpAmp * Math.sin(theta * seed.warpFreq + seed.warpPhase);

  const cr = Math.cos(seed.roll);
  const sr = Math.sin(seed.roll);
  const rx = lx * cr - ly * sr;
  const ry = lx * sr + ly * cr;
  lx = rx;
  ly = ry;

  const yaw = seed.yaw + seed.spiral * t;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const ci = Math.cos(seed.incl);
  const si = Math.sin(seed.incl);

  const y1 = ly * ci - lz * si;
  const z1 = ly * si + lz * ci;
  const x1 = lx;

  const x2 = x1 * cy + z1 * sy;
  const z2 = -x1 * sy + z1 * cy;
  const y2 = y1;

  return { x: x2, y: y2, z: z2, rFrac: r / sphereR };
}

export function createredorb(): RedOrbFx {
  const root = new Container();
  root.filterArea = new Rectangle(-900, -900, 1800, 1800);

  const haze = new Sprite({
    texture: radialTexture(256, [
      [0, "rgba(255,26,60,0.55)"],
      [0.28, "rgba(196,0,40,0.28)"],
      [0.55, "rgba(122,0,24,0.1)"],
      [1, "rgba(122,0,24,0)"],
    ]),
    anchor: 0.5,
  });
  haze.blendMode = "add";
  haze.filters = [new BlurFilter({ strength: 18, quality: 2 })];

  const streaksBack = new Graphics();
  streaksBack.blendMode = "add";
  streaksBack.filters = [new BlurFilter({ strength: 2.5, quality: 2 })];

  const axesBack = new Graphics();
  axesBack.blendMode = "add";
  axesBack.filters = [new BlurFilter({ strength: 1.2, quality: 1 })];

  const shell = new Sprite({
    texture: radialTexture(256, [
      [0, "rgba(255,245,248,0)"],
      [0.2, "rgba(255,107,157,0.15)"],
      [0.45, "rgba(255,26,60,0.55)"],
      [0.72, "rgba(196,0,40,0.35)"],
      [1, "rgba(122,0,24,0)"],
    ]),
    anchor: 0.5,
  });
  shell.blendMode = "add";
  shell.filters = [
    new GlowFilter({
      distance: 18,
      outerStrength: 2.4,
      innerStrength: 0.4,
      color: 0xff1a3c,
      quality: 0.3,
    }),
  ];

  const core = new Sprite({
    texture: radialTexture(128, [
      [0, "rgba(255,40,70,1)"],
      [0.22, "rgba(255,26,60,0.95)"],
      [0.5, "rgba(196,0,40,0.9)"],
      [0.78, "rgba(122,0,24,0.55)"],
      [1, "rgba(80,0,16,0)"],
    ]),
    anchor: 0.5,
  });
  core.blendMode = "add";

  const hot = new Graphics();
  hot.blendMode = "add";

  const axesFront = new Graphics();
  axesFront.blendMode = "add";

  const streaksFront = new Graphics();
  streaksFront.blendMode = "add";

  // Axes + streaks behind shell; axes + streaks in front — reads as a 3D wireframe sphere.
  root.addChild(
    haze,
    axesBack,
    streaksBack,
    shell,
    core,
    hot,
    axesFront,
    streaksFront
  );
  root.visible = false;

  return {
    root,
    haze,
    axesBack,
    streaksBack,
    shell,
    core,
    hot,
    axesFront,
    streaksFront,
    streakSeeds: makeStreakSeeds(),
    ageSec: 0,
  };
}

export function hideredorb(fx: RedOrbFx): void {
  // Reshuffle only when ending an active cast (hide runs every idle frame).
  const wasActive = fx.root.visible || fx.ageSec > 0;
  fx.root.visible = false;
  fx.ageSec = 0;
  if (wasActive) fx.streakSeeds = makeStreakSeeds();
}

type Seg = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  zMid: number;
  width: number;
  alpha: number;
  glowColor: number;
  coreColor: number;
};

/** Pick a color pair (glow / bright core) based on how close to center the point is. */
function colorForRFrac(rFrac: number, hueBias: number): { glow: number; core: number } {
  if (rFrac < 0.25) return { glow: hueBias > 0.4 ? C.hotPink : C.ruby, core: C.ruby };
  if (rFrac < 0.65) return { glow: C.ruby, core: hueBias > 0.5 ? C.hotPink : C.ruby };
  return { glow: C.crimson, core: hueBias > 0.5 ? C.ruby : C.crimson };
}

/** Draw sliding head + fading tail along one eccentric orbit ribbon. */
function collectStreakSegs(
  seed: StreakSeed,
  sphereR: number,
  tick: number,
  focal: number,
  sizeScale: number
): Seg[] {
  const head = (tick * seed.speed + seed.phase) % 1;
  const tailStart = Math.max(0, head - seed.tailLen);
  const steps = 20;
  const segs: Seg[] = [];

  for (let i = 0; i < steps; i++) {
    const t0 = tailStart + ((head - tailStart) * i) / steps;
    const t1 = tailStart + ((head - tailStart) * (i + 1)) / steps;
    if (t1 <= t0) continue;

    const a = sampleStreak(seed, t0, sphereR);
    const b = sampleStreak(seed, t1, sphereR);
    const p0 = project3d(a.x, a.y, a.z, focal);
    const p1 = project3d(b.x, b.y, b.z, focal);

    const along = seed.tailLen < 1e-4 ? 1 : (t1 - tailStart) / seed.tailLen;
    const tailFade = along * along;
    const alpha = 0.95 * tailFade * Math.min(1.1, p0.scale);

    const width =
      seed.width * sizeScale * (0.4 + along * 0.85) * p0.scale * (1 - b.rFrac * 0.25);

    const { glow, core } = colorForRFrac(b.rFrac, seed.hueBias);

    segs.push({
      x0: p0.x,
      y0: p0.y,
      x1: p1.x,
      y1: p1.y,
      zMid: (a.z + b.z) * 0.5,
      width,
      alpha,
      glowColor: glow,
      coreColor: core,
    });
  }

  return segs;
}

/** Two-pass render: soft wide glow underneath, thin bright core on top. */
function strokeSegs(g: Graphics, segs: Seg[]): void {
  segs.sort((a, b) => b.zMid - a.zMid);

  for (const s of segs) {
    if (s.alpha < 0.02) continue;
    g.moveTo(s.x0, s.y0);
    g.lineTo(s.x1, s.y1);
    g.stroke({
      width: s.width * GLOW_WIDTH_MUL,
      color: s.glowColor,
      alpha: s.alpha * GLOW_ALPHA_MUL,
      cap: "round",
      join: "round",
    });
  }

  for (const s of segs) {
    if (s.alpha < 0.02) continue;
    g.moveTo(s.x0, s.y0);
    g.lineTo(s.x1, s.y1);
    g.stroke({
      width: s.width * CORE_WIDTH_MUL,
      color: s.coreColor,
      alpha: s.alpha,
      cap: "round",
      join: "round",
    });
  }
}

type AxisSeg = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  zMid: number;
  width: number;
  alpha: number;
};

/**
 * Sketch-style sphere wireframe: vertical + horizontal diameters, equator,
 * and the Z-depth meridian (the tilted ellipse that sells volume).
 * Slow yaw so the Z ring reads as a true depth plane.
 */
function collectAxisSegs(
  sphereR: number,
  focal: number,
  tick: number
): AxisSeg[] {
  const yaw = tick * 0.35;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const segs: AxisSeg[] = [];
  const steps = 48;

  const rot = (x: number, y: number, z: number) => ({
    x: x * cosY + z * sinY,
    y,
    z: -x * sinY + z * cosY,
  });

  const emitRing = (
    sample: (u: number) => { x: number; y: number; z: number },
    width: number,
    alphaBase: number,
    dashed: boolean
  ) => {
    for (let i = 0; i < steps; i++) {
      if (dashed && i % 2 === 1) continue;
      const u0 = i / steps;
      const u1 = (i + 1) / steps;
      const p0raw = sample(u0);
      const p1raw = sample(u1);
      const a = rot(p0raw.x, p0raw.y, p0raw.z);
      const b = rot(p1raw.x, p1raw.y, p1raw.z);
      const p0 = project3d(a.x, a.y, a.z, focal);
      const p1 = project3d(b.x, b.y, b.z, focal);
      // Dim farther (behind) segments so the front rim pops.
      const zN = ((a.z + b.z) * 0.5) / sphereR;
      const depthFade = 0.55 + 0.45 * (0.5 - Math.max(-1, Math.min(1, zN)) * 0.5);
      segs.push({
        x0: p0.x,
        y0: p0.y,
        x1: p1.x,
        y1: p1.y,
        zMid: (a.z + b.z) * 0.5,
        width: width * p0.scale,
        alpha: alphaBase * depthFade * Math.min(1.15, p0.scale),
      });
    }
  };

  // Equator (XZ) — horizontal ellipse in the sketch.
  emitRing(
    (u) => {
      const th = u * Math.PI * 2;
      return { x: sphereR * Math.cos(th), y: 0, z: sphereR * Math.sin(th) };
    },
    1.35,
    0.28,
    false
  );

  // Front/back meridian (XY) — vertical ring.
  emitRing(
    (u) => {
      const th = u * Math.PI * 2;
      return { x: sphereR * Math.cos(th), y: sphereR * Math.sin(th), z: 0 };
    },
    1.2,
    0.22,
    false
  );

  // Z-depth meridian (YZ) — the sketch's tilted depth ellipse.
  emitRing(
    (u) => {
      const th = u * Math.PI * 2;
      return { x: 0, y: sphereR * Math.sin(th), z: sphereR * Math.cos(th) };
    },
    1.55,
    0.38,
    false
  );

  // Dashed wrap along the upper Z path — depth motion cue from the sketch.
  emitRing(
    (u) => {
      const th = -0.35 + u * 1.9;
      return {
        x: sphereR * 0.15 * Math.sin(th),
        y: sphereR * Math.cos(th) * 0.55,
        z: sphereR * Math.sin(th),
      };
    },
    1.1,
    0.42,
    true
  );

  return segs;
}

function strokeAxisSegs(g: Graphics, segs: AxisSeg[]): void {
  segs.sort((a, b) => b.zMid - a.zMid);
  for (const s of segs) {
    if (s.alpha < 0.02) continue;
    g.moveTo(s.x0, s.y0);
    g.lineTo(s.x1, s.y1);
    g.stroke({
      width: s.width,
      color: C.ruby,
      alpha: s.alpha,
      cap: "round",
      join: "round",
    });
  }
}

export function updateredorb(
  fx: RedOrbFx,
  palm: RedOrbPalm,
  tick: number,
  dt: number,
  screenWidth: number,
  screenHeight: number
): void {
  const tip = palm.state.tip.index;
  const knuckle = palm.state.base.index;
  const tipX = screenWidth - tip.x * screenWidth;
  const tipY = tip.y * screenHeight * 0.9;
  const knuckleX = screenWidth - knuckle.x * screenWidth;
  const knuckleY = knuckle.y * screenHeight * 0.9;
  const baseRadius = Math.max(9, palm.palmwidth * 0.18);

  fx.ageSec += dt / 60;
  const growT = Math.min(1, fx.ageSec / GROW_DURATION_SEC);
  const grow = GROW_START + (GROW_MAX - GROW_START) * growT;
  const radius = baseRadius * grow;

  const pulse = 1 + Math.sin(tick * 2.4) * 0.06;
  const hazeSize = radius * 9.5 * pulse;
  const shellSize = radius * 4.2 * pulse;
  // Visual orb radius — rests on the fingertip, offset along the finger.
  const orbR = shellSize * 0.5;

  // Pointing direction in screen space (knuckle → tip). Orb sits beyond the tip.
  let dirX = tipX - knuckleX;
  let dirY = tipY - knuckleY;
  const dirLen = Math.hypot(dirX, dirY);
  if (dirLen > 1e-3) {
    dirX /= dirLen;
    dirY /= dirLen;
  } else {
    dirX = 0;
    dirY = -1;
  }

  fx.root.visible = true;
  fx.root.position.set(tipX + dirX * orbR, tipY + dirY * orbR);

  fx.haze.width = hazeSize;
  fx.haze.height = hazeSize;
  fx.haze.alpha = 0.85 + Math.sin(tick * 1.7) * 0.1;

  fx.shell.width = shellSize * 1.05;
  fx.shell.height = shellSize * 1.05;

  const coreSize = radius * 2.15 * pulse;
  fx.core.visible = true;
  fx.core.width = coreSize * 1.05;
  fx.core.height = coreSize * 1.05;
  fx.hot.clear();

  // Sphere the ribbons / axes ride — sized to the visible shell.
  // Streaks flare out to ~2× the orb diameter from center.
  const sphereR = orbR * STREAK_REACH_MUL;
  const focal = sphereR * 3.2;

  fx.axesBack.clear();
  fx.streaksBack.clear();
  fx.axesFront.clear();
  fx.streaksFront.clear();

  const backSegs: Seg[] = [];
  const frontSegs: Seg[] = [];
  const streakSizeScale = grow;

  for (const seed of fx.streakSeeds) {
    const segs = collectStreakSegs(seed, sphereR, tick, focal, streakSizeScale);
    for (const s of segs) {
      if (s.zMid >= 0) backSegs.push(s);
      else frontSegs.push(s);
    }
  }

  const axisBack: AxisSeg[] = [];
  const axisFront: AxisSeg[] = [];
  for (const s of collectAxisSegs(orbR * 0.98, focal, tick)) {
    if (s.zMid >= 0) axisBack.push(s);
    else axisFront.push(s);
  }

  strokeAxisSegs(fx.axesBack, axisBack);
  strokeSegs(fx.streaksBack, backSegs);
  strokeAxisSegs(fx.axesFront, axisFront);
  strokeSegs(fx.streaksFront, frontSegs);
}
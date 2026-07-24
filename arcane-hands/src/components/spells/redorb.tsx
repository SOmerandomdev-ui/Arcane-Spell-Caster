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

type RibbonSeed = {
  phase: number;
  length: number;
  width: number;
  tilt: number;
  speed: number;
  twist: number;
};

type MoteSeed = {
  angle: number;
  radius: number;
  speed: number;
  size: number;
};

export type RedOrbFx = {
  root: Container;
  haze: Sprite;
  ribbonsSoft: Graphics;
  ribbonsSharp: Graphics;
  shell: Sprite;
  core: Sprite;
  hot: Graphics;
  motes: Graphics;
  ribbonSeeds: RibbonSeed[];
  moteSeeds: MoteSeed[];
  ageSec: number;
};

/** Linear grow: tiny start → 3× og over 3 seconds, then hold. */
const GROW_START = 0.18;
const GROW_MAX = 3;
const GROW_DURATION_SEC = 3;

const C = {
  white: 0xfff5f8,
  hotPink: 0xff6b9d,
  ruby: 0xff1a3c,
  crimson: 0xc40028,
  deep: 0x7a0018,
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

function makeRibbonSeeds(count: number): RibbonSeed[] {
  return Array.from({ length: count }, (_, i) => ({
    phase: (i / count) * Math.PI * 2 + Math.random() * 0.4,
    length: 0.72 + Math.random() * 0.55,
    width: 4 + Math.random() * 9,
    tilt: 0.55 + Math.random() * 0.55,
    speed: 0.55 + Math.random() * 0.85,
    twist: 1.6 + Math.random() * 1.4,
  }));
}

function makeMoteSeeds(count: number): MoteSeed[] {
  return Array.from({ length: count }, () => ({
    angle: Math.random() * Math.PI * 2,
    radius: 1.1 + Math.random() * 1.8,
    speed: 0.9 + Math.random() * 1.6,
    size: 0.8 + Math.random() * 1.8,
  }));
}

export function createredorb(): RedOrbFx {
  const root = new Container();
  root.filterArea = new Rectangle(-280, -280, 560, 560);

  // Soft atmospheric bleed around the finger tip.
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

  const ribbonsSoft = new Graphics();
  ribbonsSoft.blendMode = "add";
  ribbonsSoft.filters = [new BlurFilter({ strength: 6, quality: 2 })];

  const ribbonsSharp = new Graphics();
  ribbonsSharp.blendMode = "add";

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
      [0, "rgba(255,250,252,1)"],
      [0.22, "rgba(255,180,200,0.95)"],
      [0.5, "rgba(255,40,80,0.9)"],
      [0.78, "rgba(196,0,40,0.55)"],
      [1, "rgba(122,0,24,0)"],
    ]),
    anchor: 0.5,
  });
  core.blendMode = "add";

  const hot = new Graphics();
  hot.blendMode = "add";

  const motes = new Graphics();
  motes.blendMode = "add";

  root.addChild(haze, ribbonsSoft, ribbonsSharp, shell, core, hot, motes);
  root.visible = false;

  return {
    root,
    haze,
    ribbonsSoft,
    ribbonsSharp,
    shell,
    core,
    hot,
    motes,
    ribbonSeeds: makeRibbonSeeds(7),
    moteSeeds: makeMoteSeeds(28),
    ageSec: 0,
  };
}

export function hideredorb(fx: RedOrbFx): void {
  fx.root.visible = false;
  fx.ageSec = 0;
}

/** Draw one inward-spiraling energy ribbon (wide tail → tight tip). */
function drawRibbon(
  g: Graphics,
  seed: RibbonSeed,
  radius: number,
  tick: number,
  soft: boolean
): void {
  const steps = soft ? 18 : 26;
  const maxR = radius * (2.4 + seed.length * 1.1);
  const startAngle = seed.phase + tick * seed.speed;

  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    // Spiral inward: outer start → core.
    const r0 = maxR * (1 - t0 * 0.92);
    const r1 = maxR * (1 - t1 * 0.92);
    const a0 = startAngle + t0 * seed.twist * Math.PI;
    const a1 = startAngle + t1 * seed.twist * Math.PI;
    const x0 = Math.cos(a0) * r0;
    const y0 = Math.sin(a0) * r0 * seed.tilt;
    const x1 = Math.cos(a1) * r1;
    const y1 = Math.sin(a1) * r1 * seed.tilt;

    // Tail faint + wide; near core bright + thin.
    const fade = soft
      ? 0.08 + (1 - t0) * 0.22
      : 0.18 + (1 - t0) * 0.55;
    const width = seed.width * (soft ? 1.35 : 1) * (0.35 + (1 - t0) * 1.1);
    const color = soft
      ? C.crimson
      : t0 > 0.7
        ? C.hotPink
        : t0 > 0.4
          ? C.ruby
          : C.crimson;

    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke({ width, color, alpha: fade, cap: "round", join: "round" });
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
  const x = screenWidth - tip.x * screenWidth;
  const y = tip.y * screenHeight * 0.9;
  const baseRadius = Math.max(9, palm.palmwidth * 0.18);

  // dt is Pixi deltaTime (~1 per frame @ 60fps) → seconds.
  fx.ageSec += dt / 60;
  const t = Math.min(1, fx.ageSec / GROW_DURATION_SEC);
  const grow = GROW_START + (GROW_MAX - GROW_START) * t;
  const radius = baseRadius * grow;

  fx.root.visible = true;
  fx.root.position.set(x, y);

  const pulse = 1 + Math.sin(tick * 2.4) * 0.06;
  const hazeSize = radius * 9.5 * pulse;
  fx.haze.width = hazeSize;
  fx.haze.height = hazeSize;
  fx.haze.alpha = 0.85 + Math.sin(tick * 1.7) * 0.1;

  const shellSize = radius * 4.2 * pulse;
  fx.shell.width = shellSize * 1.05;
  fx.shell.height = shellSize * 1.05;

  const coreSize = radius * 2.15 * pulse;
  fx.core.width = coreSize * 1.05;
  fx.core.height = coreSize * 1.05;

  // Hot white pin at the absolute center.
  const hotR = radius * 0.42 * pulse;
  fx.hot
    .clear()
    .circle(0, 0, hotR * 1.6)
    .fill({ color: C.hotPink, alpha: 0.35 })
    .circle(0, 0, hotR)
    .fill({ color: C.white, alpha: 0.95 });

  // Inward-sucking energy ribbons.
  fx.ribbonsSoft.clear();
  fx.ribbonsSharp.clear();
  for (const seed of fx.ribbonSeeds) {
    drawRibbon(fx.ribbonsSoft, seed, radius, tick, true);
    drawRibbon(fx.ribbonsSharp, seed, radius, tick + 0.35, false);
  }

  // Sparks spiraling into the core.
  fx.motes.clear();
  for (const mote of fx.moteSeeds) {
    const orbit =
      radius * mote.radius * (0.55 + ((tick * mote.speed * 0.08) % 1));
    // Pull inward over time within each cycle.
    const pull = (tick * mote.speed * 0.12) % 1;
    const r = orbit * (1.35 - pull * 1.05);
    const angle = mote.angle - tick * mote.speed * 0.55;
    const mx = Math.cos(angle) * r;
    const my = Math.sin(angle) * r * 0.62;
    const alpha = 0.25 + (1 - pull) * 0.55;
    const size = mote.size * (0.6 + (1 - pull) * 0.9) * grow;
    fx.motes.circle(mx, my, size).fill({
      color: pull > 0.7 ? C.white : C.ruby,
      alpha,
    });
  }
}

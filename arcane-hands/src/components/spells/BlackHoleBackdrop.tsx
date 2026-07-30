import { Container, Graphics, Sprite, Texture } from "pixi.js";

/**
 * Full-screen black hole scene: deep space, drifting nebula, a lensed photon
 * ring with chromatic fringing, and a pure black event horizon.
 *
 * Every layer is baked into a canvas texture once at startup, so the per-frame
 * work is transforms and alpha only (no runtime filters, no re-tesselation).
 */

/** Hole geometry is authored around this radius, then scaled to the screen. */
const HOLE_UNITS = 100;

/** Where the hole sits in the frame, as a fraction of the canvas. */
const HOLE_CENTER = { x: 0.4, y: 0.47 } as const;

type StarSeed = { x: number; y: number; radius: number; alpha: number };

type NebulaBlob = {
  sprite: Sprite;
  /** Anchor position as a fraction of the canvas. */
  anchorX: number;
  anchorY: number;
  spread: number;
  baseAlpha: number;
  drift: number;
  phase: number;
};

type Streak = {
  sprite: Sprite;
  speed: number;
  offset: number;
};

export type BlackholeBackdrop = {
  root: Container;
  space: Sprite;
  starsFar: Graphics;
  starsNear: Graphics;
  farSeeds: StarSeed[];
  nearSeeds: StarSeed[];
  blobs: NebulaBlob[];
  hole: Container;
  halo: Sprite;
  crescent: Sprite;
  /** Resting scale of the rim, so the pulse can multiply it without drifting. */
  crescentScale: number;
  chroma: Sprite;
  streaks: Streak[];
  ageSec: number;
  width: number;
  height: number;
};

const NEBULA_LAYOUT = [
  { anchorX: 0.79, anchorY: 0.33, size: 1.1, alpha: 0.95, drift: 0.07, tint: 0xd6e6ff },
  { anchorX: 0.92, anchorY: 0.6, size: 0.85, alpha: 0.8, drift: 0.05, tint: 0xb4d0ff },
  { anchorX: 0.68, anchorY: 0.78, size: 0.7, alpha: 0.6, drift: 0.09, tint: 0xe8f2ff },
  { anchorX: 0.16, anchorY: 0.22, size: 0.8, alpha: 0.45, drift: 0.06, tint: 0xb8d2ff },
  { anchorX: 0.06, anchorY: 0.74, size: 0.65, alpha: 0.4, drift: 0.08, tint: 0x9dc0f4 },
  { anchorX: 0.55, anchorY: 0.12, size: 0.6, alpha: 0.35, drift: 0.1, tint: 0xeef5ff },
] as const;

const STREAK_LAYOUT = [
  { radius: 132, speed: 0.16, alpha: 0.5, flatten: 0.34 },
  { radius: 168, speed: -0.11, alpha: 0.38, flatten: 0.26 },
  { radius: 214, speed: 0.08, alpha: 0.26, flatten: 0.2 },
  { radius: 268, speed: -0.06, alpha: 0.18, flatten: 0.16 },
] as const;

function makeCanvas(size: number): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D | null } {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  return { canvas, context: canvas.getContext("2d") };
}

function radialTexture(size: number, stops: ReadonlyArray<readonly [number, string]>): Texture {
  const { canvas, context } = makeCanvas(size);
  if (!context) return Texture.WHITE;

  const half = size / 2;
  const gradient = context.createRadialGradient(half, half, 0, half, half, half);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return Texture.from(canvas);
}

/** Wispy cloud built from a pile of soft puffs, so no two blobs read the same. */
function cloudTexture(size: number): Texture {
  const { canvas, context } = makeCanvas(size);
  if (!context) return Texture.WHITE;

  for (let puff = 0; puff < 22; puff++) {
    const cx = size * (0.2 + Math.random() * 0.6);
    const cy = size * (0.24 + Math.random() * 0.52);
    // Stretched puffs read as wind-blown wisps rather than round clouds.
    const radius = size * (0.05 + Math.random() * 0.2);
    const squash = 0.35 + Math.random() * 0.75;
    const peak = 0.07 + Math.random() * 0.12;

    context.save();
    context.translate(cx, cy);
    context.rotate(Math.random() * Math.PI);
    context.scale(1, squash);

    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radius);
    gradient.addColorStop(0, `rgba(232,244,255,${peak})`);
    gradient.addColorStop(0.4, `rgba(168,204,255,${peak * 0.5})`);
    gradient.addColorStop(1, "rgba(88,138,220,0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
  return Texture.from(canvas);
}

/**
 * The bright lensed rim. Three passes (wide/dim to thin/hot) fake the light
 * falloff of a photon ring without paying for a blur filter every frame.
 */
function crescentTexture(size: number): Texture {
  const { canvas, context } = makeCanvas(size);
  if (!context) return Texture.WHITE;

  const half = size / 2;
  const radius = size * 0.33;
  const passes = [
    { width: size * 0.14, blur: size * 0.05, alpha: 0.2 },
    { width: size * 0.055, blur: size * 0.02, alpha: 0.42 },
    { width: size * 0.014, blur: size * 0.006, alpha: 0.9 },
  ];

  context.lineCap = "round";
  for (const pass of passes) {
    const gradient = context.createLinearGradient(half - radius, half + radius, half + radius, half - radius);
    gradient.addColorStop(0, `rgba(150,196,255,0)`);
    gradient.addColorStop(0.3, `rgba(214,236,255,${pass.alpha * 0.75})`);
    gradient.addColorStop(0.62, `rgba(255,255,255,${pass.alpha})`);
    gradient.addColorStop(1, `rgba(126,176,255,0)`);

    context.filter = `blur(${pass.blur}px)`;
    context.strokeStyle = gradient;
    context.lineWidth = pass.width;
    context.beginPath();
    context.arc(half, half, radius, Math.PI * 0.58, Math.PI * 2.02);
    context.stroke();
  }
  context.filter = "none";
  return Texture.from(canvas);
}

/** Chromatic fringe: gravity splits the rim light into colour bands. */
function chromaTexture(size: number): Texture {
  const { canvas, context } = makeCanvas(size);
  if (!context) return Texture.WHITE;

  const half = size / 2;
  const bands = [
    { color: "255,104,72", radius: 0.4 },
    { color: "255,206,104", radius: 0.386 },
    { color: "132,255,186", radius: 0.372 },
    { color: "126,190,255", radius: 0.358 },
  ];

  context.lineCap = "round";
  context.filter = `blur(${size * 0.03}px)`;
  for (const band of bands) {
    const gradient = context.createLinearGradient(half - size * 0.4, half, half + size * 0.4, half);
    gradient.addColorStop(0, `rgba(${band.color},0)`);
    gradient.addColorStop(0.42, `rgba(${band.color},0.72)`);
    gradient.addColorStop(1, `rgba(${band.color},0)`);

    context.strokeStyle = gradient;
    context.lineWidth = size * 0.024;
    context.beginPath();
    context.arc(half, half, size * band.radius, Math.PI * 1.12, Math.PI * 1.88);
    context.stroke();
  }
  context.filter = "none";
  return Texture.from(canvas);
}

/** A single smeared orbit of infalling matter. */
function streakTexture(size: number): Texture {
  const { canvas, context } = makeCanvas(size);
  if (!context) return Texture.WHITE;

  const half = size / 2;
  const radius = size * 0.36;
  const passes = [
    { width: size * 0.06, blur: size * 0.028, alpha: 0.3 },
    { width: size * 0.012, blur: size * 0.008, alpha: 0.7 },
  ];

  context.lineCap = "round";
  for (const pass of passes) {
    const gradient = context.createLinearGradient(half - radius, half, half + radius, half);
    gradient.addColorStop(0, "rgba(160,200,255,0)");
    gradient.addColorStop(0.4, `rgba(214,234,255,${pass.alpha * 0.7})`);
    gradient.addColorStop(0.75, `rgba(255,255,255,${pass.alpha})`);
    gradient.addColorStop(1, "rgba(150,190,255,0)");

    context.filter = `blur(${pass.blur}px)`;
    context.strokeStyle = gradient;
    context.lineWidth = pass.width;
    context.beginPath();
    context.arc(half, half, radius, Math.PI * 0.08, Math.PI * 0.92);
    context.stroke();
  }
  context.filter = "none";
  return Texture.from(canvas);
}

function makeStarSeeds(count: number, maxRadius: number): StarSeed[] {
  return Array.from({ length: count }, () => ({
    x: Math.random(),
    y: Math.random(),
    radius: 0.4 + Math.random() * maxRadius,
    alpha: 0.25 + Math.random() * 0.6,
  }));
}

function drawStars(layer: Graphics, seeds: StarSeed[], width: number, height: number): void {
  layer.clear();
  for (const star of seeds) {
    layer.circle(star.x * width, star.y * height, star.radius).fill({ color: 0xffffff, alpha: star.alpha });
  }
}

export function createBlackholeBackdrop(): BlackholeBackdrop {
  const root = new Container();

  // Deep space gradient, opaque so it fully replaces the room.
  const space = new Sprite({
    texture: radialTexture(512, [
      [0, "rgba(11,18,34,1)"],
      [0.4, "rgba(5,8,17,1)"],
      [1, "rgba(1,1,4,1)"],
    ]),
    anchor: 0.5,
  });

  const starsFar = new Graphics();
  const starsNear = new Graphics();
  const farSeeds = makeStarSeeds(150, 0.9);
  const nearSeeds = makeStarSeeds(45, 1.6);

  const nebula = new Container();
  const blobs: NebulaBlob[] = NEBULA_LAYOUT.map((layout, index) => {
    const sprite = new Sprite({ texture: cloudTexture(512), anchor: 0.5, tint: layout.tint });
    sprite.blendMode = "add";
    sprite.alpha = layout.alpha;
    sprite.rotation = index * 0.9;
    nebula.addChild(sprite);

    return {
      sprite,
      anchorX: layout.anchorX,
      anchorY: layout.anchorY,
      spread: layout.size,
      baseAlpha: layout.alpha,
      drift: layout.drift,
      phase: index * 1.7,
    };
  });

  const hole = new Container();

  const halo = new Sprite({
    texture: radialTexture(512, [
      [0, "rgba(0,0,0,0)"],
      [0.2, "rgba(0,0,0,0)"],
      [0.32, "rgba(130,176,255,0.26)"],
      [0.48, "rgba(64,106,196,0.09)"],
      [1, "rgba(16,34,80,0)"],
    ]),
    anchor: 0.5,
  });
  halo.blendMode = "add";
  halo.width = HOLE_UNITS * 5.4;
  halo.height = HOLE_UNITS * 5.4;

  // Flattened so infalling matter reads as a disk seen near edge-on.
  const streakLayer = new Container();
  const streaks: Streak[] = STREAK_LAYOUT.map((layout, index) => {
    const size = layout.radius / 0.36;
    const sprite = new Sprite({ texture: streakTexture(512), anchor: 0.5 });
    sprite.blendMode = "add";
    sprite.alpha = layout.alpha;
    sprite.width = size;
    sprite.height = size * layout.flatten * 2.4;
    streakLayer.addChild(sprite);

    return { sprite, speed: layout.speed, offset: index * 1.3 };
  });

  const crescent = new Sprite({ texture: crescentTexture(512), anchor: 0.5 });
  crescent.blendMode = "add";
  crescent.width = (HOLE_UNITS * 1.06) / 0.33;
  crescent.height = (HOLE_UNITS * 1.06) / 0.33;
  crescent.rotation = -0.35;

  const chroma = new Sprite({ texture: chromaTexture(512), anchor: 0.5 });
  chroma.blendMode = "add";
  chroma.width = (HOLE_UNITS * 1.5) / 0.4;
  chroma.height = (HOLE_UNITS * 1.5) / 0.4;
  chroma.alpha = 0.5;
  chroma.rotation = -0.22;

  // Added last: accretion light has to terminate against an opaque horizon.
  // Tight falloff: a wide soft edge would bloat the silhouette and wash out
  // the rim light sitting just outside it.
  const horizon = new Sprite({
    texture: radialTexture(512, [
      [0, "rgba(0,0,0,1)"],
      [0.93, "rgba(0,0,0,1)"],
      [0.97, "rgba(0,0,0,0.7)"],
      [1, "rgba(0,0,0,0)"],
    ]),
    anchor: 0.5,
  });
  horizon.width = HOLE_UNITS * 2.15;
  horizon.height = HOLE_UNITS * 2.15;

  hole.addChild(halo, streakLayer, crescent, chroma, horizon);
  root.addChild(space, starsFar, starsNear, nebula, hole);

  return {
    root,
    space,
    starsFar,
    starsNear,
    farSeeds,
    nearSeeds,
    blobs,
    hole,
    halo,
    crescent,
    crescentScale: crescent.scale.x,
    chroma,
    streaks,
    ageSec: 0,
    width: 0,
    height: 0,
  };
}

/** Re-fit every layer to the canvas. Safe to call on each resize. */
export function layoutBlackholeBackdrop(backdrop: BlackholeBackdrop, width: number, height: number): void {
  if (width <= 0 || height <= 0) return;

  backdrop.width = width;
  backdrop.height = height;

  // Oversized so the gradient edge never shows once layers drift.
  backdrop.space.width = width * 1.25;
  backdrop.space.height = height * 1.25;
  backdrop.space.position.set(width * HOLE_CENTER.x, height * HOLE_CENTER.y);

  drawStars(backdrop.starsFar, backdrop.farSeeds, width, height);
  drawStars(backdrop.starsNear, backdrop.nearSeeds, width, height);

  const cloudSpan = Math.max(width, height);
  for (const blob of backdrop.blobs) {
    const size = cloudSpan * blob.spread;
    blob.sprite.width = size;
    blob.sprite.height = size;
    blob.sprite.position.set(blob.anchorX * width, blob.anchorY * height);
  }

  const radius = Math.min(width * 0.14, height * 0.22);
  backdrop.hole.scale.set(radius / HOLE_UNITS);
  backdrop.hole.position.set(width * HOLE_CENTER.x, height * HOLE_CENTER.y);
}

/** Transform/alpha only, so this stays cheap enough to run every frame. */
export function updateBlackholeBackdrop(backdrop: BlackholeBackdrop, deltaMS: number): void {
  backdrop.ageSec += deltaMS / 1000;
  const time = backdrop.ageSec;
  const { width, height } = backdrop;
  if (width <= 0 || height <= 0) return;

  for (const blob of backdrop.blobs) {
    const wobble = Math.sin(time * blob.drift + blob.phase);
    blob.sprite.position.set(
      blob.anchorX * width + wobble * width * 0.02,
      blob.anchorY * height + Math.cos(time * blob.drift * 0.8 + blob.phase) * height * 0.015,
    );
    blob.sprite.rotation += 0.00004 * deltaMS;
    blob.sprite.alpha = blob.baseAlpha * (0.82 + wobble * 0.18);
  }

  for (const streak of backdrop.streaks) {
    streak.sprite.rotation = time * streak.speed + streak.offset;
  }

  // Slow breathing of the rim sells the gravity well without drawing the eye.
  const pulse = 1 + Math.sin(time * 0.5) * 0.012;
  backdrop.crescent.scale.set(backdrop.crescentScale * pulse);
  backdrop.halo.alpha = 0.62 + Math.sin(time * 0.35) * 0.1;
  backdrop.chroma.alpha = 0.48 + Math.sin(time * 0.7 + 1.2) * 0.08;
  backdrop.starsNear.alpha = 0.75 + Math.sin(time * 1.1) * 0.22;
  backdrop.starsFar.alpha = 0.8 + Math.sin(time * 0.8 + 2.1) * 0.16;
}

export function destroyBlackholeBackdrop(backdrop: BlackholeBackdrop): void {
  backdrop.root.destroy({ children: true, texture: true });
}

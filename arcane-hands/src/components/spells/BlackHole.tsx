import {
  BlurFilter,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Texture,
} from "pixi.js";
import { BackdropBlurFilter } from "pixi-filters";

type BlackHolePalm = {
  x: number;
  y: number;
  palmwidth: number;
};

type OrbitSeed = {
  angle: number;
  radius: number;
  speed: number;
  size: number;
  depth: number;
};

export type BlackHoleFx = {
  root: Container;
  lens: Sprite;
  lensFilter: BackdropBlurFilter;
  outerGlow: Sprite;
  disk: Container;
  diskGlow: Graphics;
  diskSharp: Graphics;
  core: Sprite;
  eventHorizon: Graphics;
  motes: Graphics;
  orbitSeeds: OrbitSeed[];
  ageSec: number;
  smoothX: number;
  smoothY: number;
  smoothRadius: number;
  hasPosition: boolean;
};

const C = {
  violet: 0x7c3aed,
  purple: 0xa855f7,
  magenta: 0xe879f9,
  blue: 0x60a5fa,
  white: 0xf5f3ff,
  black: 0x000000,
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

function makeOrbitSeeds(count: number): OrbitSeed[] {
  return Array.from({ length: count }, (_, index) => ({
    angle: (index / count) * Math.PI * 2 + Math.random() * 0.35,
    radius: 1.18 + Math.random() * 1.05,
    speed: 0.28 + Math.random() * 0.55,
    size: 0.8 + Math.random() * 2.2,
    depth: Math.random(),
  }));
}

export function createBlackHole(): BlackHoleFx {
  const root = new Container();
  root.filterArea = new Rectangle(-420, -320, 840, 640);

  // Neutral annulus: distorts camera/stage pixels around the event horizon.
  const lens = new Sprite({
    texture: radialTexture(256, [
      [0, "rgba(255,255,255,0)"],
      [0.32, "rgba(255,255,255,0)"],
      [0.5, "rgba(255,255,255,0.34)"],
      [0.72, "rgba(255,255,255,0.16)"],
      [1, "rgba(255,255,255,0)"],
    ]),
    anchor: 0.5,
  });
  const lensFilter = new BackdropBlurFilter({
    strength: 8,
    quality: 2,
    kernelSize: 7,
  });
  lens.filters = [lensFilter];

  const outerGlow = new Sprite({
    texture: radialTexture(256, [
      [0, "rgba(0,0,0,0)"],
      [0.34, "rgba(0,0,0,0)"],
      [0.48, "rgba(124,58,237,0.3)"],
      [0.66, "rgba(96,165,250,0.12)"],
      [1, "rgba(0,0,0,0)"],
    ]),
    anchor: 0.5,
  });
  outerGlow.blendMode = "add";
  outerGlow.filters = [new BlurFilter({ strength: 12, quality: 2 })];

  const disk = new Container();
  const diskGlow = new Graphics();
  const diskSharp = new Graphics();
  diskGlow.blendMode = "add";
  diskSharp.blendMode = "add";
  diskGlow.filters = [new BlurFilter({ strength: 10, quality: 2 })];
  disk.addChild(diskGlow, diskSharp);

  const core = new Sprite({
    texture: radialTexture(256, [
      [0, "rgba(0,0,0,1)"],
      [0.7, "rgba(0,0,0,1)"],
      [0.88, "rgba(0,0,0,0.98)"],
      [1, "rgba(0,0,0,0)"],
    ]),
    anchor: 0.5,
  });

  // Crisp, non-rotating point-of-no-return boundary.
  const eventHorizon = new Graphics();

  const motes = new Graphics();
  motes.blendMode = "add";
  const orbitSeeds = makeOrbitSeeds(42);

  root.addChild(lens, outerGlow, disk, core, eventHorizon, motes);
  root.visible = false;

  return {
    root,
    lens,
    lensFilter,
    outerGlow,
    disk,
    diskGlow,
    diskSharp,
    core,
    eventHorizon,
    motes,
    orbitSeeds,
    ageSec: 0,
    smoothX: 0,
    smoothY: 0,
    smoothRadius: 48,
    hasPosition: false,
  };
}

export function hideBlackHole(fx: BlackHoleFx): void {
  fx.root.visible = false;
  fx.ageSec = 0;
  fx.hasPosition = false;
}

export function updateBlackHole(
  fx: BlackHoleFx,
  upperPalm: BlackHolePalm,
  lowerPalm: BlackHolePalm,
  tick: number,
  dt: number,
  screenWidth: number
): void {
  const frameDt = Math.min(dt, 2.5);
  fx.ageSec += frameDt / 60;

  const upperX = screenWidth - upperPalm.x;
  const lowerX = screenWidth - lowerPalm.x;
  const targetX = (upperX + lowerX) * 0.5;
  const targetY = (upperPalm.y + lowerPalm.y) * 0.5;
  const handGap = Math.hypot(upperX - lowerX, upperPalm.y - lowerPalm.y);
  const palmScale = (upperPalm.palmwidth + lowerPalm.palmwidth) * 0.5;
  const targetRadius = Math.min(
    125,
    Math.max(42, palmScale * 0.78, handGap * 0.18)
  );

  if (!fx.hasPosition) {
    fx.smoothX = targetX;
    fx.smoothY = targetY;
    fx.smoothRadius = targetRadius;
    fx.hasPosition = true;
  } else {
    const follow = 1 - Math.pow(0.7, frameDt);
    fx.smoothX += (targetX - fx.smoothX) * follow;
    fx.smoothY += (targetY - fx.smoothY) * follow;
    fx.smoothRadius += (targetRadius - fx.smoothRadius) * follow;
  }

  fx.root.visible = true;
  fx.root.position.set(fx.smoothX, fx.smoothY);

  const radius = fx.smoothRadius;
  const pulse = 1 + Math.sin(tick * 2.1) * 0.025;
  const lensSize = radius * 5.1 * pulse;
  fx.lens.width = lensSize;
  fx.lens.height = lensSize;
  fx.lens.alpha = 0.72;
  fx.lensFilter.strength = 7 + Math.sin(tick * 1.3) * 1.2;
  const lensPad = lensSize * 0.55;
  fx.lens.filterArea = new Rectangle(
    -lensPad,
    -lensPad,
    lensPad * 2,
    lensPad * 2
  );

  const glowSize = radius * 5.3;
  fx.outerGlow.width = glowSize;
  fx.outerGlow.height = glowSize;
  fx.outerGlow.alpha = 0.72 + Math.sin(tick * 1.7) * 0.08;

  // Flatten circular orbital paths into a tilted accretion disk.
  fx.disk.scale.set(1, 0.34);
  fx.disk.rotation = -0.16 + Math.sin(tick * 0.18) * 0.035;
  fx.diskGlow.clear();
  fx.diskSharp.clear();

  for (let band = 0; band < 7; band++) {
    const bandRadius = radius * (1.18 + band * 0.19);
    const phase = tick * (0.7 + band * 0.08) + band * 1.27;
    const span = 0.72 + (band % 3) * 0.24;
    const color =
      band % 4 === 0
        ? C.white
        : band % 3 === 0
          ? C.blue
          : band % 2 === 0
            ? C.magenta
            : C.purple;

    fx.diskGlow
      .arc(0, 0, bandRadius, phase, phase + span)
      .stroke({
        color,
        width: Math.max(4, radius * (0.12 - band * 0.008)),
        alpha: 0.3,
        cap: "round",
      });
    fx.diskSharp
      .arc(0, 0, bandRadius, phase, phase + span)
      .stroke({
        color,
        width: Math.max(1.2, radius * (0.035 - band * 0.002)),
        alpha: 0.78 - band * 0.055,
        cap: "round",
      });
  }

  const coreSize = radius * 2.16 * pulse;
  fx.core.width = coreSize;
  fx.core.height = coreSize;

  // Static event horizon. No animated bright edge: accretion light visibly
  // terminates against an opaque black boundary.
  fx.eventHorizon
    .clear()
    .circle(0, 0, radius * 0.94)
    .fill({ color: C.black, alpha: 1 })
    .circle(0, 0, radius * 0.985)
    .stroke({
      color: C.black,
      width: Math.max(4, radius * 0.11),
      alpha: 1,
    })
    .circle(0, 0, radius * 1.035)
    .stroke({
      color: C.violet,
      width: Math.max(1, radius * 0.012),
      alpha: 1,
    });

  fx.motes.clear();
  for (let i = 0; i < fx.orbitSeeds.length; i++) {
    const seed = fx.orbitSeeds[i];
    const angle = seed.angle + tick * seed.speed;
    const orbit = radius * seed.radius;
    const x = Math.cos(angle) * orbit;
    const y = Math.sin(angle) * orbit * 0.34;
    const front = (Math.sin(angle) + 1) * 0.5;
    fx.motes
      .circle(x, y, seed.size * (0.65 + front * 0.75))
      .fill({
        color: i % 5 === 0 ? C.white : i % 2 === 0 ? C.blue : C.magenta,
        alpha: 0.22 + front * 0.58 * seed.depth,
      });
  }
}

import {
  BlurFilter,
  Container,
  Graphics,
  ParticleContainer,
  Rectangle,
  Sprite,
  Texture,
} from "pixi.js";
import { BackdropBlurFilter } from "pixi-filters";
import { Emitter } from "@spd789562/particle-emitter";
import type { EmitterConfigV3 } from "@spd789562/particle-emitter";
import type { HandState } from "../handTypes.ts";

type FireballPalm = {
  x: number;
  y: number;
  palmwidth: number;
  state?: HandState;
};

type Matter = {
  phase: number;
  band: number;
  speed: number;
  size: number;
};

/** A whipping solar-flare tentacle that erupts from the surface,
 * loops/curls erratically, and recedes. Pooled + reused. */
type SolarFlare = {
  active: boolean;
  baseAngle: number;
  life: number;
  maxLife: number;
  reachFrac: number; // total length as a fraction of radius
  widthFrac: number; // base width as a fraction of radius
  whipFreq: number;
  whipPhase: number;
  curlDir: number; // 1 or -1, which way it tends to curl
  segments: number;
};

type Smoke = {
  view: Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  phase: number;
  noiseFreqA: number;
  noiseFreqB: number;
};

export type FireballFx = {
  root: Container;
  /** Soft outer ring — BackdropBlurFilter frosts camera around the orb. */
  edgeBlur: Sprite;
  edgeBlurFilter: BackdropBlurFilter;
  haze: Sprite;
  halo: Sprite;
  /** pixijs-userland particle-emitter flame (via Pixi v8 port). */
  flameParticles: ParticleContainer;
  flameEmitter: Emitter;
  shell: Sprite;
  core: Sprite;
  rim: Graphics;
  matter: Graphics;
  matterSeeds: Matter[];
  flareLayer: Graphics;
  flares: SolarFlare[];
  smokeLayer: Container;
  smokes: Smoke[];
  sparks: Graphics;
  ageSec: number;
  smoothX: number;
  smoothY: number;
  smoothRadius: number;
  hasPosition: boolean;
};

const C = {
  soot: 0x2a0600,
  blood: 0x8a1200,
  crimson: 0xe02a08,
  scarlet: 0xff4e14,
  ember: 0xff8c1a,
  amber: 0xffc14a,
  hot: 0xfff4d6,
} as const;

const GROW_DURATION_SEC = 2; // reach max size in 2 seconds
const START_PALM_FRAC = 0.5; // start diameter = half palm width
const MAX_PALM_FRAC = 2; // end diameter = 2× palm width
/** Extra lift so orb floats above palm, not glued to it. */
const PALM_GAP_FRAC = 0.2;
const MATTER_COUNT = 34;
/** Flame emitter local units; ParticleContainer scale = radius / this.
 * Higher = smaller on-screen flame relative to orb. */
const FLAME_BASE_RADIUS = 58;

/** How many flares can whip at once. Raise for a busier/angrier fireball. */
const FLARE_POOL_SIZE = 3;
/** Probability per "frame unit" (frameDt≈1 at 60fps) that an idle flare
 * slot erupts. Roughly: chance-per-second ≈ this × 60. */
const FLARE_SPAWN_CHANCE = 0.0035;

/** Cheap multi-octave pseudo-noise: sum of a few sines at different
 * frequencies/phases so motion doesn't read as a single repeating cycle. */
function noise(t: number, seed: number): number {
  return (
    Math.sin(t * 1.0 + seed) * 0.5 +
    Math.sin(t * 2.13 + seed * 1.7) * 0.3 +
    Math.sin(t * 4.7 - seed * 2.3) * 0.2
  );
}

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
  for (const [offset, color] of stops) {
    gradient.addColorStop(offset, color);
  }
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return Texture.from(canvas);
}

/**
 * Official flame config from pixijs-userland/particle-emitter examples/flame.html,
 * adapted for a handheld fireball (single shared texture for ParticleContainer).
 */
function flameEmitterConfig(texture: Texture): EmitterConfigV3 {
  return {
    lifetime: { min: 0.08, max: 0.55 },
    frequency: 0.0025,
    emitterLifetime: 0,
    maxParticles: 220,
    addAtBack: false,
    pos: { x: 0, y: 0 },
    emit: false,
    autoUpdate: false,
    behaviors: [
      {
        type: 'alpha',
        config: {
          alpha: {
            list: [
              { time: 0, value: 0.48 },
              { time: 0.45, value: 0.28 },
              { time: 1, value: 0 },
            ],
          },
        },
      },
      {
        type: 'moveSpeedStatic',
        config: { min: 140, max: 220 },
      },
      {
        type: 'scale',
        config: {
          scale: {
            list: [
              { time: 0, value: 0.12 },
              { time: 1, value: 0.32 },
            ],
          },
          minMult: 1,
        },
      },
      {
        type: 'color',
        config: {
          color: {
            list: [
              { time: 0, value: 'ffd078' },
              { time: 1, value: 'e84818' },
            ],
          },
        },
      },
      {
        type: 'rotation',
        config: {
          accel: 0,
          minSpeed: 40,
          maxSpeed: 40,
          // Mostly upward lick, slight spread — classic torch flame from the repo.
          minStart: 250,
          maxStart: 290,
        },
      },
      {
        type: 'textureSingle',
        config: { texture },
      },
      {
        type: 'spawnShape',
        config: {
          type: 'torus',
          data: {
            x: 0,
            y: 0,
            radius: 7,
            innerRadius: 0,
            affectRotation: false,
          },
        },
      },
    ],
  };
}

function createFlameLayer(texture: Texture): {
  flameParticles: ParticleContainer;
  flameEmitter: Emitter;
} {
  const flameParticles = new ParticleContainer({
    texture,
    dynamicProperties: {
      position: true,
      rotation: true,
      scale: true,
      color: true,
      uvs: false,
      vertex: false,
    },
    boundsArea: new Rectangle(-220, -320, 440, 420),
  });
  flameParticles.blendMode = 'add';

  const flameEmitter = new Emitter(flameParticles, flameEmitterConfig(texture));
  flameEmitter.emit = false;

  return { flameParticles, flameEmitter };
}

function makeFlarePool(count: number): SolarFlare[] {
  const flares: SolarFlare[] = [];
  for (let i = 0; i < count; i++) {
    flares.push({
      active: false,
      baseAngle: 0,
      life: 0,
      maxLife: 1,
      reachFrac: 1,
      widthFrac: 0.08,
      whipFreq: 1,
      whipPhase: Math.random() * Math.PI * 2,
      curlDir: 1,
      segments: 9,
    });
  }
  return flares;
}

function spawnFlare(flare: SolarFlare): void {
  flare.active = true;
  flare.life = 0;
  flare.baseAngle = Math.random() * Math.PI * 2;
  flare.maxLife = 55 + Math.random() * 70; // ~0.9–2.1s at 60fps
  flare.reachFrac = 1.3 + Math.random() * 1.1; // whips well past the corona
  flare.widthFrac = 0.05 + Math.random() * 0.045;
  flare.whipFreq = 0.8 + Math.random() * 1.4;
  flare.whipPhase = Math.random() * Math.PI * 2;
  flare.curlDir = Math.random() < 0.5 ? -1 : 1;
  flare.segments = 8 + Math.floor(Math.random() * 5);
}

/** Fast eruption, brief hold at full extension, slower curl-back fade —
 * mimics how a real prominence snaps out and settles. */
function flareEnvelope(progress: number): number {
  if (progress < 0.18) return progress / 0.18;
  if (progress < 0.5) return 1;
  return Math.max(0, 1 - (progress - 0.5) / 0.5);
}

function drawSolarFlares(
  graphics: Graphics,
  flares: SolarFlare[],
  radius: number,
  tick: number
): void {
  graphics.clear();

  for (const flare of flares) {
    if (!flare.active) continue;
    const progress = flare.life / flare.maxLife;
    const envelope = flareEnvelope(progress);
    if (envelope <= 0.01) continue;

    const points: { x: number; y: number }[] = [];
    let dir = flare.baseAngle;
    let x = Math.cos(flare.baseAngle) * radius * 0.95;
    let y = Math.sin(flare.baseAngle) * radius * 0.95;
    points.push({ x, y });

    const totalReach = radius * flare.reachFrac * envelope;
    const stepLen = totalReach / flare.segments;

    // Chain: bend compounds outward and lags in time per segment, so the
    // tip visibly trails and snaps rather than rotating rigidly.
    for (let i = 1; i <= flare.segments; i++) {
      const segT = i / flare.segments;
      const t = tick * flare.whipFreq - i * 0.4 + flare.whipPhase;
      const bend = noise(t, flare.whipPhase + i) * 0.55 * segT;
      dir += bend * flare.curlDir * 0.16;
      x += Math.cos(dir) * stepLen;
      y += Math.sin(dir) * stepLen;
      points.push({ x, y });
    }

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const segT0 = i / flare.segments;
      const segT1 = (i + 1) / flare.segments;

      const w0 = radius * flare.widthFrac * (1 - segT0 * 0.85) * envelope;
      const w1 = radius * flare.widthFrac * (1 - segT1 * 0.85) * envelope;

      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;

      const heat = 1 - segT0; // hottest near the base, cooling toward the tip
      const color = heat > 0.66 ? C.hot : heat > 0.33 ? C.amber : C.scarlet;
      const alpha = envelope * (0.3 + heat * 0.55) * (1 - segT1 * 0.3);

      graphics
        .moveTo(p0.x + nx * w0 * 0.5, p0.y + ny * w0 * 0.5)
        .lineTo(p1.x + nx * w1 * 0.5, p1.y + ny * w1 * 0.5)
        .lineTo(p1.x - nx * w1 * 0.5, p1.y - ny * w1 * 0.5)
        .lineTo(p0.x - nx * w0 * 0.5, p0.y - ny * w0 * 0.5)
        .closePath()
        .fill({ color, alpha });
    }

    const tip = points[points.length - 1];
    graphics
      .circle(tip.x, tip.y, radius * flare.widthFrac * 0.35 * envelope)
      .fill({ color: C.hot, alpha: envelope * 0.5 });
  }
}

function resetSmoke(smoke: Smoke, radius: number, stagger = false): void {
  const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
  smoke.x = Math.cos(a) * radius * (0.3 + Math.random() * 0.5);
  smoke.y = -radius * (0.7 + Math.random() * 0.4);
  smoke.vx = (Math.random() - 0.5) * 0.8;
  smoke.vy = -(0.6 + Math.random() * 1.4);
  smoke.maxLife = 35 + Math.random() * 40;
  smoke.life = stagger ? Math.random() * smoke.maxLife : 0;
  smoke.size = 0.7 + Math.random() * 1.1;
  smoke.phase = Math.random() * Math.PI * 2;
  smoke.noiseFreqA = 0.6 + Math.random() * 0.8;
  smoke.noiseFreqB = 1.4 + Math.random() * 1.6;
}

export function createFireball(flameTexture: Texture): FireballFx {
  const root = new Container();
  // Pad wide enough for BackdropBlur sampling around the outer ring.
  root.filterArea = new Rectangle(-480, -520, 960, 1040);

  // Annular mask: hollow core, soft neutral alpha on the rim so
  // BackdropBlur frosts surroundings without warm tint.
  const edgeBlur = new Sprite({
    texture: radialTexture(256, [
      [0, "rgba(255,255,255,0)"],
      [0.5, "rgba(255,255,255,0)"],
      [0.66, "rgba(255,255,255,0.08)"],
      [0.78, "rgba(255,255,255,0.2)"],
      [0.9, "rgba(255,255,255,0.1)"],
      [1, "rgba(255,255,255,0)"],
    ]),
    anchor: 0.5,
  });
  const edgeBlurFilter = new BackdropBlurFilter({
    strength: 7,
    quality: 2,
    kernelSize: 7,
  });
  edgeBlur.filters = [edgeBlurFilter];
  edgeBlur.filterArea = new Rectangle(-200, -200, 400, 400);

  const haze = new Sprite({
    texture: radialTexture(256, [
      [0, "rgba(255,200,120,0.10)"],
      [0.3, "rgba(255,140,60,0.08)"],
      [0.6, "rgba(200,60,20,0.04)"],
      [1, "rgba(80,20,0,0)"],
    ]),
    anchor: 0.5,
  });
  haze.blendMode = "add";
  haze.filters = [new BlurFilter({ strength: 24, quality: 2 })];

  const halo = new Sprite({
    texture: radialTexture(256, [
      [0, "rgba(255,244,214,0.08)"],
      [0.2, "rgba(255,193,74,0.46)"],
      [0.4, "rgba(255,78,20,0.52)"],
      [0.62, "rgba(224,42,8,0.2)"],
      [1, "rgba(80,8,0,0)"],
    ]),
    anchor: 0.5,
  });
  halo.blendMode = "add";
  halo.filters = [new BlurFilter({ strength: 10, quality: 2 })];

  const { flameParticles, flameEmitter } = createFlameLayer(flameTexture);

  const rim = new Graphics();
  const matter = new Graphics();
  for (const layer of [rim, matter]) {
    layer.blendMode = "add";
  }

  const flareLayer = new Graphics();
  flareLayer.blendMode = "add";
  flareLayer.filters = [new BlurFilter({ strength: 1.8, quality: 2 })];

  const shell = new Sprite({
    texture: radialTexture(256, [
      [0, "rgba(255,246,224,1)"],
      [0.16, "rgba(255,213,105,1)"],
      [0.42, "rgba(255,140,26,0.98)"],
      [0.72, "rgba(224,42,8,0.9)"],
      [0.92, "rgba(92,10,0,0.68)"],
      [1, "rgba(42,6,0,0)"],
    ]),
    anchor: 0.5,
  });
  shell.blendMode = "add";

  const core = new Sprite({
    texture: radialTexture(128, [
      [0, "rgba(255,255,245,1)"],
      [0.28, "rgba(255,244,190,0.95)"],
      [0.62, "rgba(255,170,48,0.45)"],
      [1, "rgba(255,90,10,0)"],
    ]),
    anchor: 0.5,
  });
  core.blendMode = "add";

  const smokeLayer = new Container();
  smokeLayer.filters = [new BlurFilter({ strength: 20, quality: 1 })];
  const smokes: Smoke[] = [];
  for (let i = 0; i < 14; i++) {
    const view = new Graphics()
      .circle(0, 0, 18)
      .fill({ color: i % 2 === 0 ? C.soot : C.blood, alpha: 0.22 });
    const smoke: Smoke = {
      view,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 1,
      size: 1,
      phase: 0,
      noiseFreqA: 1,
      noiseFreqB: 1,
    };
    resetSmoke(smoke, 40, true);
    smokes.push(smoke);
    smokeLayer.addChild(view);
  }

  const sparks = new Graphics();
  sparks.blendMode = "add";

  const matterSeeds: Matter[] = [];
  for (let i = 0; i < MATTER_COUNT; i++) {
    matterSeeds.push({
      phase: i * 2.39996,
      band: (i % 7) / 7,
      speed: 0.18 + (i % 6) * 0.035,
      size: 1.1 + (i % 4) * 0.7,
    });
  }

  const flares = makeFlarePool(FLARE_POOL_SIZE);

  root.addChild(
    edgeBlur,
    haze,
    halo,
    flameParticles,
    shell,
    core,
    rim,
    matter,
    flareLayer,
    smokeLayer,
    sparks
  );
  root.visible = false;

  return {
    root,
    edgeBlur,
    edgeBlurFilter,
    haze,
    halo,
    flameParticles,
    flameEmitter,
    shell,
    core,
    rim,
    matter,
    matterSeeds,
    flareLayer,
    flares,
    smokeLayer,
    smokes,
    sparks,
    ageSec: 0,
    smoothX: 0,
    smoothY: 0,
    smoothRadius: 10,
    hasPosition: false,
  };
}

export function hideFireball(fx: FireballFx): void {
  fx.root.visible = false;
  fx.ageSec = 0;
  fx.hasPosition = false;
  fx.flameEmitter.emit = false;
  fx.flameEmitter.cleanup();
  for (const flare of fx.flares) flare.active = false;
}

export function updateFireball(
  fx: FireballFx,
  palm: FireballPalm,
  tick: number,
  dt: number,
  handindex: number,
  screenWidth: number
): void {
  const frameDt = Math.min(dt, 2.5);
  const seconds = frameDt / 60;
  fx.ageSec += seconds;

  const startDiameter = Math.max(20, palm.palmwidth * START_PALM_FRAC);
  const maxDiameter = Math.max(startDiameter, palm.palmwidth * MAX_PALM_FRAC);
  const t = Math.min(1, fx.ageSec / GROW_DURATION_SEC);
  const diameter = startDiameter + (maxDiameter - startDiameter) * t;
  const targetRadius = diameter / 2;
  const gap = palm.palmwidth * PALM_GAP_FRAC;
  const targetX = screenWidth - palm.x;
  const targetY = palm.y - targetRadius - gap;

  if (!fx.hasPosition) {
    fx.smoothX = targetX;
    fx.smoothY = targetY;
    fx.smoothRadius = targetRadius;
    fx.hasPosition = true;
  } else {
    const follow = 1 - Math.pow(0.72, frameDt);
    fx.smoothX += (targetX - fx.smoothX) * follow;
    fx.smoothY += (targetY - fx.smoothY) * follow;
    fx.smoothRadius += (targetRadius - fx.smoothRadius) * follow;
  }

  fx.root.visible = true;
  fx.root.position.set(fx.smoothX, fx.smoothY);

  const radius = fx.smoothRadius;
  const breathe = 1 + Math.sin(tick * 3.1 + handindex) * 0.045;
  const shellSize = radius * 2.35 * breathe;
  fx.shell.width = shellSize;
  fx.shell.height = shellSize;
  fx.core.width = radius * 1.35;
  fx.core.height = radius * 1.35;
  fx.core.rotation += 0.018 * frameDt;
  fx.core.alpha = 0.86 + Math.sin(tick * 8 + handindex) * 0.12;
  fx.halo.width = radius * 4.2;
  fx.halo.height = radius * 4.2;
  fx.halo.alpha = 0.76 + Math.sin(tick * 2.2 + handindex) * 0.12;

  // Outer frost ring: tighter, colorless, soft — blur only near the rim.
  const edgePulse = 0.96 + noise(tick * 1.1, handindex) * 0.04;
  const edgeSize = radius * 3.6 * edgePulse;
  fx.edgeBlur.width = edgeSize;
  fx.edgeBlur.height = edgeSize;
  fx.edgeBlur.alpha = 0.5 + Math.sin(tick * 1.6 + handindex) * 0.06;
  fx.edgeBlurFilter.strength = 6 + noise(tick * 0.7, handindex * 2) * 1.5;
  const pad = edgeSize * 0.55;
  fx.edgeBlur.filterArea = new Rectangle(-pad, -pad, pad * 2, pad * 2);

  const hazeDrift = noise(tick * 0.4, handindex * 3.1);
  const hazeScale = radius * (6.5 + hazeDrift * 0.8);
  fx.haze.width = hazeScale;
  fx.haze.height = hazeScale * (1 + hazeDrift * 0.08);
  fx.haze.alpha = 0.5 + noise(tick * 0.3 + 10, handindex) * 0.2;
  fx.haze.rotation += 0.0015 * frameDt;

  // Scale particle-emitter flame with the orb (repo flame config in local units).
  const flameScale = radius / FLAME_BASE_RADIUS;
  fx.flameParticles.scale.set(flameScale);
  fx.flameParticles.alpha = 0.9;
  fx.flameEmitter.emit = true;
  fx.flameEmitter.update(seconds);

  // Solar flare eruptions: age active ones, occasionally spawn new ones
  // into any idle pool slot (this naturally caps concurrency at pool size).
  for (const flare of fx.flares) {
    if (!flare.active) continue;
    flare.life += frameDt;
    if (flare.life >= flare.maxLife) flare.active = false;
  }
  if (Math.random() < FLARE_SPAWN_CHANCE * frameDt) {
    const idle = fx.flares.find((f) => !f.active);
    if (idle) spawnFlare(idle);
  }
  drawSolarFlares(fx.flareLayer, fx.flares, radius, tick + handindex * 0.6);

  fx.rim
    .clear()
    .circle(0, 0, radius * 0.92)
    .stroke({ color: C.hot, width: Math.max(1, radius * 0.035), alpha: 0.42 })
    .arc(
      0,
      0,
      radius * 1.06,
      -0.82 + tick * 0.22,
      0.82 + tick * 0.22
    )
    .stroke({ color: C.amber, width: Math.max(1.5, radius * 0.055), alpha: 0.75 })
    .arc(
      0,
      0,
      radius * 1.13,
      Math.PI - 0.55 - tick * 0.16,
      Math.PI + 0.55 - tick * 0.16
    )
    .stroke({ color: C.crimson, width: Math.max(1, radius * 0.04), alpha: 0.62 });

  fx.matter.clear();
  for (let i = 0; i < fx.matterSeeds.length; i++) {
    const seed = fx.matterSeeds[i];
    const angle = seed.phase + tick * seed.speed;
    const orbit = radius * (1.05 + seed.band * 0.48);
    const x = Math.cos(angle) * orbit;
    const y = Math.sin(angle) * orbit * 0.5;
    const depth = (Math.sin(angle) + 1) / 2;
    fx.matter
      .circle(x, y, seed.size * (0.65 + depth * 0.8))
      .fill({
        color: i % 5 === 0 ? C.hot : i % 2 === 0 ? C.amber : C.scarlet,
        alpha: 0.28 + depth * 0.65,
      });
  }

  for (const smoke of fx.smokes) {
    smoke.life += frameDt;
    if (smoke.life >= smoke.maxLife) resetSmoke(smoke, radius);

    const turbulence =
      noise(tick * smoke.noiseFreqA + smoke.phase, smoke.phase) * 0.5 +
      noise(tick * smoke.noiseFreqB + smoke.phase * 1.6, smoke.phase * 2) * 0.3;

    smoke.x += (smoke.vx + turbulence * 0.6) * frameDt;
    smoke.y += smoke.vy * frameDt;

    const progress = smoke.life / smoke.maxLife;
    const heat = Math.sin(progress * Math.PI);
    smoke.view.x = smoke.x;
    smoke.view.y = smoke.y;
    smoke.view.alpha = heat * 0.3;
    smoke.view.scale.set(
      smoke.size * (0.8 + progress * 1.5) * (radius / 40)
    );
  }

  fx.sparks.clear();
  const sparkCount = 2 + Math.floor(Math.random() * 4);
  for (let i = 0; i < sparkCount; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.0;
    const start = radius * (0.85 + Math.random() * 0.15);
    const len = 8 + Math.random() * 20;
    fx.sparks
      .moveTo(Math.cos(a) * start, Math.sin(a) * start)
      .lineTo(
        Math.cos(a) * (start + len),
        Math.sin(a) * (start + len) - Math.random() * 6
      )
      .stroke({
        color: Math.random() > 0.6 ? C.amber : C.hot,
        width: 0.8 + Math.random() * 1.4,
        alpha: 0.55 + Math.random() * 0.4,
      });
  }
}
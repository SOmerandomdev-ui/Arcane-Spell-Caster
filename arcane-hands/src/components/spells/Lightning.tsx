import { BlurFilter, Container, Graphics } from "pixi.js";
import type { HandState } from "../handTypes";

export type LightningFx = {
  root: Container;
  mist: Graphics;
  glow: Graphics;
  mid: Graphics;
  core: Graphics;
  sparks: Graphics;
  frame: number;
  holdFrames: number;
};

type PalmLike = { x: number; y: number; palmwidth: number; state: HandState };

const COL = {
  void: 0x21002f,
  deep: 0x56008f,
  purple: 0x8b00ff,
  bright: 0xb388ff,
  core: 0xeadcff,
  white: 0xffffff,
  burn: 0xcaff45,
} as const;

const FINGER_NAMES = ["thumb", "index", "middle", "ring", "pink"] as const;
type BoltPoint = { x: number; y: number; sharp?: boolean };

export function createLightning(): LightningFx {
  const root = new Container();
  const mist = new Graphics();
  const glow = new Graphics();
  const mid = new Graphics();
  const core = new Graphics();
  const sparks = new Graphics();

  mist.filters = [new BlurFilter({ strength: 28, quality: 1 })];
  root.addChild(mist, glow, mid, core, sparks);
  root.visible = false;

  return { root, mist, glow, mid, core, sparks, frame: 0, holdFrames: 0 };
}

function boltPath(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  segments: number,
  tick: number,
  chaos: number,
  seed: number
) {
  const pts: BoltPoint[] = [{ x: x0, y: y0 }];
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;

  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const falloff = Math.sin(t * Math.PI);
    const wave = Math.sin(tick * 32 + i * 3.8 + seed) * chaos * 0.22;
    const noise = (Math.random() - 0.5) * chaos * 1.05;
    const sharp = Math.random() > 0.76;
    const jagged = sharp ? (Math.random() - 0.5) * chaos * 1.65 : 0;
    const offset = (wave + noise + jagged) * falloff;

    pts.push({
      x: x0 + dx * t + px * offset,
      y: y0 + dy * t + py * offset,
      sharp,
    });
  }

  pts.push({ x: x1, y: y1 });
  return pts;
}

function strokePath(
  g: Graphics,
  pts: BoltPoint[],
  color: number,
  width: number,
  alpha: number
) {
  if (pts.length < 2) return;
  g.moveTo(pts[0].x, pts[0].y);

  // Mostly smooth curves, interrupted by occasional hard electrical kinks.
  for (let i = 1; i < pts.length - 1; i++) {
    const control = pts[i];
    const next = pts[i + 1];
    const midpointX = (control.x + next.x) / 2;
    const midpointY = (control.y + next.y) / 2;
    if (control.sharp) {
      g.lineTo(control.x, control.y);
      g.lineTo(midpointX, midpointY);
    } else {
      g.quadraticCurveTo(control.x, control.y, midpointX, midpointY);
    }
  }

  const last = pts[pts.length - 1];
  g.lineTo(last.x, last.y);
  g.stroke({ color, width, alpha });
}

export function hideLightning(fx: LightningFx) {
  fx.root.visible = false;
}

export function updateLightning(
  fx: LightningFx,
  left: PalmLike,
  right: PalmLike,
  tick: number,
  screenWidth: number,
  screenHeight: number
): void {
  if (!left?.state?.tip || !right?.state?.tip) {
    fx.root.visible = false;
    return;
  }

  // Build separate pools so a bolt can connect different fingers.
  const leftActive = FINGER_NAMES.filter(
    (finger) => left.state.extendedFingers[finger]
  );
  const rightActive = FINGER_NAMES.filter(
    (finger) => right.state.extendedFingers[finger]
  );

  if (leftActive.length === 0 || rightActive.length === 0) {
    fx.root.visible = false;
    return;
  }

  fx.root.visible = true;
  fx.frame++;

  // Hold old geometry for 1–3 frames. Electricity snaps, then briefly freezes.
  if (fx.holdFrames > 0) {
    fx.holdFrames--;
    fx.root.alpha = Math.random() > 0.12 ? 0.82 + Math.random() * 0.18 : 0.25;
    return;
  }
  fx.holdFrames = Math.random() > 0.72 ? 1 + Math.floor(Math.random() * 3) : 0;
  fx.root.alpha = 1;

  const leftTips = left.state.tip;
  const rightTips = right.state.tip;

  fx.mist.clear();
  fx.glow.clear();
  fx.mid.clear();
  fx.core.clear();
  fx.sparks.clear();

  const burst = Math.random() > 0.84;
  const stormAlpha = burst ? 1 : 0.58 + Math.random() * 0.42;

  // Shuffle each hand independently: index can connect to pinky, etc.
  const leftOrder = [...leftActive].sort(() => Math.random() - 0.5);
  const rightOrder = [...rightActive].sort(() => Math.random() - 0.5);

  // One, two, or three bolts based on available extended fingers.
  const activeBolts = Math.min(5, leftOrder.length, rightOrder.length);

  for (let j = 0; j < activeBolts; j++) {
    const leftFinger = leftOrder[j];
    const rightFinger = rightOrder[j];
    const x0 = screenWidth - leftTips[leftFinger].x * screenWidth;
    const y0 = leftTips[leftFinger].y * screenHeight;
    const x1 = screenWidth - rightTips[rightFinger].x * screenWidth;
    const y1 = rightTips[rightFinger].y * screenHeight;

    const dist = Math.hypot(x1 - x0, y1 - y0);
    const segments = Math.max(12, Math.min(30, Math.floor(dist / 18)));
    const chaos = Math.min(78, 25 + dist * 0.055) * (burst ? 1.25 : 1);
    const pairSeed =
      FINGER_NAMES.indexOf(leftFinger) * 13 +
      FINGER_NAMES.indexOf(rightFinger) * 7;
    const main = boltPath(x0, y0, x1, y1, segments, tick, chaos, pairSeed);

    const a = stormAlpha;

    // Purple vapor sits beside the bolt, offset perpendicular to its path.
    for (let m = 1; m < main.length - 1; m += 2) {
      if (Math.random() > 0.68 && !burst) continue;
      const point = main[m];
      const previous = main[m - 1];
      const next = main[m + 1];
      const tangentX = next.x - previous.x;
      const tangentY = next.y - previous.y;
      const tangentLength = Math.hypot(tangentX, tangentY) || 1;
      const normalX = -tangentY / tangentLength;
      const normalY = tangentX / tangentLength;
      const drift = tick * 2.1 + m * 1.9 + pairSeed;
      const side = Math.sin(drift) >= 0 ? 1 : -1;
      const sideDistance = 24 + Math.random() * 34;
      const radius = 30 + Math.random() * (burst ? 45 : 32);
      fx.mist
        .circle(
          point.x + normalX * sideDistance * side,
          point.y + normalY * sideDistance * side,
          radius
        )
        .fill({
          color: Math.random() > 0.7 ? COL.bright : COL.deep,
          alpha: (0.11 + Math.random() * 0.11) * a,
        });

      // Occasional smaller wisp on opposite side.
      if (burst || Math.random() > 0.65) {
        fx.mist
          .circle(
            point.x - normalX * sideDistance * 0.7 * side,
            point.y - normalY * sideDistance * 0.7 * side,
            radius * 0.65
          )
          .fill({
            color: COL.purple,
            alpha: (0.06 + Math.random() * 0.07) * a,
          });
      }
    }

    strokePath(fx.glow, main, COL.void, burst ? 30 : 24, 0.3 * a);
    strokePath(fx.glow, main, COL.deep, burst ? 20 : 15, 0.42 * a);
    strokePath(fx.mid, main, COL.purple, burst ? 9 : 6.5, 0.92 * a);
    strokePath(fx.core, main, COL.bright, burst ? 3.8 : 2.6, a);
    strokePath(fx.core, main, COL.white, burst ? 1.8 : 0.9, 0.9 * a);

    // Short-lived side forks. They leave the main bolt instead of duplicating it.
    const forkCount = burst ? 8 : 2 + Math.floor(Math.random() * 5);
    for (let f = 0; f < forkCount; f++) {
      const startIndex = 1 + Math.floor(Math.random() * (main.length - 2));
      const start = main[startIndex];
      const previous = main[startIndex - 1];
      const vx = start.x - previous.x;
      const vy = start.y - previous.y;
      const vLen = Math.hypot(vx, vy) || 1;
      const side = Math.random() > 0.5 ? 1 : -1;
      const forkLength = 18 + Math.random() * (burst ? 70 : 45);
      const endX = start.x + (-vy / vLen) * forkLength * side + vx * 0.25;
      const endY = start.y + (vx / vLen) * forkLength * side + vy * 0.25;
      const fork = boltPath(
        start.x,
        start.y,
        endX,
        endY,
        3 + Math.floor(Math.random() * 4),
        tick + f,
        chaos * 0.45,
        f * 19 + pairSeed
      );

      strokePath(fx.glow, fork, COL.deep, 8, 0.25 * a);
      strokePath(fx.mid, fork, COL.purple, 3, 0.7 * a);
      strokePath(fx.core, fork, Math.random() > 0.88 ? COL.burn : COL.core, 1, 0.9 * a);
    }

    // Endpoint arcs
    const flash = burst ? 1.4 : 0.45 + Math.random() * 0.75;
    for (const [x, y] of [
      [x0, y0],
      [x1, y1],
    ] as const) {
      fx.sparks
        .circle(x, y, 16 + Math.random() * 24)
        .fill({ color: COL.deep, alpha: 0.28 * flash * a });
      fx.sparks
        .circle(x, y, 7 + Math.random() * 11)
        .fill({ color: COL.purple, alpha: 0.5 * flash * a });
      fx.sparks
        .circle(x, y, 2 + Math.random() * 5)
        .fill({ color: Math.random() > 0.9 ? COL.burn : COL.white, alpha: 0.95 * a });

      // Violent radial endpoint spit.
      for (let k = 0; k < (burst ? 8 : 3); k++) {
        const angle = Math.random() * Math.PI * 2;
        const length = 7 + Math.random() * 25;
        fx.sparks
          .moveTo(x, y)
          .lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length)
          .stroke({
            color: Math.random() > 0.82 ? COL.burn : COL.bright,
            width: 0.8 + Math.random() * 1.5,
            alpha: 0.75 * a,
          });
      }
    }

    // Sporadic crackles branching off
    const crackleChance = burst ? 0.95 : 0.5;
    for (let i = 2; i < main.length - 2; i += 2) {
      if (Math.random() > crackleChance) continue;
      const p = main[i];
      const ang = tick * 13 + i * 2.2 + Math.random() * 6;
      const len = 14 + Math.random() * 34;
      fx.sparks
        .moveTo(p.x, p.y)
        .lineTo(p.x + Math.cos(ang) * len, p.y + Math.sin(ang) * len)
        .stroke({
          color: Math.random() > 0.88 ? COL.burn : COL.bright,
          width: 1.2 + Math.random(),
          alpha: 0.55 * a,
        });
    }
  }
}
import { BlurFilter, Container, Graphics } from "pixi.js";

type ShieldPalm = {
  x: number;
  y: number;
  palmwidth: number;
};

export type ShieldFx = {
  root: Container;
  mist: Container;
  glow: Graphics;
  ringOuter: Graphics;
  ringInner: Graphics;
  hexOuter: Graphics;
  hexMid: Graphics;
  hexInner: Graphics;
  blades: Container;
  orbit: Container;
  arcs: Container;
  core: Graphics;
  coreSpike: Graphics;
};

const C = {
  ice: 0x7af6ff,
  neon: 0x00f0ff,
  electric: 0x00b7ff,
  hot: 0xffffff,
  violet: 0xb388ff,
} as const;

export function createShield(): ShieldFx {
  const root = new Container();

  // Soft drifting energy vapor behind shield.
  const mist = new Container();
  mist.filters = [new BlurFilter({ strength: 18, quality: 1 })];
  for (let i = 0; i < 12; i++) {
    const puff = new Graphics()
      .circle(0, 0, 26 + (i % 4) * 6)
      .fill({
        color: i % 3 === 0 ? C.violet : C.neon,
        alpha: 0.16,
      });
    mist.addChild(puff);
  }

  const glow = new Graphics()
    .circle(0, 0, 140)
    .fill({ color: C.neon, alpha: 0.12 });

  const ringOuter = new Graphics()
    .circle(0, 0, 108)
    .stroke({ color: C.ice, width: 2, alpha: 0.95 });

  const ringInner = new Graphics()
    .circle(0, 0, 78)
    .stroke({ color: C.electric, width: 1.5, alpha: 0.85 });

  const hexOuter = new Graphics()
    .regularPoly(0, 0, 96, 6)
    .fill({ color: C.electric, alpha: 0.1 })
    .stroke({ color: C.neon, width: 3.5, alpha: 1 });

  const hexMid = new Graphics()
    .regularPoly(0, 0, 68, 6)
    .fill({ color: C.violet, alpha: 0.08 })
    .stroke({ color: C.ice, width: 2.5, alpha: 0.95 });

  const hexInner = new Graphics()
    .regularPoly(0, 0, 42, 6)
    .fill({ color: C.neon, alpha: 0.14 })
    .stroke({ color: C.hot, width: 2, alpha: 0.9 });

  const blades = new Container();
  for (let i = 0; i < 6; i++) {
    const blade = new Graphics()
      .moveTo(0, -12)
      .lineTo(8, -58)
      .lineTo(0, -72)
      .lineTo(-8, -58)
      .closePath()
      .fill({ color: C.ice, alpha: 0.55 })
      .stroke({ color: C.hot, width: 1, alpha: 0.9 });
    blade.rotation = (i / 6) * Math.PI * 2;
    blades.addChild(blade);
  }

  const orbit = new Container();
  for (let i = 0; i < 12; i++) {
    const big = i % 3 === 0;
    const pip = new Graphics()
      .circle(0, 0, big ? 5 : 2.5)
      .fill({ color: big ? C.hot : C.ice, alpha: 1 })
      .stroke({ color: C.neon, width: 1, alpha: 0.9 });
    const angle = (i / 12) * Math.PI * 2;
    const radius = big ? 88 : 82;
    pip.x = Math.cos(angle) * radius;
    pip.y = Math.sin(angle) * radius;
    orbit.addChild(pip);
  }

  const arcs = new Container();
  arcs.addChild(
    new Graphics()
      .arc(0, 0, 118, -0.55, 0.55)
      .stroke({ color: C.hot, width: 3, alpha: 1 }),
    new Graphics()
      .arc(0, 0, 118, Math.PI - 0.55, Math.PI + 0.55)
      .stroke({ color: C.neon, width: 3, alpha: 1 }),
    new Graphics()
      .arc(0, 0, 126, 1.1, 2.0)
      .stroke({ color: C.violet, width: 2, alpha: 0.85 }),
    new Graphics()
      .arc(0, 0, 126, 1.1 + Math.PI, 2.0 + Math.PI)
      .stroke({ color: C.electric, width: 2, alpha: 0.85 })
  );

  const core = new Graphics()
    .circle(0, 0, 14)
    .fill({ color: C.hot, alpha: 0.95 })
    .stroke({ color: C.neon, width: 3, alpha: 1 });

  const coreSpike = new Graphics()
    .regularPoly(0, 0, 22, 4)
    .stroke({ color: C.ice, width: 1.5, alpha: 0.9 });

  root.addChild(
    mist,
    glow,
    ringOuter,
    ringInner,
    hexOuter,
    hexMid,
    hexInner,
    blades,
    orbit,
    arcs,
    coreSpike,
    core
  );

  return {
    root,
    mist,
    glow,
    ringOuter,
    ringInner,
    hexOuter,
    hexMid,
    hexInner,
    blades,
    orbit,
    arcs,
    core,
    coreSpike,
  };
}

export function updateShield(
  shield: ShieldFx,
  palm: ShieldPalm,
  tick: number,
  dt: number,
  handindex: number,
  screenwidth: number
): void {
  const sizeFromPalm = Math.max(0.5, Math.min(2.4, palm.palmwidth / 105));
  shield.root.visible = true;
  shield.root.x = screenwidth - palm.x;
  shield.root.y = palm.y;
  const pulse = 1 + Math.sin(tick * 1.6 + handindex) * 0.1;
  const surge = 1 + Math.sin(tick * 4 + handindex * 1.7) * 0.05;
  shield.root.scale.set(sizeFromPalm * pulse * surge);

  shield.hexOuter.rotation += 0.03 * dt;
  shield.hexMid.rotation -= 0.05 * dt;
  shield.hexInner.rotation += 0.07 * dt;
  shield.blades.rotation -= 0.012 * dt;
  shield.orbit.rotation += 0.015 * dt;
  shield.arcs.rotation -= 0.08 * dt;
  shield.ringOuter.rotation += 0.01 * dt;
  shield.ringInner.rotation -= 0.018 * dt;
  shield.coreSpike.rotation += 0.12 * dt;

  shield.mist.rotation -= 0.004 * dt;
  shield.mist.children.forEach((puff, index) => {
    const phase = tick * 0.55 + index * 1.71 + handindex;
    const radius = 132 + Math.sin(phase * 0.8) * 24;
    const angle =
      (index / shield.mist.children.length) * Math.PI * 2 + phase * 0.12;
    puff.x = Math.cos(angle) * radius;
    puff.y = Math.sin(angle) * radius + Math.sin(phase) * 12;
    puff.alpha = 0.14 + (Math.sin(phase * 1.4) + 1) * 0.07;
    puff.scale.set(0.8 + (Math.sin(phase * 0.9) + 1) * 0.22);
  });

  shield.glow.alpha = 0.1 + Math.sin(tick * 2.2 + handindex) * 0.05;
  shield.core.alpha = 0.75 + Math.sin(tick * 5 + handindex) * 0.25;
  shield.core.scale.set(0.9 + Math.sin(tick * 3 + handindex) * 0.25);
  shield.blades.alpha = 0.7 + Math.sin(tick * 2.8 + handindex) * 0.3;
}

import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import "./shield.css";
import { Application, Container, Graphics } from "pixi.js";
import type { HandState, NestedHandState } from "../handTypes.ts";

type PalmPoint = { x: number; y: number; palmwidth: number; state: NestedHandState; };

type CanvasProps = {
  palmRef: RefObject<PalmPoint[]>;
};

type ShieldFx = {
  root: Container;
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

function createShield(): ShieldFx {
  const root = new Container();

  const glow = new Graphics()
    .circle(0, 0, 140)
    .fill({ color: C.neon, alpha: 0.12 });

  const ringOuter = new Graphics()
    .circle(0, 0, 108)
    .stroke({ color: C.ice, width: 2, alpha: 0.95 });

  const ringInner = new Graphics()
    .circle(0, 0, 78)
    .stroke({ color: C.electric, width: 1.5, alpha: 0.85 });

  // Crisp hex stack
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

  // Sharp radial blades where it iterates and makes 6 ice spikes 
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

  // Bright orbit gems
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

  // Tight neon arcs
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

export function Canvas({ palmRef }: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let app: Application | null = null;
    let isMounted = true;

    async function setup() {
      const container = containerRef.current;
      if (!container) return;

      const newApp = new Application();
      await newApp.init({
        resizeTo: container,
        backgroundAlpha: 0,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      });

      if (!isMounted) {
        newApp.destroy(true, { children: true });
        return;
      }

      app = newApp;
      container.appendChild(app.canvas);

      const shields = [createShield(), createShield()];
      for (const s of shields) {
        s.root.visible = false;
        app.stage.addChild(s.root);
      }

      let tick = 0;

      app.ticker.add((ticker) => {
        const palms = palmRef.current ?? [];
        tick += ticker.deltaTime * 0.09;
        const dt = ticker.deltaTime;

        for (let i = 0; i < shields.length; i++) {
          const p = palms[i];
          const s = shields[i];

          if (!p || p.state[i].handangle > 40|| p.state[i].extended == false) {
            s.root.visible = false;
            continue;
          }

          s.root.visible = true;
          s.root.x = app!.screen.width - p.x;
          s.root.y = p.y;

          const sizeFromPalm = Math.max(0.5, Math.min(2.4, p.palmwidth / 105));
          const pulse = 1 + Math.sin(tick * 1.6 + i) * 0.1;
          const surge = 1 + Math.sin(tick * 4 + i * 1.7) * 0.05;
          s.root.scale.set(sizeFromPalm * pulse * surge);

          // Fast counter-spin layers
          s.hexOuter.rotation += 0.03 * dt;
          s.hexMid.rotation -= 0.05 * dt;
          s.hexInner.rotation += 0.07 * dt;
          s.blades.rotation -= 0.012 * dt; // ice blades — slow
          s.orbit.rotation += 0.015 * dt; // ice gems — slow orbit
          s.arcs.rotation -= 0.08 * dt;
          s.ringOuter.rotation += 0.01 * dt;
          s.ringInner.rotation -= 0.018 * dt;
          s.coreSpike.rotation += 0.12 * dt;

          // Vibrant flicker
          s.glow.alpha = 0.1 + Math.sin(tick * 2.2 + i) * 0.05;
          s.core.alpha = 0.75 + Math.sin(tick * 5 + i) * 0.25;
          s.core.scale.set(0.9 + Math.sin(tick * 3 + i) * 0.25);
          s.blades.alpha = 0.7 + Math.sin(tick * 2.8 + i) * 0.3;
        }
      });
    }

    void setup();

    return () => {
      isMounted = false;
      if (app) {
        app.destroy(true, { children: true });
      }
    };
  }, [palmRef]);

  return <div className="Shield" ref={containerRef} />;
}

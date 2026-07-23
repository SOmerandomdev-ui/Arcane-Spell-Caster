import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import "./SpellManager.css";
import { createShield, updateShield } from "./Shield.tsx";
import {
  createLightning,
  hideLightning,
  updateLightning,
} from "./Lightning.tsx";
import { Application } from "pixi.js";
import type { HandState } from "../handTypes.ts";

type PalmPoint = {
  x: number;
  y: number;
  palmwidth: number;
  state: HandState;
};

type CanvasProps = {
  palmRef: RefObject<PalmPoint[]>;
};

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

      const lightning = createLightning();
      app.stage.addChild(lightning.root);

      let tick = 0;

      app.ticker.add((ticker) => {
        //init palms 
        const palms = palmRef.current ?? [];
        let leftpalm = null
        let rightpalm = null

        tick += ticker.deltaTime * 0.09;
        const dt = ticker.deltaTime;
        const bothpalms = palms.length == 2

        //Check if both palms exist
        if (bothpalms)  leftpalm = palms[0], rightpalm = palms[1]
        
        //For the Both palms are facing to the side 
        if (leftpalm?.state.direction == "Side" && rightpalm?.state.direction == "Side") {
          for (const s of shields) s.root.visible = false;
          updateLightning(lightning, leftpalm, rightpalm, tick, app!.screen.width, app!.screen.height);
          
        }
        else {
          hideLightning(lightning);
          for (let i = 0; i < 2; i++) {
          const palm = palms[i];
          const shield = shields[i];

          if (!palm || palm.state.direction == "Away" || palm.state.direction == "Side" || palm.state.extended == false) {
            shield.root.visible = false;
            continue;
          }

          updateShield(shield, palm, tick, dt, i, app!.screen.width);
        }}
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

import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import "./shield.css";
import { Graphics, Application, blurTemplateWgsl } from "pixi.js";

type CanvasProps = {
  palmRef: RefObject<{ x: number; y: number; palmwidth: number}[]>
};

export function Canvas({ palmRef }: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  //set up the canvas
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
      });

      if (!isMounted) {
        newApp.destroy(true, { children: true });
        return;
      }

      app = newApp;
      container.appendChild(app.canvas);
      

      //Render shield with two cirles 
      const c1 = new Graphics().regularPoly(0, 0, 100, 6).fill({ color: 0x00aaff, alpha: 0.1 }).stroke({ color: 0x00aaff, width: 4, alpha: 0.8 });;
      const c2 = new Graphics().regularPoly(0, 0, 100, 6).fill({ color: 0x00aaff, alpha: 0.1 }).stroke({ color: 0x00aaff, width: 4, alpha: 0.8 });;
      
      app.stage.addChild(c1, c2);
      const circles = [c1, c2]

      app.ticker.add(() => {
        //palmref.current gives the current state of palmref 
        const palms = palmRef.current
        console.log(palms[0])

        for (let i = 0; i < circles.length; i++) {
          const p = palms[i]
          if (!p) {
            circles[i].visible = false;
            continue;
          }

          //Tracks position of shield
          circles[i].visible = true;
          circles[i].x = app!.screen.width - p.x
          circles[i].y = p.y 

          //Animation for spin, reaction to palm distance from camera
          circles[i].rotation += 0.02
          circles[i].scale.set(p.palmwidth / 100)
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


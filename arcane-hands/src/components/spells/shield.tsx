import { useEffect, useRef } from "react";
import "./shield.css";
import { Application, blurTemplateWgsl } from "pixi.js";

export function Canvas() {
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
        backgroundColor: 0x1099bb,
        antialias: true,
      });

      if (!isMounted) {
        newApp.destroy(true, { children: true });
        return;
      }

      app = newApp;
      container.appendChild(app.canvas);
    }

    void setup();

    return () => {
      isMounted = false;
      if (app) {
        app.destroy(true, { children: true });
      }
    };
  }, []);

  return <div className="Shield" ref={containerRef} />;
}


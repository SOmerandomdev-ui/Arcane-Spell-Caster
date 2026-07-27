import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import "./SpellManager.css";
import { createShield, updateShield } from "./Shield.tsx";
import {createLightning, hideLightning, updateLightning} from "./Lightning.tsx";
import {createredorb, hideredorb, updateredorb} from "./redorb.tsx";
import { Application, Assets, Sprite, Texture, VideoSource } from "pixi.js";
import type { HandState } from "../handTypes.ts";
import { createFireball, hideFireball, updateFireball } from "./Fireball.tsx";
import {createBlackHole, hideBlackHole, updateBlackHole} from "./BlackHole.tsx";

type PalmPoint = {
  x: number;
  y: number;
  palmwidth: number;
  state: HandState;
};

type CanvasProps = {
  palmRef: RefObject<PalmPoint[]>;
  videoRef: RefObject<HTMLVideoElement | null>;
};

/**
 * Black-hole gesture:
 * - exactly one Up palm and one Down palm
 * - Down-facing palm sits above (or nearly above) the Up-facing palm
 */
function getBlackHoleHands(first: PalmPoint | null, second: PalmPoint | null): { upper: PalmPoint; lower: PalmPoint } | null {
  if (!first || !second || !first.state.extended || !second.state.extended) return null;
  
  //initalize uppalm and downpalm
  const downPalm = first.state.direction === "Down" ? first : 
    second.state.direction === "Down" ? second: null;

  const upPalm = first.state.direction === "Up" ? first : 
    second.state.direction === "Up" ? second : null;

  if (!downPalm || !upPalm || downPalm === upPalm) return null;

  //Gives a margin of error for how far the palms can be horizontally when they form the black hole 
  const palmScale = (downPalm.palmwidth + upPalm.palmwidth) * 0.5;
  const verticalTolerance = Math.max(18, palmScale * 0.55);
  const downIsAboveOrClose = downPalm.y <= upPalm.y + verticalTolerance;

  return downIsAboveOrClose ? { upper: downPalm, lower: upPalm } : null;
}

/** Cover-fit a mirrored video sprite into the Pixi screen. */
function layoutVideoBg(bg: Sprite, video: HTMLVideoElement, screenW: number, screenH: number): void {

  const vw = video.videoWidth || screenW;
  const vh = video.videoHeight || screenH;
  if (vw <= 0 || vh <= 0) return;
  const scale = Math.max(screenW / vw, screenH / vh);

  // Negative X mirrors to match the CSS scaleX(-1) selfie view.
  bg.scale.set(-scale, scale);
  bg.position.set(screenW / 2, screenH / 2);
}

export function Canvas({ palmRef, videoRef }: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let app: Application | null = null;
    let isMounted = true;
    let videoBg: Sprite | null = null;
    let videoTexture: Texture | null = null;
    let onResize: (() => void) | null = null;
    const trackedVideo = videoRef.current;

    async function setup() {
      const container = containerRef.current;
      if (!container) return;

      //starts a new app for the canvas and initlizes its properties
      const newApp = new Application();
      await newApp.init({
        resizeTo: container,
        backgroundAlpha: 0,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,

        // Needed so BackdropBlurFilter can sample stage content behind spells.
        useBackBuffer: true,
      });

      //destory app if there is no mount 
      if (!isMounted) {
        newApp.destroy(true, { children: true });
        return;
      }

      app = newApp;
      container.appendChild(app.canvas);

      // Feed live camera into Pixi so BackdropBlur on the fireball edge
      // can frost the real surroundings (not an empty transparent buffer).
      const video = trackedVideo;
      if (video) {
        const attachVideo = () => {
          if (!app || !isMounted || videoBg || !video.videoWidth) return;
          const source = new VideoSource({resource: video, autoPlay: false, updateFPS: 0});

          source.autoUpdate = true;
          videoTexture = new Texture({ source });
          videoBg = new Sprite({texture: videoTexture, anchor: 0.5,});
          app.stage.addChildAt(videoBg, 0);
          layoutVideoBg(videoBg, video, app.screen.width, app.screen.height);
          // Hide DOM video so pixi draws the feed 
          video.style.opacity = "0";
        };

        //attach video if the state permits 
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) attachVideo()
        else video.addEventListener("loadeddata", attachVideo, { once: true })

        onResize = () => {
          if (!app || !videoBg || !video.videoWidth) return;
          layoutVideoBg(videoBg, video, app.screen.width, app.screen.height);
        };
        window.addEventListener("resize", onResize);
      }

      //create the shield list beacuse there can be at most 2. Hide them as well 
      const shields = [createShield(), createShield()];
      for (const s of shields) {
        s.root.visible = false;
        app.stage.addChild(s.root);
      }

      //flame particles and creation of fireballs as well as visibility off
      const flameTexture = await Assets.load<Texture>("/particles/particle.png");

      const fireballs = [createFireball(flameTexture), createFireball(flameTexture)];
      for (const f of fireballs) {
        f.root.visible = false;
        app.stage.addChild(f.root);
      }

      //black hole creation
      const blackHole = createBlackHole();
      app.stage.addChild(blackHole.root);

      //lightening creation
      const lightning = createLightning();
      app.stage.addChild(lightning.root);

      //red orb creation as well as hide 
      const redorbs = [createredorb(), createredorb()];
      for (const orb of redorbs) {
        orb.root.visible = false;
        app.stage.addChild(orb.root);
      }

      let tick = 0;

      app.ticker.add((ticker) => {
        const palms = palmRef.current ?? [];
        let leftpalm = null;
        let rightpalm = null;

        tick += ticker.deltaTime * 0.09;
        const dt = ticker.deltaTime;
        const bothpalms = palms.length == 2;

        //check if both palms exist so we can check to use the multi-hand spells 
        if (bothpalms) {
          leftpalm = palms[0];
          rightpalm = palms[1];
        }

        //summon the black hole and hide the other spells 
        const blackHoleHands = getBlackHoleHands(leftpalm, rightpalm);
        if (blackHoleHands) {
          hideLightning(lightning);
          for (const s of shields) s.root.visible = false;
          for (const f of fireballs) hideFireball(f);
          for (const orb of redorbs) hideredorb(orb);
          updateBlackHole(blackHole, blackHoleHands.upper, blackHoleHands.lower, tick, dt, app!.screen.width);
          return;
        }

        //removes the blackhole WHEN the hand positions are different 
        hideBlackHole(blackHole);

        //When both palms face sideways use teh lightening spell 
        if (leftpalm?.state.direction == "Side" && rightpalm?.state.direction == "Side") {
          for (const s of shields) s.root.visible = false;
          for (const f of fireballs) hideFireball(f);
          for (const orb of redorbs) hideredorb(orb);
          updateLightning(lightning, leftpalm,rightpalm,tick, app!.screen.width, app!.screen.height);
          return;
        }
        //same logic as the black hole above 
        hideLightning(lightning);

        //iterates through the single hand spells lists 
        for (let i = 0; i < 2; i++) {
          const palm = palms[i];
          const shield = shields[i];
          const fireball = fireballs[i];
          const redorb = redorbs[i];

          //guard check for no palm 
          if (!palm) {
            shield.root.visible = false;
            hideFireball(fireball);
            hideredorb(redorb);
            continue;
          }

          const fingers = palm.state.extendedFingers;
          const indexOnly =
            fingers.index &&
            !fingers.middle &&
            !fingers.ring &&
            !fingers.pink;

          if (indexOnly) {
            shield.root.visible = false;
            hideFireball(fireball);
            updateredorb(
              redorb,
              palm,
              tick, 
              dt,
              app!.screen.width,
              app!.screen.height
            );
            continue;
          }

          hideredorb(redorb);

          if (palm.state.extended == false) {
            shield.root.visible = false;
            hideFireball(fireball);
            continue;
          }

          if (palm.state.direction == "Up") {
            shield.root.visible = false;
            updateFireball(
              fireball,
              palm,
              tick,
              dt,
              i,
              app!.screen.width
            );
            continue;
          }

          hideFireball(fireball);

          if (
            palm.state.direction == "Away" ||
            palm.state.direction == "Side" ||
            palm.state.direction == "Down"
          ) {
            shield.root.visible = false;
            continue;
          }

          // Toward
          updateShield(shield, palm, tick, dt, i, app!.screen.width);
        }
      });
    }

    void setup();

    return () => {
      isMounted = false;
      if (onResize) window.removeEventListener("resize", onResize);
      if (trackedVideo) trackedVideo.style.opacity = "";
      videoTexture?.destroy(true);
      videoTexture = null;
      videoBg = null;
      if (app) {
        app.destroy(true, { children: true });
      }
    };
  }, [palmRef, videoRef]);

  return <div className="Shield" ref={containerRef} />;
}

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
import { predictPose, setPoseActive } from "../../gestures_model/gesturemodel.ts";

/** Model score above this counts as "the trained hand sign is on screen". */
const POSE_SCORE = 0.8;

/** The sign has to be held this long before the backdrop fires. */
const POSE_HOLD_MS = 2000;

/**
 * The tracker loses the sign for a frame or two fairly often, so a gap only
 * counts as "hand lowered" once it lasts this long. Without it the 2s charge
 * almost never completes, and the effect strobes while the sign is held.
 */
const POSE_DROP_MS = 500;

/** Partly transparent so the room still reads faintly through the backdrop. */
const BACKDROP_ALPHA = 0.7;

/** Per-frame fraction of the remaining alpha gap to close (higher = snappier fade). */
const BACKDROP_FADE = 0.06;

/** wormhole.mp4 owns the screen alone for this long. */
const WORMHOLE_PLAY_MS = 1800;

/** Ramp up fast, then hand off to 314066_medium.mp4 over a short crossfade. */
const WORMHOLE_IN_MS = 220;
const WORMHOLE_SWITCH_MS = 450;
const WORMHOLE_TOTAL_MS = WORMHOLE_PLAY_MS + WORMHOLE_SWITCH_MS;

/** Users who ask for less motion get a straight cut to the black hole. */
const prefersReducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

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

/** Cover-fit a mirrored video sprite into the given area. */
function layoutVideoBg(bg: Sprite, video: HTMLVideoElement, screenW: number, screenH: number): void {

  const vw = video.videoWidth || screenW;
  const vh = video.videoHeight || screenH;
  if (vw <= 0 || vh <= 0) return;
  const scale = Math.max(screenW / vw, screenH / vh);

  // Negative X mirrors to match the CSS scaleX(-1) selfie view.
  bg.scale.set(-scale, scale);
  bg.position.set(screenW / 2, screenH / 2);
}

/** Cover-fit an effect clip into the given area, unmirrored. */
function layoutClip(clip: Sprite, video: HTMLVideoElement, screenW: number, screenH: number): void {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;

  const scale = Math.max(screenW / vw, screenH / vh);
  clip.scale.set(scale, scale);
  clip.position.set(screenW / 2, screenH / 2);
}

/**
 * Palms arrive in camera-pixel coordinates, so map the whole stage into camera
 * space: cover-fit the frame onto the (now fullscreen) canvas and every spell
 * keeps aiming in video pixels no matter how large the window gets.
 */
function fitStageToVideo(app: Application, video: HTMLVideoElement): void {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;

  const scale = Math.max(app.screen.width / vw, app.screen.height / vh);
  app.stage.scale.set(scale);
  app.stage.position.set(
    (app.screen.width - vw * scale) / 2,
    (app.screen.height - vh * scale) / 2,
  );
}

export function Canvas({ palmRef, videoRef }: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let app: Application | null = null;
    let isMounted = true;
    let videoBg: Sprite | null = null;
    let videoTexture: Texture | null = null;
    let blackholeBg: Sprite | null = null;
    let blackholeVideo: HTMLVideoElement | null = null;
    let wormhole: Sprite | null = null;
    let wormholeVideo: HTMLVideoElement | null = null;
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
      const pixiApp = newApp;
      container.appendChild(pixiApp.canvas);

      // Feed live camera into Pixi so BackdropBlur on the fireball edge
      // can frost the real surroundings (not an empty transparent buffer).
      const video = trackedVideo;

      //everything on the stage is authored in camera pixels
      const stageWidth = () => video?.videoWidth || pixiApp.screen.width;
      const stageHeight = () => video?.videoHeight || pixiApp.screen.height;

      if (video) {
        const attachVideo = () => {
          if (!isMounted || videoBg || !video.videoWidth) return;
          const source = new VideoSource({resource: video, autoPlay: false, updateFPS: 0});

          source.autoUpdate = true;
          videoTexture = new Texture({ source });
          videoBg = new Sprite({texture: videoTexture, anchor: 0.5,});
          pixiApp.stage.addChildAt(videoBg, 0);
          fitStageToVideo(pixiApp, video);
          layoutVideoBg(videoBg, video, stageWidth(), stageHeight());
          // Hide DOM video so pixi draws the feed 
          video.style.opacity = "0";
        };

        //attach video if the state permits 
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) attachVideo()
        else video.addEventListener("loadeddata", attachVideo, { once: true })

        onResize = () => {
          if (!video.videoWidth) return;
          fitStageToVideo(pixiApp, video);
          if (videoBg) layoutVideoBg(videoBg, video, stageWidth(), stageHeight());
          if (blackholeBg && blackholeVideo) layoutClip(blackholeBg, blackholeVideo, stageWidth(), stageHeight());
          if (wormhole && wormholeVideo) layoutClip(wormhole, wormholeVideo, stageWidth(), stageHeight());
        };
        window.addEventListener("resize", onResize);
      }

      /** Effect clips sit directly above the camera feed and below every spell. */
      const effectLayer = () =>
        videoBg ? pixiApp.stage.getChildIndex(videoBg) + 1 : 0;

      //the looping black hole that stays up for as long as the sign is held
      void Assets.load<Texture>({
        src: "/314066_medium.mp4",
        data: { autoPlay: false, loop: true, muted: true, playsinline: true },
      })
        .then((texture) => {
          if (!isMounted) return;

          blackholeVideo = texture.source.resource as HTMLVideoElement;
          blackholeBg = new Sprite({ texture, anchor: 0.5 });
          blackholeBg.visible = false;
          blackholeBg.alpha = 0;
          pixiApp.stage.addChildAt(blackholeBg, effectLayer());

          const clip = blackholeVideo;
          const sprite = blackholeBg;
          if (clip.videoWidth) layoutClip(sprite, clip, stageWidth(), stageHeight());
          else clip.addEventListener("loadeddata", () => layoutClip(sprite, clip, stageWidth(), stageHeight()), { once: true });
        })
        .catch((error: unknown) => console.warn("Could not load the black hole clip", error));

      //the one-shot burst that opens the effect
      void Assets.load<Texture>({
        src: "/wormhole.mp4",
        data: { autoPlay: false, loop: false, muted: true, playsinline: true },
      })
        .then((texture) => {
          if (!isMounted) return;

          wormholeVideo = texture.source.resource as HTMLVideoElement;
          wormhole = new Sprite({ texture, anchor: 0.5 });
          wormhole.visible = false;
          wormhole.alpha = 0;

          const aboveBlackhole = blackholeBg
            ? pixiApp.stage.getChildIndex(blackholeBg) + 1
            : effectLayer();
          pixiApp.stage.addChildAt(wormhole, aboveBlackhole);

          const clip = wormholeVideo;
          const sprite = wormhole;
          if (clip.videoWidth) layoutClip(sprite, clip, stageWidth(), stageHeight());
          else clip.addEventListener("loadeddata", () => layoutClip(sprite, clip, stageWidth(), stageHeight()), { once: true });
        })
        .catch((error: unknown) => console.warn("Could not load the wormhole clip", error));

      //create the shield list beacuse there can be at most 2. Hide them as well 
      const shields = [createShield(), createShield()];
      for (const s of shields) {
        s.root.visible = false;
        pixiApp.stage.addChild(s.root);
      }

      //flame particles and creation of fireballs as well as visibility off
      const flameTexture = await Assets.load<Texture>("/particles/particle.png");

      const fireballs = [createFireball(flameTexture), createFireball(flameTexture)];
      for (const f of fireballs) {
        f.root.visible = false;
        pixiApp.stage.addChild(f.root);
      }

      //black hole creation
      const blackHole = createBlackHole();
      pixiApp.stage.addChild(blackHole.root);

      //lightening creation
      const lightning = createLightning();
      pixiApp.stage.addChild(lightning.root);

      //red orb creation as well as hide 
      const redorbs = [createredorb(), createredorb()];
      for (const orb of redorbs) {
        orb.root.visible = false;
        pixiApp.stage.addChild(orb.root);
      }

      let tick = 0;
      let poseHoldMs = 0;
      let poseMissMs = POSE_DROP_MS;
      let poseMatched = false;
      let wormholeMs = WORMHOLE_TOTAL_MS;
      let posedLastFrame = false;

      pixiApp.ticker.add((ticker) => {
        const palms = palmRef.current ?? [];
        let leftpalm = null;
        let rightpalm = null;

        tick += ticker.deltaTime * 0.09;
        const dt = ticker.deltaTime;
        const bothpalms = palms.length == 2;

        //keep the stage locked to camera space even after the window changes size
        if (video?.videoWidth) fitStageToVideo(pixiApp, video);
        const stageW = stageWidth();
        const stageH = stageHeight();

        //ask the trained model whether either hand is making the sign
        let poseSeen = false;
        for (const palm of palms) {
          if (predictPose(palm.state.relativelandmarks) > POSE_SCORE) {
            poseSeen = true;
            break;
          }
        }

        //a brief wobble in the prediction shouldn't cancel the charge or the cast
        if (poseSeen) {
          poseMissMs = 0;
          poseHoldMs = Math.min(POSE_HOLD_MS, poseHoldMs + ticker.deltaMS);
        } else {
          poseMissMs += ticker.deltaMS;
        }

        //only a sustained gap counts as the hand coming down
        if (poseMissMs >= POSE_DROP_MS) {
          poseHoldMs = 0;
          poseMatched = false;
        } else if (poseHoldMs >= POSE_HOLD_MS) {
          poseMatched = true;
        }

        setPoseActive(poseMatched);

        //restart the burst on the frame the spell lands, not while it is held
        if (poseMatched && !posedLastFrame) {
          wormholeMs = prefersReducedMotion ? WORMHOLE_PLAY_MS : 0;

          if (wormholeVideo && !prefersReducedMotion) {
            wormholeVideo.currentTime = 0;
            void wormholeVideo.play().catch(() => undefined);
          }
        }
        posedLastFrame = poseMatched;

        if (wormhole && wormholeVideo) {
          const playing = poseMatched && !prefersReducedMotion && wormholeMs < WORMHOLE_TOTAL_MS;

          if (playing) {
            wormholeMs += ticker.deltaMS;
            const rampIn = Math.min(1, wormholeMs / WORMHOLE_IN_MS);
            const rampOut = Math.min(1, Math.max(0, (WORMHOLE_TOTAL_MS - wormholeMs) / WORMHOLE_SWITCH_MS));
            wormhole.alpha = BACKDROP_ALPHA * rampIn * rampOut;
            layoutClip(wormhole, wormholeVideo, stageW, stageH);
          } else {
            //dropping the sign mid-burst eases out instead of cutting
            const step = prefersReducedMotion ? 1 : Math.min(1, dt * BACKDROP_FADE);
            wormhole.alpha += (0 - wormhole.alpha) * step;
            if (wormhole.alpha <= 0.005 && !wormholeVideo.paused) wormholeVideo.pause();
          }

          wormhole.visible = wormhole.alpha > 0.005;
        } else if (poseMatched && !prefersReducedMotion) {
          //still burn the clock if the clip hasn't downloaded yet
          wormholeMs = Math.min(WORMHOLE_TOTAL_MS, wormholeMs + ticker.deltaMS);
        }

        //the loop takes over once the wormhole has had its three seconds alone
        const burstOwnsFrame = !prefersReducedMotion && wormholeMs < WORMHOLE_PLAY_MS;
        const handoffStarted = poseMatched && !burstOwnsFrame;

        if (blackholeBg && blackholeVideo) {
          if (handoffStarted && blackholeVideo.paused) {
            blackholeVideo.currentTime = 0;
            void blackholeVideo.play().catch(() => undefined);
          }

          const target = handoffStarted ? BACKDROP_ALPHA : 0;
          const step = prefersReducedMotion ? 1 : Math.min(1, dt * BACKDROP_FADE);
          blackholeBg.alpha += (target - blackholeBg.alpha) * step;
          blackholeBg.visible = blackholeBg.alpha > 0.005;

          if (blackholeBg.visible) layoutClip(blackholeBg, blackholeVideo, stageW, stageH);
          else if (!blackholeVideo.paused) blackholeVideo.pause();
        }

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
          updateBlackHole(blackHole, blackHoleHands.upper, blackHoleHands.lower, tick, dt, stageW);
          return;
        }

        //removes the blackhole WHEN the hand positions are different 
        hideBlackHole(blackHole);

        //When both palms face sideways use teh lightening spell 
        if (leftpalm?.state.direction == "Side" && rightpalm?.state.direction == "Side") {
          for (const s of shields) s.root.visible = false;
          for (const f of fireballs) hideFireball(f);
          for (const orb of redorbs) hideredorb(orb);
          updateLightning(lightning, leftpalm, rightpalm, tick, stageW, stageH);
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
              stageW,
              stageH
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
              stageW
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
          updateShield(shield, palm, tick, dt, i, stageW);
        }
      });
    }

    void setup();

    return () => {
      isMounted = false;
      setPoseActive(false);
      if (onResize) window.removeEventListener("resize", onResize);
      if (trackedVideo) trackedVideo.style.opacity = "";

      wormholeVideo?.pause();
      blackholeVideo?.pause();
      wormholeVideo = null;
      blackholeVideo = null;

      videoTexture?.destroy(true);
      videoTexture = null;
      videoBg = null;

      // The clip textures belong to the Assets cache, so only the sprites are
      // dropped here: destroying those textures would hand a dead texture back
      // to the next mount (StrictMode remounts this effect in dev).
      wormhole = null;
      blackholeBg = null;

      if (app) {
        app.destroy(true, { children: true });
        app = null;
      }
    };
  }, [palmRef, videoRef]);

  return <div className="Shield" ref={containerRef} />;
}

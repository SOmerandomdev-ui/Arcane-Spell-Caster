import { useEffect, useRef } from "react";
import { HandleHandResults } from "../HandCalculator.tsx";
import { Canvas } from "../spells/SpellManager.tsx";
import { drawOverlayText } from "../Overlay-Text.tsx";
import type { HandState } from "../handTypes.ts";
import {
  DrawingUtils,
  FilesetResolver,
  HandLandmarker,
} from "@mediapipe/tasks-vision";

export function HandTracker() {
  
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const palmRef = useRef<{ x: number; y: number; palmwidth: number; state: HandState }[]>([]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let handLandmarker: HandLandmarker | null = null;
    let drawingUtils: DrawingUtils | null = null;
    let animationFrameId: number | null = null;
    let lastVideoTime = -1;
    let disposed = false;

    function releaseResources() {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }

      stream?.getTracks().forEach((track) => track.stop());
      stream = null;

      handLandmarker?.close();
      handLandmarker = null;
    }

    async function start() {
      const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm");

      if (disposed) return;

      const createdLandmarker = 
        await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
        });

      if (disposed) {
        createdLandmarker.close();
        return;
      }

      handLandmarker = createdLandmarker;

      const cameraStream =
        await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false,
        });

      if (disposed) {
        cameraStream.getTracks().forEach((track) => track.stop());
        return;
      }

      stream = cameraStream;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas) throw new Error("Video or canvas element is missing");

      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not create canvas context");
      
      drawingUtils = new DrawingUtils(context);

      video.srcObject = stream;
      await video.play();

      predictWebcam();
    }

    function predictWebcam() {
      if (disposed) return;

      try {
        const video = videoRef.current;
        const canvas = canvasRef.current;

        if (
          !video ||
          !canvas ||
          !handLandmarker ||
          !drawingUtils ||
          video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
        ) {
          return;
        }

        if (
          canvas.width !== video.videoWidth ||
          canvas.height !== video.videoHeight
        ) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        // Avoid processing same camera frame more than once.
        if (video.currentTime === lastVideoTime) return;
        lastVideoTime = video.currentTime;

        //Process the hand data, does an action with it, and stores it in a variable
        const results = handLandmarker.detectForVideo(video, performance.now());

        const context = canvas.getContext("2d");
        if (!context) return;

        context.clearRect(0, 0, canvas.width, canvas.height);

        //Get center of hand coordinates and draw the palm 
        const FingerBases = [5, 9, 13, 17];

        //Temp storage to push to the palm reference
        const palms: { x: number; y: number; palmwidth: number; state: HandState }[] = [];
        const states = HandleHandResults(results);
        
        for (let handIndex = 0; handIndex < results.landmarks.length; handIndex++) {
          const hand = results.landmarks[handIndex];
          const state = states[handIndex];
          if (!state) continue;

          //calculation of knuckles first
          let dx = 0, dy = 0;
          
          // Add palm x and y components.
          for (const i of FingerBases) {
            dx += hand[i].x;
            dy += hand[i].y;
          }
          
          //Average of the four knuckle points 
          dx /= FingerBases.length; 
          dy /= FingerBases.length

          const wrist = hand[0];
          const pinky_base = hand[17]
          const index_base = hand[5]

          //Weighted average of the knuckles AND the wrist
          const x = (wrist.x + dx) / 2;
          const y = (wrist.y + dy) / 2;
        
          const px = x * canvas.width;
          const py = y * canvas.height;

          //palm width calculation 
          const palmwidthX = (pinky_base.x - index_base.x) * canvas.width
          const palmwidthY = (pinky_base.y - index_base.y) * canvas.width

          const palm_width = Math.hypot(palmwidthX, palmwidthY);

          palms.push({ x: px, y: py, palmwidth: palm_width, state });
          
            context.beginPath();
            context.arc(px, py, 8, 0, Math.PI * 2);
            context.fillStyle = "cyan";
            context.fill();
          }

          palmRef.current = palms;

        for (const landmarks of results.landmarks) {
          drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {color: "#040404", lineWidth: 2});
          drawingUtils.drawLandmarks(landmarks, {color: "#faf0f0", lineWidth: 1,});
        }

        drawOverlayText(context, palms);

      } catch (error) {
        console.error("Hand detection failed:", error);
      } finally {
        if (!disposed) {
          animationFrameId =
            requestAnimationFrame(predictWebcam);
        }
      }
    }

    void start().catch((error) => {
      console.error("Could not start hand tracker:", error);
      releaseResources();
    });

    return () => {
      disposed = true;
      releaseResources();
    };
  }, []);

  const layerStyle = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    transform: "scaleX(-1)",
  } as const;

  return (
    <div
      style={{
        position: "relative",
        width: "1280px",
        maxWidth: "100%",
        aspectRatio: "16 / 9",
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{
          ...layerStyle,
          objectFit: "cover",
          zIndex: 0,
        }}
      />

      <Canvas palmRef={palmRef} />

      <canvas
        ref={canvasRef}
        style={{
          ...layerStyle,
          pointerEvents: "none",
          zIndex: 2,
        }}
      />
    </div>
  );
}
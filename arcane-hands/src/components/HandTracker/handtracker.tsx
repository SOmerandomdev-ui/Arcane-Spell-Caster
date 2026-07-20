import { useEffect, useRef } from "react";
import { HandleHandResults } from "../HandCalculator.tsx";
import {
  DrawingUtils,
  FilesetResolver,
  HandLandmarker,
} from "@mediapipe/tasks-vision";

export function HandTracker() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
            height: { ideal: 720 },
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

        //Process the hand data and do something with it 
        const results = handLandmarker.detectForVideo(video, performance.now());
        HandleHandResults(results);

        const context = canvas.getContext("2d");
        if (!context) return;

        context.clearRect(0, 0, canvas.width, canvas.height);

        for (const landmarks of results.landmarks) {
          drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS,
            {
              color: "#040404",
              lineWidth: 2,
            });

          drawingUtils.drawLandmarks(landmarks, {color: "#faf0f0", lineWidth: 1,});
        }

        


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
        }}
      />

      <canvas
        ref={canvasRef}
        style={{
          ...layerStyle,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
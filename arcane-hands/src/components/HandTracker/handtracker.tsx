import { useEffect, useRef } from "react";
import { HandleHandResults } from "../HandCalculator.tsx";
import { Canvas } from "../spells/SpellManager.tsx";
import { drawOverlayText } from "../Overlay-Text.tsx";
import type { HandState } from "../handTypes.ts";
import { DrawingUtils, FilesetResolver, HandLandmarker} from "@mediapipe/tasks-vision";
import { isPoseActive } from "../../gestures_model/gesturemodel.ts";

/**
 * StrictMode mounts this effect twice in dev, and the webcam driver answers a
 * second getUserMedia with NotReadableError while the first one is still
 * opening. Queueing the sessions makes each mount wait for the previous one to
 * finish releasing the device.
 */
let cameraSession: Promise<void> = Promise.resolve();

export function HandTracker({isOn}: {isOn: boolean, SpellsActive: boolean}) {
  //Establish references to attach to 
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const palmRef = useRef<{ x: number; y: number; palmwidth: number; state: HandState }[]>([]);

  useEffect(() => {
    //check if the button to turn the camera on is pressed 
    if (!isOn) return 

    //establish variables for the video
    let stream: MediaStream | null = null;
    let handLandmarker: HandLandmarker | null = null;
    let drawingUtils: DrawingUtils | null = null;
    let animationFrameId: number | null = null;
    let lastVideoTime = -1;
    let disposed = false;
    let halted = false;

    function releaseResources() {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }

      //for each media track (audio, video, etc), cancel the tracks 
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;

      //stop the landmarking
      handLandmarker?.close();
      handLandmarker = null;
    }

    //aync function to start only when the video is mounted 
    async function start() {
      //get the hand marks
      const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm");

      if (disposed) return;

      //create the landmarks
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

      if (isOn == true) {
      //get the camera information with no audio
        const cameraStream =
          await navigator.mediaDevices.getUserMedia({video: {facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 }}, audio: false,});
          stream = cameraStream;
        if (disposed) {
          cameraStream.getTracks().forEach((track) => track.stop());
          return;
        }
      }

      

      const video = videoRef.current;
      const canvas = canvasRef.current;

      //safeguard against videdo or canvas not existing 
      if (!video || !canvas) throw new Error("Video or canvas element is missing");

      //get the information from the canvas 
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not create canvas context");
      
      drawingUtils = new DrawingUtils(context);

      //attach the stream to the video ref 
      video.srcObject = stream;
      await video.play();

      predictWebcam();
    }

    function predictWebcam() {
      if (disposed || halted) return;

      try {
        const video = videoRef.current;
        const canvas = canvasRef.current;

        //Safeguard against null elements. A 0x0 frame makes the MediaPipe WASM
        //module abort, so wait until the camera reports real dimensions.
        if (
          !video ||
          !canvas ||
          !handLandmarker ||
          !drawingUtils ||
          video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
          !video.videoWidth ||
          !video.videoHeight
        ) {
          return;
        }

        //equalize the landmark canvas and the video dimensions 
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

        //get information abou the video to be used later 
        const context = canvas.getContext("2d");
        if (!context) return;

        //clear the canvas 
        context.clearRect(0, 0, canvas.width, canvas.height);

        //while the pose spell is running the skeleton would sit on top of the effect
        const hideHands = isPoseActive();

        //Get center of hand coordinates and draw the palm 
        const FingerBases = [5, 9, 13, 17];

        //Temp storage to push to the palm reference
        const palms: { x: number; y: number; palmwidth: number; state: HandState }[] = [];

        //get the state of the hand including the hand, direction, extension, etc
        const states = HandleHandResults(results);
        
        //loop to iterate over both hands
        for (let handIndex = 0; handIndex < results.landmarks.length; handIndex++) {
          const hand = results.landmarks[handIndex];
          const state = states[handIndex];
          if (!state) continue;

          //initalize the x and y components to calculate the average coordinates 
          let dx = 0, dy = 0;
          
          // Add the x and y components of the four knuckle joints 
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
          
          //convert the hand coordinates to canvas coordinates to fdisplay on screen
          const px = x * canvas.width;
          const py = y * canvas.height;

          //calculate the palm width 
          const palmwidthX = (pinky_base.x - index_base.x) * canvas.width
          const palmwidthY = (pinky_base.y - index_base.y) * canvas.width
          const palm_width = Math.hypot(palmwidthX, palmwidthY);

          palms.push({ x: px, y: py, palmwidth: palm_width, state });
          
          //draw the palm dot 
          if (!hideHands) {
            context.beginPath();
            context.arc(px, py, 8, 0, Math.PI * 2);
            context.fillStyle = "cyan";
            context.fill();
          }
          }
          
        //change the reference to palms
        palmRef.current = palms;

        //draw the skeleton and the joints  
        if (!hideHands) {
          for (const landmarks of results.landmarks) {
            drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {color: "#040404", lineWidth: 2});
            drawingUtils.drawLandmarks(landmarks, {color: "#faf0f0", lineWidth: 1,});
          }
          drawOverlayText(context, palms);
        }
      } 
      
      finally { if (!disposed && !halted) animationFrameId = requestAnimationFrame(predictWebcam);}
    }

    cameraSession = cameraSession.then(start).catch((error: unknown) => {
      const name = error instanceof Error ? error.name : "";

      if (name === "NotReadableError" || name === "NotAllowedError") {
        console.error(`Could not open the camera (${name}). Close any other tab or app using the webcam, then reload.`, error);
      } else {
        console.error("Could not start hand tracker:", error);
      }

      releaseResources();
    });

    return () => {
      disposed = true;
      releaseResources();
    };
  }, [isOn]);

  const layerStyle = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    transform: "scaleX(-1)",
  } as const;

  //return the div with the video, the html canvas, and the imported canvas 
  if (!isOn) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        background: "#000",
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

      <Canvas palmRef={palmRef} videoRef={videoRef} />

      <canvas
        ref={canvasRef}
        style={{
          ...layerStyle,
          objectFit: "cover",
          pointerEvents: "none",
          zIndex: 2,
        }}
      />
    </div>
  );
}

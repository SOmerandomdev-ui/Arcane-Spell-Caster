import type { HandLandmarkerResult } from "@mediapipe/tasks-vision";
import type { HandState } from "./handTypes";

type Point = { x: number; y: number; z: number }

//Helper for calculating distance for finger states
function distance3D(a: Point, b: Point) {
    return Math.sqrt(
    (a.x - b.x) ** 2 +
    (a.y - b.y) ** 2 +
    (a.z - b.z) ** 2
  );
}

/**
 * Flattens the hand into the 42-value feature vector the gesture model expects:
 * each landmark's x/y offset from the wrist, divided by the wrist -> middle
 * knuckle distance so the pose reads the same near or far from the camera.
 */
function normalizeLandmarks(points: Point[]): number[] {
    const wrist = points[0]
    const middlebase = points[9]

    //hand size in screen units, guarded so a degenerate frame can't divide by zero
    const scale = Math.hypot(middlebase.x - wrist.x, middlebase.y - wrist.y) || 1

    const features: number[] = []
    for (const point of points) {
        features.push((point.x - wrist.x) / scale, (point.y - wrist.y) / scale)
    }
    return features
}

//Helper for checking finger extension
function isFingerExtended(tip: Point, base: Point, wrist: Point): boolean {
    const tipToWrist = distance3D(tip, wrist);
    const baseToWrist = distance3D(base, wrist);
    return tipToWrist > baseToWrist 
}

//function that returns an object containing information on like which fingers are extended, the direction its facing, and more 
export function HandleHandResults(results: HandLandmarkerResult): HandState[] {
    if (results.landmarks.length == 0) return []

    //iterate over each hand 
    return results.landmarks.map<HandState>((points, handIndex) => {
        //get coordinates for all the points 
        const WRIST = points[0]
        const THUMB_BASE = points[1]
        const THUMB_TIP = points[4]
        const INDEX_BASE = points[5]
        const INDEX_TIP = points[8]
        const MIDDLE_BASE = points[9]
        const MIDDLE_TIP = points[12]
        const RING_BASE = points[13]
        const RING_TIP = points[16]
        const PINKY_BASE = points[17]
        const PINKY_TIP = points[20]

        //check if its the left or right hand and get the tip of each finger 
        const handedness = results.handedness[handIndex]?.[0]?.categoryName
        const hand: HandState["hand"] = handedness === "Left" ? "Left" : "Right"
        const TIP: HandState["tip"] = {thumb: THUMB_TIP, index: INDEX_TIP, middle: MIDDLE_TIP, ring: RING_TIP, pink: PINKY_TIP}
        const BASE: HandState["base"] = {thumb: THUMB_BASE, index: INDEX_BASE, middle: MIDDLE_BASE, ring: RING_BASE, pink: PINKY_BASE}

        //check extension state for all the fingers 
        const RING_EXTEND = isFingerExtended(RING_TIP, RING_BASE, WRIST)
        const PINKY_EXTEND = isFingerExtended(PINKY_TIP, PINKY_BASE, WRIST)
        const INDEX_EXTEND = isFingerExtended(INDEX_TIP, INDEX_BASE, WRIST)
        const MIDDLE_EXTEND = isFingerExtended(MIDDLE_TIP, MIDDLE_BASE, WRIST)
        const THUMB_EXTEND = isFingerExtended(THUMB_TIP, THUMB_BASE, WRIST)

        //coordinates for the wrist to the middle finger base and wrist to the pinky base 
        const [x1, y1, z1] = [WRIST.x, WRIST.y, WRIST.z]
        const [x2, y2, z2] = [MIDDLE_BASE.x, MIDDLE_BASE.y, MIDDLE_BASE.z]
        const [x3, y3, z3] = [PINKY_BASE.x, PINKY_BASE.y, PINKY_BASE.z]

        //vectors representing it 
        const vx1 = x2 - x1
        const vx2 = x3 - x1
        const vy1 = y2 - y1
        const vy2 = y3 - y1
        const vz1 = z2 - z1
        const vz2 = z3 - z1
        
        //Normal vector components as well as the normalized components
        const normalX = vy1 * vz2 - vz1 * vy2
        const normalY = vz1 * vx2 - vx1 * vz2
        const normalZ = vx1 * vy2 - vy1 * vx2    
        const magnitude = Math.sqrt(normalX**2 + normalY**2 + normalZ**2)
        
        const normalizedX = normalX / magnitude
        const normalizedY = normalY / magnitude
        const normalizedZ = normalZ / magnitude
        const normalizedmangnitude = Math.sqrt(normalizedX**2 + normalizedY**2 + normalizedZ**2)
        const screenmagnitude = 1

        //normal vector and screen vector pointing towards the camera and from above 
        const normalizedvector = {x: normalizedX, y: normalizedY, z: normalizedZ}
        const screenvectorz = {x: 0, y: 0, z: hand === "Right" ? -1 : 1}
        const screenvectory = {x: 0, y: hand === "Right" ? 1 : -1, z: 0}
        
        //Finding the dot product of both of the screen vectors 
        const dotproductz = normalizedvector.z * screenvectorz.z
        const dotproducty = normalizedvector.y * screenvectory.y
        const totalmagnitude = normalizedmangnitude * screenmagnitude

        //Use angle formula to find the angle between the palm and the screen and the palm and the top of the screen
        const anglez = Math.acos(dotproductz / totalmagnitude) * (180 / Math.PI)
        const angley = Math.acos(dotproducty / totalmagnitude) * (180 / Math.PI)
        
        //Initalize direction, extended, and an extended fingers object 
        let direction: HandState["direction"] = "Side"
        const extended = (RING_EXTEND && PINKY_EXTEND && THUMB_EXTEND && INDEX_EXTEND && MIDDLE_EXTEND)
        const extendedFingers: HandState["extendedFingers"] = {thumb: THUMB_EXTEND, index: INDEX_EXTEND, middle: MIDDLE_EXTEND, ring: RING_EXTEND, pink: PINKY_EXTEND,}

        //absolute value for the normalized components to use for normal vector detection for spells
        const nx = Math.abs(normalizedX)
        const ny = Math.abs(normalizedY)
        const nz = Math.abs(normalizedZ)

        //checks which normal vector dominates and sets palm direction based on that 
        if (ny * 1.1 > nx && ny * 1.1 > nz) {
            if (angley < 75) direction = "Down"
            else if (angley > 100) direction = "Up"
        }
        else if (nz > nx * 0.9 && nz > ny * 0.9 ){
            if (anglez < 45) direction = "Toward"
            else if (anglez > 140) direction = "Away"
        }
        
        else direction = "Side"
        
        return {hand: hand, direction: direction, extended: extended, extendedFingers: extendedFingers, handangleZ: anglez, handangleY: angley,  tip: TIP, base: BASE, relativelandmarks: normalizeLandmarks(points) }
        
    })
}
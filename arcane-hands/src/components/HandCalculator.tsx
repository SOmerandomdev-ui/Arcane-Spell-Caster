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
    //Helper for checking finger extension
    function isFingerExtended(tip: Point, base: Point, wrist: Point): boolean {
        const tipToWrist = distance3D(tip, wrist);
        const baseToWrist = distance3D(base, wrist);
        return tipToWrist > baseToWrist 
    }

export function HandleHandResults(results: HandLandmarkerResult): HandState[] {
    if (results.landmarks.length == 0) return []
        
        return results.landmarks.map<HandState>((points, handIndex) => {
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
            const handedness = results.handedness[handIndex]?.[0]?.categoryName
            const hand: HandState["hand"] = handedness === "Left" ? "Left" : "Right"
            const TIP: HandState["tip"] = {thumb: THUMB_TIP, index: INDEX_TIP, middle: MIDDLE_TIP, ring: RING_TIP, pink: PINKY_TIP}

            const RING_EXTEND = isFingerExtended(RING_TIP, RING_BASE, WRIST)
            const PINKY_EXTEND = isFingerExtended(PINKY_TIP, PINKY_BASE, WRIST)
            const INDEX_EXTEND = isFingerExtended(INDEX_TIP, INDEX_BASE, WRIST)
            const MIDDLE_EXTEND = isFingerExtended(MIDDLE_TIP, MIDDLE_BASE, WRIST)
            const THUMB_EXTEND = isFingerExtended(THUMB_TIP, THUMB_BASE, WRIST)

            //Checking palm direction
            const [x1, y1, z1] = [WRIST.x, WRIST.y, WRIST.z]
            const [x2, y2, z2] = [MIDDLE_BASE.x, MIDDLE_BASE.y, MIDDLE_BASE.z]
            const [x3, y3, z3] = [PINKY_BASE.x, PINKY_BASE.y, PINKY_BASE.z]

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

            //normal vector and screen vector 
            const normalizedvector = {x: normalizedX, y: normalizedY, z: normalizedZ}
            const screenvector = {x: 0, y: 0, z: hand === "Right" ? -1 : 1}

            //Find angle 
            const dotproduct = normalizedvector.z * screenvector.z
            const totalmagnitude = normalizedmangnitude * screenmagnitude
            const angle = Math.acos(dotproduct / totalmagnitude) * (180 / Math.PI)
            
            
            //for the shield spell 
            let direction: HandState["direction"]
            const extended = (RING_EXTEND && PINKY_EXTEND && THUMB_EXTEND && INDEX_EXTEND && MIDDLE_EXTEND)
            const extendedFingers: HandState["extendedFingers"] = {thumb: THUMB_EXTEND, index: INDEX_EXTEND, middle: MIDDLE_EXTEND, ring: RING_EXTEND, pink: PINKY_EXTEND,}

            //border for palm facing camera 
            if (angle > 30 && angle < 140) direction = "Side" 
            else if (angle > 140) direction = "Away"
            else direction = "Toward"
            
   
            return {hand: hand, direction: direction, extended: extended, extendedFingers: extendedFingers, handangle: angle, tip: TIP }
            
        })
}
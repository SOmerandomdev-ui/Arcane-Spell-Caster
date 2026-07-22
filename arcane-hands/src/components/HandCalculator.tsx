import type { HandLandmarkerResult } from "@mediapipe/tasks-vision";

export function HandleHandResults(results: HandLandmarkerResult) {
    if (results.landmarks.length == 0)  return
    else {
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
        function isFingerExtended(tip: Point, middle: Point, wrist: Point): boolean {
            const tipToWrist = distance3D(tip, wrist);
            const middleToWrist = distance3D(middle, wrist);
            return tipToWrist > middleToWrist;
        }
        
        return results.landmarks.map((points, handIndex) => {
            const WRIST = points[0]
            const THUMB_BASE = points[1]
            const THUMB_MIDDLE = points[2]
            const THUMB_INDEX = points[3]
            const THUMB_TIP = points[4]
            const INDEX_BASE = points[5]
            const INDEX_MIDDLE = points[6]
            const INDEX_INDEX = points[7]
            const INDEX_TIP = points[8]
            const MIDDLE_BASE = points[9]
            const MIDDLE_MIDDLE = points[10]
            const MIDDLE_INDEX = points[11]
            const MIDDLE_TIP = points[12]
            const RING_BASE = points[13]
            const RING_MIDDLE = points[14]
            const RING_INDEX = points[15]
            const RING_TIP = points[16]
            const PINKY_BASE = points[17]
            const PINKY_MIDDLE = points[18]
            const PINKY_INDEX = points[19]
            const PINKY_TIP = points[20]
            const hand = results.handedness[handIndex][0].categoryName 

            const RING_EXTEND = isFingerExtended(RING_TIP, RING_MIDDLE, WRIST)
            const PINKY_EXTEND = isFingerExtended(PINKY_TIP, PINKY_MIDDLE, WRIST)
            const INDEX_EXTEND = isFingerExtended(INDEX_TIP, INDEX_MIDDLE, WRIST)
            const MIDDLE_EXTEND = isFingerExtended(MIDDLE_TIP, MIDDLE_MIDDLE, WRIST)
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
            let direction = null
            let extended = (RING_EXTEND && PINKY_EXTEND && THUMB_EXTEND && INDEX_EXTEND && MIDDLE_EXTEND)

            //border for palm facing camera 
            if (normalZ < 0 && hand == "Right") direction = "Toward" 
            else if (normalZ > 0 && hand == "Right") direction = "Away"
            else if (normalZ < 0 && hand == "Left")  direction = "Away" 
            else if (normalZ > 0 && hand == "Left") direction = "Toward"  
           
            return {hand: hand, direction: direction, extended: extended, handangle: angle }
            
        })

        

        



        
        
}}
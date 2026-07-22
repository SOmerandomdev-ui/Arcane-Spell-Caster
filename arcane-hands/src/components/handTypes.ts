export type HandSide = "Left" | "Right";
export type PalmDirection = "Toward" | "Away";

export type HandState = {
  hand: HandSide;
  direction: PalmDirection;
};

export type NestedHandState = [HandState]

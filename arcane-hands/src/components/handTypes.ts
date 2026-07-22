export type HandSide = "Left" | "Right";
export type PalmDirection = "Toward" | "Away";

export type HandState = {
  hand: HandSide;
  direction: PalmDirection;
  extended: boolean;
  handangle: number;
};

export type NestedHandState = [HandState]

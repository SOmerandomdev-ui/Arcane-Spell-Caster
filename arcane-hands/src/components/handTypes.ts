export type HandSide = "Left" | "Right";
export type PalmDirection = "Toward" | "Away" | "Side" | "Up" | "Down";
type TipLocation = {thumb: Point, index: Point, middle: Point, ring: Point, pink: Point}
type Point = { x: number; y: number; z: number };

export type ExtendedFingers = {
  thumb: boolean;
  index: boolean;
  middle: boolean;
  ring: boolean;
  pink: boolean;
};

export type HandState = {
  hand: HandSide;
  direction: PalmDirection;
  extended: boolean;
  extendedFingers: ExtendedFingers;
  handangleZ: number;
  handangleY: number;
  tip: TipLocation;
  base: TipLocation;
  relativelandmarks: number[];
};




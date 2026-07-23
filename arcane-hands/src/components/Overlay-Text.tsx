import type { HandState } from "./handTypes.ts";

export type OverlayPalm = {
  x: number;
  y: number;
  palmwidth: number;
  /** One hand state, or full State array (indexed by hand i) */
  state: HandState | HandState[] | null | undefined;
};

function resolveState(
  state: OverlayPalm["state"],
  handIndex: number
): HandState | null {
  if (!state) return null;
  if (Array.isArray(state)) {
    return state[handIndex] ?? null;
  }
  return state;
}

/**
 * Draw debug / status text on the landmark canvas at each palm.
 * Canvas CSS is mirrored (scaleX(-1)), so text is un-mirrored here.
 */
export function drawOverlayText(
  context: CanvasRenderingContext2D,
  palms: OverlayPalm[]
) {
  const lineHeight = 22;

  for (let i = 0; i < palms.length; i++) {
    const palm = palms[i];
    const info = resolveState(palm.state, i);

    const lines = [
      `Hand ${i + 1}`,
      `pos: ${Math.round(palm.x)}, ${Math.round(palm.y)}`,
      `width: ${Math.round(palm.palmwidth)}`,
      `side: ${info?.hand ?? "?"}`,
      `face: ${info?.direction ?? "?"}`,
      `open: ${info?.extended ?? "?"}`,
      `angle: ${info?.handangle != null ? info.handangle.toFixed(1) + "°" : "?"}`,
    ];

    context.save();
    // Undo CSS mirror so letters read normally
    context.scale(-1, 1);
    context.font = "18px monospace";
    context.textAlign = "left";
    context.textBaseline = "top";

    const textX = -palm.x + 14;
    let textY = palm.y - (lines.length * lineHeight) / 2;

    // Soft backdrop for readability
    const boxW = 160;
    const boxH = lines.length * lineHeight + 8;
    context.fillStyle = "rgba(0, 0, 0, 0.45)";
    context.fillRect(textX - 6, textY - 4, boxW, boxH);

    context.fillStyle = "#ffffff";
    for (const line of lines) {
      context.fillText(line, textX, textY);
      textY += lineHeight;
    }

    context.restore();
  }
}

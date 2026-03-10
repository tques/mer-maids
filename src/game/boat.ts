// Abstract carrier-style boat sitting high on the waterline

import { getWaveY, getWaterSurfaceY } from "./water";

export interface Boat {
  x: number;
  width: number;
  hullDepth: number;
}

export function createBoat(canvasWidth: number): Boat {
  return {
    x: canvasWidth / 2,       // centered
    width: canvasWidth * 0.45, // long carrier
    hullDepth: 14,             // shallow – sits high
  };
}

export function drawBoat(ctx: CanvasRenderingContext2D, boat: Boat, canvasHeight: number) {
  const surfaceY = getWaterSurfaceY(canvasHeight);
  const waveY = getWaveY(boat.x, surfaceY);
  const topY = waveY - 6; // sits just above waves

  const hw = boat.width / 2;

  ctx.save();

  // Hull – simple geometric trapezoid (carrier silhouette)
  ctx.beginPath();
  ctx.moveTo(boat.x - hw, topY);                          // top-left
  ctx.lineTo(boat.x - hw * 0.85, topY + boat.hullDepth);  // bottom-left (tapered)
  ctx.lineTo(boat.x + hw * 0.85, topY + boat.hullDepth);  // bottom-right
  ctx.lineTo(boat.x + hw, topY);                          // top-right
  ctx.closePath();
  ctx.fillStyle = "#2a2a2a";
  ctx.fill();

  // Deck line accent
  ctx.beginPath();
  ctx.moveTo(boat.x - hw + 6, topY + 3);
  ctx.lineTo(boat.x + hw - 6, topY + 3);
  ctx.strokeStyle = "#444";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Small bridge/tower rectangle (abstract)
  const towerW = 16;
  const towerH = 18;
  ctx.fillStyle = "#333";
  ctx.fillRect(boat.x + hw * 0.25 - towerW / 2, topY - towerH, towerW, towerH);

  ctx.restore();
}

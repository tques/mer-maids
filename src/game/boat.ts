// Abstract carrier-style boat sitting high on the waterline

import { getWaveY, getWaterSurfaceY } from "./water";

export interface Boat {
  x: number;
  width: number;
  hullDepth: number;
}

export function createBoat(worldWidth: number): Boat {
  return {
    x: worldWidth / 2,
    width: Math.min(worldWidth * 0.12, 450),
    hullDepth: 14,
  };
}

export function drawBoat(ctx: CanvasRenderingContext2D, boat: Boat, viewH: number) {
  const surfaceY = getWaterSurfaceY(viewH);
  const waveY = getWaveY(boat.x, surfaceY);
  const topY = waveY - 6;

  const hw = boat.width / 2;

  ctx.save();

  ctx.beginPath();
  ctx.moveTo(boat.x - hw, topY);
  ctx.lineTo(boat.x - hw * 0.85, topY + boat.hullDepth);
  ctx.lineTo(boat.x + hw * 0.85, topY + boat.hullDepth);
  ctx.lineTo(boat.x + hw, topY);
  ctx.closePath();
  ctx.fillStyle = "#2a2a2a";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(boat.x - hw + 6, topY + 3);
  ctx.lineTo(boat.x + hw - 6, topY + 3);
  ctx.strokeStyle = "#444";
  ctx.lineWidth = 1;
  ctx.stroke();

  const towerW = 16;
  const towerH = 18;
  ctx.fillStyle = "#333";
  ctx.fillRect(boat.x + hw * 0.25 - towerW / 2, topY - towerH, towerW, towerH);

  ctx.restore();
}

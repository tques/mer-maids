// Abstract carrier-style boat — thick, imposing silhouette

import { getWaveY, getWaterSurfaceY } from "./water";

export interface Boat {
  x: number;
  width: number;
  hullDepth: number;
}

export function createBoat(worldWidth: number): Boat {
  return {
    x: worldWidth / 2,
    width: 700,
    hullDepth: 36, // much thicker hull
  };
}

/** Returns the top-Y of the boat deck at the center for collision purposes */
export function getBoatTopY(boat: Boat, viewH: number): number {
  const surfaceY = getWaterSurfaceY(viewH);
  const waveY = getWaveY(boat.x, surfaceY);
  return waveY - 10;
}

export function drawBoat(ctx: CanvasRenderingContext2D, boat: Boat, viewH: number) {
  const surfaceY = getWaterSurfaceY(viewH);
  const waveY = getWaveY(boat.x, surfaceY);
  const topY = waveY - 10;

  const hw = boat.width / 2;
  const hd = boat.hullDepth;

  ctx.save();

  // Hull shadow (underwater part)
  ctx.beginPath();
  ctx.moveTo(boat.x - hw * 0.75, topY + hd);
  ctx.quadraticCurveTo(boat.x, topY + hd + 14, boat.x + hw * 0.75, topY + hd);
  ctx.fillStyle = "rgba(10, 20, 40, 0.35)";
  ctx.fill();

  // Main hull — trapezoidal with angled bow/stern
  ctx.beginPath();
  ctx.moveTo(boat.x - hw, topY + 2);
  ctx.lineTo(boat.x - hw + 30, topY);          // bow top
  ctx.lineTo(boat.x + hw - 30, topY);          // stern top
  ctx.lineTo(boat.x + hw, topY + 2);           // stern edge
  ctx.lineTo(boat.x + hw * 0.88, topY + hd);   // stern bottom
  ctx.lineTo(boat.x - hw * 0.88, topY + hd);   // bow bottom
  ctx.closePath();
  ctx.fillStyle = "#1a1a1a";
  ctx.fill();

  // Hull armor plates — horizontal lines
  ctx.strokeStyle = "#2a2a2a";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    const ly = topY + (hd * i) / 4;
    const shrink = i * 8;
    ctx.beginPath();
    ctx.moveTo(boat.x - hw * 0.88 + shrink, ly);
    ctx.lineTo(boat.x + hw * 0.88 - shrink, ly);
    ctx.stroke();
  }

  // Deck surface — slightly lighter strip
  ctx.beginPath();
  ctx.moveTo(boat.x - hw + 30, topY);
  ctx.lineTo(boat.x + hw - 30, topY);
  ctx.lineTo(boat.x + hw - 10, topY + 5);
  ctx.lineTo(boat.x - hw + 10, topY + 5);
  ctx.closePath();
  ctx.fillStyle = "#252525";
  ctx.fill();

  // Flight deck markings — dashed center line
  ctx.setLineDash([20, 15]);
  ctx.beginPath();
  ctx.moveTo(boat.x - hw + 60, topY + 2.5);
  ctx.lineTo(boat.x + hw - 60, topY + 2.5);
  ctx.strokeStyle = "#3a3a3a";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);

  // Landing markers
  ctx.strokeStyle = "#444";
  ctx.lineWidth = 1;
  for (let i = -2; i <= 2; i++) {
    const mx = boat.x + i * 80;
    ctx.beginPath();
    ctx.moveTo(mx - 6, topY + 1);
    ctx.lineTo(mx + 6, topY + 1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mx, topY - 1);
    ctx.lineTo(mx, topY + 4);
    ctx.stroke();
  }

  // Island / control tower — taller, multi-tier
  const towerX = boat.x + hw * 0.28;
  const towerW = 22;
  const towerH = 30;
  // Base tier
  ctx.fillStyle = "#222";
  ctx.fillRect(towerX - towerW / 2 - 4, topY - towerH * 0.5, towerW + 8, towerH * 0.5);
  // Upper tier
  ctx.fillStyle = "#2a2a2a";
  ctx.fillRect(towerX - towerW / 2, topY - towerH, towerW, towerH * 0.55);
  // Antenna
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(towerX, topY - towerH);
  ctx.lineTo(towerX, topY - towerH - 12);
  ctx.stroke();
  // Antenna cross
  ctx.beginPath();
  ctx.moveTo(towerX - 5, topY - towerH - 8);
  ctx.lineTo(towerX + 5, topY - towerH - 8);
  ctx.stroke();
  // Window lights
  ctx.fillStyle = "#5a7a5a";
  ctx.fillRect(towerX - towerW / 2 + 3, topY - towerH + 4, towerW - 6, 3);

  // Secondary small structure (radar dome area)
  const radar2X = boat.x - hw * 0.3;
  ctx.fillStyle = "#222";
  ctx.fillRect(radar2X - 8, topY - 10, 16, 10);
  // Small dome
  ctx.beginPath();
  ctx.arc(radar2X, topY - 10, 6, Math.PI, 0);
  ctx.fillStyle = "#333";
  ctx.fill();

  // Bow wedge accent
  ctx.beginPath();
  ctx.moveTo(boat.x - hw, topY + 2);
  ctx.lineTo(boat.x - hw - 12, topY + hd * 0.4);
  ctx.lineTo(boat.x - hw, topY + hd * 0.6);
  ctx.closePath();
  ctx.fillStyle = "#1a1a1a";
  ctx.fill();

  // Stern wedge
  ctx.beginPath();
  ctx.moveTo(boat.x + hw, topY + 2);
  ctx.lineTo(boat.x + hw + 8, topY + hd * 0.3);
  ctx.lineTo(boat.x + hw, topY + hd * 0.5);
  ctx.closePath();
  ctx.fillStyle = "#1a1a1a";
  ctx.fill();

  // Waterline highlight
  ctx.beginPath();
  ctx.moveTo(boat.x - hw * 0.88, topY + hd);
  ctx.lineTo(boat.x + hw * 0.88, topY + hd);
  ctx.strokeStyle = "rgba(100, 160, 200, 0.15)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}

/** Check if a point collides with the boat hull and return push-out vector */
export function collideWithBoat(
  px: number, py: number, radius: number,
  boat: Boat, viewH: number
): { x: number; y: number } | null {
  const topY = getBoatTopY(boat, viewH);
  const hw = boat.width / 2;
  const hd = boat.hullDepth;

  // Bounding box check
  if (px < boat.x - hw - radius || px > boat.x + hw + radius) return null;
  if (py < topY - radius - 40 || py > topY + hd + radius) return null;

  // Check if inside the hull rectangle (simplified)
  const inX = px > boat.x - hw + 10 && px < boat.x + hw - 10;
  const inY = py > topY - radius && py < topY + hd + radius;

  if (inX && inY) {
    // Push player out — determine closest edge
    const distTop = py - (topY - radius);
    const distBot = (topY + hd + radius) - py;

    if (distTop < distBot) {
      return { x: px, y: topY - radius - 1 };
    } else {
      return { x: px, y: topY + hd + radius + 1 };
    }
  }

  return null;
}

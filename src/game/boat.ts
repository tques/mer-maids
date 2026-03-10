// Traditional boat sitting high on the waterline

import { getWaveY, getWaterSurfaceY } from "./water";

export interface Boat {
  x: number;       // center x
  width: number;
  height: number;   // hull depth below waterline
  mastHeight: number;
}

export function createBoat(canvasWidth: number): Boat {
  return {
    x: canvasWidth * 0.65,
    width: 120,
    height: 18,      // shallow hull – sits high on waterline
    mastHeight: 70,
  };
}

export function drawBoat(ctx: CanvasRenderingContext2D, boat: Boat, canvasHeight: number) {
  const surfaceY = getWaterSurfaceY(canvasHeight);
  // Average wave height at boat center for gentle bobbing
  const waveY = getWaveY(boat.x, surfaceY);
  const boatY = waveY - 2; // sits just above wave surface

  const hw = boat.width / 2;

  ctx.save();

  // Hull – traditional wooden boat shape (trapezoid with curved bottom)
  ctx.beginPath();
  ctx.moveTo(boat.x - hw, boatY);                          // top-left
  ctx.lineTo(boat.x - hw * 0.6, boatY + boat.height);      // bottom-left (narrower)
  ctx.quadraticCurveTo(boat.x, boatY + boat.height + 4, boat.x + hw * 0.6, boatY + boat.height); // curved bottom
  ctx.lineTo(boat.x + hw, boatY);                          // top-right
  ctx.closePath();
  ctx.fillStyle = "#8B5E3C";
  ctx.fill();
  ctx.strokeStyle = "#5C3A1E";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Deck line
  ctx.beginPath();
  ctx.moveTo(boat.x - hw + 4, boatY + 3);
  ctx.lineTo(boat.x + hw - 4, boatY + 3);
  ctx.strokeStyle = "#6B4226";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Mast
  const mastX = boat.x;
  const mastTop = boatY - boat.mastHeight;
  ctx.beginPath();
  ctx.moveTo(mastX, boatY);
  ctx.lineTo(mastX, mastTop);
  ctx.strokeStyle = "#5C3A1E";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Sail – triangular
  ctx.beginPath();
  ctx.moveTo(mastX, mastTop + 5);
  ctx.lineTo(mastX + hw * 0.7, boatY - 8);
  ctx.lineTo(mastX, boatY - 8);
  ctx.closePath();
  ctx.fillStyle = "rgba(240, 230, 210, 0.85)";
  ctx.fill();
  ctx.strokeStyle = "rgba(180, 160, 130, 0.6)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
}

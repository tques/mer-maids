// Powerup system: ship lives and boat repair spawn under the boat based on score thresholds

import { getWaterSurfaceY, getWaveY } from "./water";

export type PowerupType = "ship" | "repair";

export interface Powerup {
  x: number;
  y: number;
  type: PowerupType;
  spawnTime: number;
  alive: boolean;
}

let powerups: Powerup[] = [];
let nextShipReward = 500;
let nextRepairReward = 300;

export function resetPowerups() {
  powerups = [];
  nextShipReward = 500;
  nextRepairReward = 300;
}

export function getPowerups() { return powerups; }

export function checkScoreRewards(score: number, boatX: number, boatWidth: number, viewH: number) {
  const surfaceY = getWaterSurfaceY(viewH);
  const baseY = surfaceY + 20;

  if (score >= nextShipReward) {
    const spawnX = boatX + (Math.random() - 0.5) * boatWidth * 0.6;
    powerups.push({
      x: spawnX,
      y: baseY + 10 + Math.random() * 30,
      type: "ship",
      spawnTime: performance.now(),
      alive: true,
    });
    nextShipReward += 800 + Math.floor(nextShipReward * 0.3);
  }

  if (score >= nextRepairReward) {
    const spawnX = boatX + (Math.random() - 0.5) * boatWidth * 0.6;
    powerups.push({
      x: spawnX,
      y: baseY + 10 + Math.random() * 30,
      type: "repair",
      spawnTime: performance.now(),
      alive: true,
    });
    nextRepairReward += 500 + Math.floor(nextRepairReward * 0.2);
  }
}

export function checkPowerupPickup(px: number, py: number, radius: number): PowerupType | null {
  for (const p of powerups) {
    if (!p.alive) continue;
    if (Math.hypot(p.x - px, p.y - py) < radius + 14) {
      p.alive = false;
      return p.type;
    }
  }
  return null;
}

export function updatePowerups() {
  powerups = powerups.filter(p => p.alive);
}

export function drawPowerups(ctx: CanvasRenderingContext2D) {
  const now = performance.now();
  for (const p of powerups) {
    if (!p.alive) continue;
    const bob = Math.sin((now - p.spawnTime) / 500) * 4;
    const py = p.y + bob;

    ctx.save();
    ctx.translate(p.x, py);

    // Glow
    ctx.shadowColor = p.type === "ship" ? "rgba(217, 54, 54, 0.7)" : "rgba(90, 170, 153, 0.7)";
    ctx.shadowBlur = 18;

    if (p.type === "ship") {
      // Extra life — small red triangle
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(-7, -6);
      ctx.lineTo(-7, 6);
      ctx.closePath();
      ctx.fillStyle = "#D93636";
      ctx.fill();
      ctx.strokeStyle = "#ff8888";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // "+" symbol
      ctx.fillStyle = "#fff";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      ctx.fillText("+", 0, -12);
    } else {
      // Repair — green wrench/cross
      ctx.fillStyle = "#5a9";
      ctx.fillRect(-8, -3, 16, 6);
      ctx.fillRect(-3, -8, 6, 16);
      ctx.strokeStyle = "#8fd4b8";
      ctx.lineWidth = 1;
      ctx.strokeRect(-8, -3, 16, 6);
      ctx.strokeRect(-3, -8, 6, 16);
    }

    ctx.restore();
  }
}

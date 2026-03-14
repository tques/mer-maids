// Powerup system: health kits and boat repair spawn under the boat based on score thresholds

import { getWaterSurfaceY } from "./water";

export type PowerupType = "health" | "repair";

export interface Powerup {
  x: number;
  y: number;
  type: PowerupType;
  spawnTime: number;
  alive: boolean;
}

let powerups: Powerup[] = [];
let nextHealthReward = 1500;
let nextRepairReward = 1200;

export function resetPowerups() {
  powerups = [];
  nextHealthReward = 1500;
  nextRepairReward = 1200;
}

export function getPowerups() { return powerups; }

export function checkScoreRewards(score: number, boatX: number, boatWidth: number, viewH: number) {
  const surfaceY = getWaterSurfaceY(viewH);
  const baseY = surfaceY + 60; // spawn further below the ship

  if (score >= nextHealthReward) {
    const spawnX = boatX + (Math.random() - 0.5) * boatWidth * 0.6;
    powerups.push({
      x: spawnX,
      y: baseY + 20 + Math.random() * 40,
      type: "health",
      spawnTime: performance.now(),
      alive: true,
    });
    nextHealthReward += 1000 + Math.floor(nextHealthReward * 0.4);
  }

  if (score >= nextRepairReward) {
    const spawnX = boatX + (Math.random() - 0.5) * boatWidth * 0.6;
    powerups.push({
      x: spawnX,
      y: baseY + 20 + Math.random() * 40,
      type: "repair",
      spawnTime: performance.now(),
      alive: true,
    });
    nextRepairReward += 800 + Math.floor(nextRepairReward * 0.35);
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
    ctx.shadowColor = p.type === "health" ? "rgba(217, 54, 54, 0.7)" : "rgba(90, 170, 153, 0.7)";
    ctx.shadowBlur = 18;

    if (p.type === "health") {
      // Health kit — red cross
      ctx.fillStyle = "#D93636";
      ctx.fillRect(-8, -3, 16, 6);
      ctx.fillRect(-3, -8, 6, 16);
      ctx.strokeStyle = "#ff8888";
      ctx.lineWidth = 1;
      ctx.strokeRect(-8, -3, 16, 6);
      ctx.strokeRect(-3, -8, 6, 16);
    } else {
      // Repair — green cross
      ctx.fillStyle = "#5a9";
      ctx.fillRect(-8, -3, 16, 6);
      ctx.fillRect(-3, -8, 6, 16);
      ctx.strokeStyle = "#8fd4b8";
      ctx.lineWidth = 1;
      ctx.strokeRect(-8, -3, 16, 6);
      ctx.strokeRect(-3, -8, 6, 16);
    }

    // Label above
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff";
    ctx.font = "bold 8px monospace";
    ctx.textAlign = "center";
    ctx.fillText(p.type === "health" ? "HP" : "Barrier", 0, -14);

    ctx.restore();
  }
}

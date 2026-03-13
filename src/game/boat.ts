// Abstract floating city with dome barrier — sits on the water

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
    hullDepth: 36,
  };
}

/** Returns the top-Y of the city platform at the center for collision purposes */
export function getBoatTopY(boat: Boat, viewH: number): number {
  const surfaceY = getWaterSurfaceY(viewH);
  const waveY = getWaveY(boat.x, surfaceY);
  return waveY - 10;
}

export function drawBoat(ctx: CanvasRenderingContext2D, boat: Boat, viewH: number, hpRatio: number = 1, barrierUp: boolean = true) {
  const surfaceY = getWaterSurfaceY(viewH);
  const waveY = getWaveY(boat.x, surfaceY);
  const topY = waveY - 10;

  const hw = boat.width / 2;
  const hd = boat.hullDepth;

  ctx.save();

  // Underwater shadow / reflection
  ctx.beginPath();
  ctx.ellipse(boat.x, topY + hd + 8, hw * 0.7, 16, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(10, 20, 40, 0.3)";
  ctx.fill();

  // Floating platform base — rounded rectangle
  ctx.beginPath();
  const baseR = 20;
  ctx.moveTo(boat.x - hw + baseR, topY + hd);
  ctx.lineTo(boat.x + hw - baseR, topY + hd);
  ctx.quadraticCurveTo(boat.x + hw, topY + hd, boat.x + hw, topY + hd - baseR);
  ctx.lineTo(boat.x + hw, topY + 4);
  ctx.quadraticCurveTo(boat.x + hw, topY, boat.x + hw - baseR, topY);
  ctx.lineTo(boat.x - hw + baseR, topY);
  ctx.quadraticCurveTo(boat.x - hw, topY, boat.x - hw, topY + 4);
  ctx.lineTo(boat.x - hw, topY + hd - baseR);
  ctx.quadraticCurveTo(boat.x - hw, topY + hd, boat.x - hw + baseR, topY + hd);
  ctx.closePath();
  ctx.fillStyle = "#1a1f2e";
  ctx.fill();

  // Platform surface — top deck
  ctx.beginPath();
  ctx.moveTo(boat.x - hw + baseR, topY);
  ctx.lineTo(boat.x + hw - baseR, topY);
  ctx.quadraticCurveTo(boat.x + hw, topY, boat.x + hw - 5, topY + 5);
  ctx.lineTo(boat.x - hw + 5, topY + 5);
  ctx.quadraticCurveTo(boat.x - hw, topY, boat.x - hw + baseR, topY);
  ctx.closePath();
  ctx.fillStyle = "#252b3a";
  ctx.fill();

  // Barrier lines on platform
  ctx.strokeStyle = "#3a4560";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    const ly = topY + (hd * i) / 4;
    const shrink = i * 6;
    ctx.beginPath();
    ctx.moveTo(boat.x - hw + 10 + shrink, ly);
    ctx.lineTo(boat.x + hw - 10 - shrink, ly);
    ctx.stroke();
  }

  // --- City buildings (abstract rectangles/towers) ---
  const buildings = [
    { ox: -180, w: 28, h: 40 },
    { ox: -130, w: 22, h: 55 },
    { ox: -90, w: 30, h: 35 },
    { ox: -40, w: 20, h: 65 },
    { ox: 0, w: 35, h: 80 },    // central tallest
    { ox: 50, w: 24, h: 50 },
    { ox: 100, w: 28, h: 45 },
    { ox: 140, w: 20, h: 38 },
    { ox: 190, w: 26, h: 30 },
    { ox: -220, w: 18, h: 25 },
    { ox: 230, w: 18, h: 22 },
  ];

  // Damage state affects building lights and dome
  const damaged = hpRatio < 1;
  const critical = hpRatio <= 0.3;
  const exposed = !barrierUp;
  const now = performance.now();
  const flickerRate = critical ? 80 : (exposed ? 120 : 200);
  const flickering = (damaged || exposed) && Math.sin(now / flickerRate) > 0;

  for (const b of buildings) {
    const bx = boat.x + b.ox;
    const by = topY - b.h;
    ctx.fillStyle = exposed ? (critical ? "#0e0808" : "#121418") : (damaged ? (critical ? "#151020" : "#1a2030") : "#1e2538");
    ctx.fillRect(bx - b.w / 2, by, b.w, b.h);
    ctx.fillStyle = exposed ? "#1a1a20" : (damaged ? "#1e2540" : "#2a3350");
    ctx.fillRect(bx - b.w / 2, by, 3, b.h);

    if (exposed) {
      ctx.fillStyle = "rgba(60, 30, 10, 0.3)";
      const scarCount = Math.ceil((1 - hpRatio) * 3);
      for (let si = 0; si < scarCount; si++) {
        const sy = by + (b.h * (si + 1)) / (scarCount + 1);
        ctx.fillRect(bx - b.w / 2, sy - 1, b.w, 2);
      }
    }

    const lightChance = exposed ? 0.9 : (critical ? 0.85 : (damaged ? 0.55 : 0.3));
    const lightColor = exposed
      ? (flickering ? "#cc4400" : "#220800")
      : (critical
        ? (flickering ? "#aa3030" : "#331818")
        : (damaged ? "#4a6a8a" : "#6a8aaa"));
    ctx.fillStyle = lightColor;
    for (let wy = by + 6; wy < topY - 4; wy += 8) {
      for (let wx = bx - b.w / 2 + 6; wx < bx + b.w / 2 - 3; wx += 6) {
        if (Math.random() > lightChance) {
          ctx.fillRect(wx, wy, 2, 2);
        }
      }
    }
  }

  // Smoke/fire when barrier is down
  if (exposed) {
    ctx.globalAlpha = 0.3 + Math.sin(now / 200) * 0.1;
    for (let i = 0; i < 5; i++) {
      const smokeX = boat.x + Math.sin(now / 800 + i * 1.3) * hw * 0.5;
      const smokeY = topY - 20 - (now / 50 + i * 30) % 60;
      const smokeR = 6 + Math.sin(now / 300 + i) * 3;
      ctx.beginPath();
      ctx.arc(smokeX, smokeY, smokeR, 0, Math.PI * 2);
      ctx.fillStyle = critical ? "rgba(200, 60, 20, 0.3)" : "rgba(80, 80, 80, 0.25)";
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  if (barrierUp) {
    // --- Dome barrier ---
    const domeRadius = hw * 0.85;
    const domeCenterY = topY;

    const domeR = Math.round(40 + (1 - hpRatio) * 180);
    const domeG = Math.round(120 + hpRatio * 80 - (1 - hpRatio) * 80);
    const domeB = Math.round(200 * hpRatio + 40);
    const domeAlphaBase = 0.12 + (1 - hpRatio) * 0.15;

    const domeGrad = ctx.createRadialGradient(
      boat.x, domeCenterY, domeRadius * 0.3,
      boat.x, domeCenterY, domeRadius
    );
    domeGrad.addColorStop(0, `rgba(${domeR}, ${domeG}, ${domeB}, 0.02)`);
    domeGrad.addColorStop(0.7, `rgba(${domeR}, ${domeG}, ${domeB}, ${domeAlphaBase * 0.5})`);
    domeGrad.addColorStop(1, `rgba(${domeR}, ${domeG}, ${domeB}, ${domeAlphaBase})`);

    ctx.beginPath();
    ctx.arc(boat.x, domeCenterY, domeRadius, Math.PI, 0);
    ctx.closePath();
    ctx.fillStyle = domeGrad;
    ctx.fill();

    const outlineAlpha = critical ? (flickering ? 0.6 : 0.15) : (0.25 + (1 - hpRatio) * 0.2);
    ctx.beginPath();
    ctx.arc(boat.x, domeCenterY, domeRadius, Math.PI, 0);
    ctx.strokeStyle = `rgba(${domeR + 60}, ${Math.min(domeG + 40, 255)}, ${Math.min(domeB + 55, 255)}, ${outlineAlpha})`;
    ctx.lineWidth = damaged ? 3 : 2;
    ctx.stroke();

    if (!critical || flickering) {
      ctx.beginPath();
      ctx.arc(boat.x, domeCenterY, domeRadius * 0.92, Math.PI * 0.95, Math.PI * 0.05);
      ctx.strokeStyle = `rgba(${domeR + 80}, ${Math.min(domeG + 60, 255)}, ${Math.min(domeB + 55, 255)}, 0.15)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    if (damaged) {
      const crackCount = Math.ceil((1 - hpRatio) * 8);
      ctx.strokeStyle = critical
        ? `rgba(255, 80, 40, ${0.3 + Math.sin(now / 150) * 0.15})`
        : `rgba(200, 220, 255, ${0.15 + (1 - hpRatio) * 0.15})`;
      ctx.lineWidth = critical ? 2 : 1;
      for (let i = 0; i < crackCount; i++) {
        const baseAngle = Math.PI + (i * 0.9 + 0.4);
        const r1 = domeRadius * (0.5 + (i % 3) * 0.15);
        const r2 = domeRadius * (0.7 + (i % 2) * 0.2);
        const cx1 = boat.x + Math.cos(baseAngle) * r1;
        const cy1 = domeCenterY + Math.sin(baseAngle) * r1;
        const cx2 = boat.x + Math.cos(baseAngle + 0.08) * r2;
        const cy2 = domeCenterY + Math.sin(baseAngle + 0.08) * r2;
        const midR = (r1 + r2) / 2;
        const cmx = boat.x + Math.cos(baseAngle + 0.15) * midR;
        const cmy = domeCenterY + Math.sin(baseAngle - 0.05) * midR;
        if (cy1 < domeCenterY && cy2 < domeCenterY) {
          ctx.beginPath();
          ctx.moveTo(cx1, cy1);
          ctx.quadraticCurveTo(cmx, cmy, cx2, cy2);
          ctx.stroke();
        }
      }
    }

    const hexAlpha = Math.max(0.02, 0.08 * hpRatio);
    ctx.strokeStyle = `rgba(${domeR}, ${Math.min(domeG + 40, 255)}, ${Math.min(domeB + 40, 255)}, ${hexAlpha})`;
    ctx.lineWidth = 0.5;
    for (let a = Math.PI; a < Math.PI * 2; a += 0.12) {
      for (let r = domeRadius * 0.3; r < domeRadius * 0.95; r += 35) {
        const hx = boat.x + Math.cos(a) * r;
        const hy = domeCenterY + Math.sin(a) * r;
        if (hy < domeCenterY) {
          ctx.beginPath();
          ctx.arc(hx, hy, 8, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
  } else {
    // Barrier DOWN — broken dome remnants
    const domeRadius = hw * 0.85;
    const domeCenterY = topY;

    ctx.beginPath();
    ctx.arc(boat.x, domeCenterY, domeRadius, Math.PI, 0);
    ctx.setLineDash([8, 12]);
    ctx.strokeStyle = "rgba(255, 80, 40, 0.15)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);

    for (let i = 0; i < 6; i++) {
      const fx = boat.x - hw * 0.7 + (i * hw * 0.28);
      const fy = topY - 2 + Math.sin(i * 2.1) * 3;
      ctx.beginPath();
      ctx.arc(fx, fy, 4 + (i % 3), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(100, 160, 200, 0.15)";
      ctx.fill();
    }
  }

  // Waterline highlight
  ctx.beginPath();
  ctx.moveTo(boat.x - hw + 10, topY + hd);
  ctx.lineTo(boat.x + hw - 10, topY + hd);
  ctx.strokeStyle = "rgba(100, 160, 200, 0.2)";
  ctx.lineWidth = 2;
  ctx.stroke();


  ctx.restore();
}

/** Check if a point collides with the city platform and return push-out vector */
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

  // Check if inside the platform rectangle (simplified)
  const inX = px > boat.x - hw + 10 && px < boat.x + hw - 10;
  const inY = py > topY - radius && py < topY + hd + radius;

  if (inX && inY) {
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

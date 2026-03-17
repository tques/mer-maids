/**
 * boat.ts — Floating City (the thing you're defending!)
 * 
 * The "boat" is actually a floating city platform with:
 * - A dark metallic base that sits on the wave surface
 * - Abstract city buildings with window lights
 * - A dome energy barrier that protects the city
 * - Visual damage states: cracks, smoke, flickering lights
 * 
 * The city is the primary defense objective. If its HP reaches 0, the game ends.
 * The dome barrier absorbs bomb hits; when barrier HP drops to ≤3, it breaks
 * and bombs hit the city directly.
 */

import { getWaveY, getWaterSurfaceY } from "./water";

// ==================== INTERFACE ====================

/** The city platform entity */
export interface Boat {
  x: number;       // World X position (center of the city)
  width: number;   // Total width of the platform in pixels
  hullDepth: number; // How deep the platform extends below the surface
}

// ==================== INITIALIZATION ====================

/**
 * Creates the city at the center of the world.
 * Called once on game start and on window resize.
 * 
 * @param worldWidth - Total world width (city spawns at center)
 * @returns A new Boat/city object
 */
export function createBoat(worldWidth: number): Boat {
  return {
    x: worldWidth / 2,
    width: 700,
    hullDepth: 36,
  };
}

// ==================== POSITION HELPERS ====================

/**
 * Returns the top-Y of the city platform at its center.
 * The city bobs up and down with the waves.
 * Used for collision detection and enemy targeting.
 * 
 * @param boat - The city object
 * @param viewH - Logical view height
 * @returns Y coordinate of the platform top
 */
export function getBoatTopY(boat: Boat, viewH: number): number {
  const surfaceY = getWaterSurfaceY(viewH);
  const waveY = getWaveY(boat.x, surfaceY);
  return waveY - 22;  // Platform sits 22px above the wave line (floats visibly)
}

// ==================== RENDERING ====================

/**
 * Draws the complete floating city with all visual details.
 * This is a complex function with multiple visual layers:
 * 
 * 1. Underwater shadow/reflection
 * 2. Platform base (dark rounded rectangle)
 * 3. Platform surface highlight
 * 4. Horizontal barrier lines on the hull
 * 5. City buildings with illuminated windows
 * 6. Damage effects (flickering lights, scars, smoke)
 * 7. Dome barrier (when active) with hexagonal pattern and cracks
 * 8. Broken dome remnants (when barrier is down)
 * 9. Waterline highlight
 * 
 * @param ctx - Canvas rendering context
 * @param boat - The city object
 * @param viewH - Logical view height
 * @param hpRatio - City HP as 0-1 ratio (affects visual damage)
 * @param barrierUp - Whether the dome barrier is still active
 */
export function drawBoat(ctx: CanvasRenderingContext2D, boat: Boat, viewH: number, hpRatio: number = 1, barrierUp: boolean = true) {
  const surfaceY = getWaterSurfaceY(viewH);
  const waveY = getWaveY(boat.x, surfaceY);
  const topY = waveY - 22;

  const hw = boat.width / 2;   // Half width for centering
  const hd = boat.hullDepth;

  ctx.save();

  // (shadow removed)

  // --- Platform base — glassy translucent aqua ---
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
  const baseGrad = ctx.createLinearGradient(boat.x, topY, boat.x, topY + hd);
  baseGrad.addColorStop(0, "rgba(20, 60, 80, 0.9)");
  baseGrad.addColorStop(0.5, "rgba(10, 40, 60, 0.95)");
  baseGrad.addColorStop(1, "rgba(5, 25, 45, 0.95)");
  ctx.fillStyle = baseGrad;
  ctx.fill();

  // --- Platform surface — glossy highlight ---
  ctx.beginPath();
  ctx.moveTo(boat.x - hw + baseR, topY);
  ctx.lineTo(boat.x + hw - baseR, topY);
  ctx.quadraticCurveTo(boat.x + hw, topY, boat.x + hw - 5, topY + 5);
  ctx.lineTo(boat.x - hw + 5, topY + 5);
  ctx.quadraticCurveTo(boat.x - hw, topY, boat.x - hw + baseR, topY);
  ctx.closePath();
  ctx.fillStyle = "rgba(100, 220, 210, 0.25)";
  ctx.fill();

  // --- Horizontal lines on the hull (aqua accent) ---
  ctx.strokeStyle = "rgba(80, 200, 190, 0.15)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    const ly = topY + (hd * i) / 4;
    const shrink = i * 6;
    ctx.beginPath();
    ctx.moveTo(boat.x - hw + 10 + shrink, ly);
    ctx.lineTo(boat.x + hw - 10 - shrink, ly);
    ctx.stroke();
  }

  // --- City buildings (abstract rectangles/towers on top of the platform) ---
  // Each building is defined by: ox (offset from center), w (width), h (height)
  // style: 'rect' | 'dome' | 'spire' | 'stepped' | 'cylinder'
  type BldStyle = 'rect' | 'dome' | 'spire' | 'stepped' | 'cylinder';
  type BldDef = { ox: number; w: number; h: number; s: BldStyle };

  const backBuildings: BldDef[] = [
    { ox: -260, w: 30, h: 28, s: 'rect' },
    { ox: -230, w: 24, h: 35, s: 'dome' },
    { ox: -195, w: 28, h: 32, s: 'cylinder' },
    { ox: -160, w: 22, h: 42, s: 'spire' },
    { ox: -125, w: 26, h: 38, s: 'stepped' },
    { ox: -95, w: 20, h: 48, s: 'dome' },
    { ox: -65, w: 24, h: 44, s: 'rect' },
    { ox: -35, w: 22, h: 55, s: 'spire' },
    { ox: -10, w: 28, h: 60, s: 'cylinder' },
    { ox: 20, w: 24, h: 52, s: 'stepped' },
    { ox: 50, w: 20, h: 46, s: 'dome' },
    { ox: 75, w: 26, h: 40, s: 'rect' },
    { ox: 105, w: 22, h: 50, s: 'spire' },
    { ox: 130, w: 28, h: 36, s: 'dome' },
    { ox: 160, w: 24, h: 42, s: 'cylinder' },
    { ox: 190, w: 20, h: 34, s: 'stepped' },
    { ox: 220, w: 26, h: 30, s: 'rect' },
    { ox: 250, w: 22, h: 26, s: 'dome' },
  ];

  const buildings: BldDef[] = [
    { ox: -280, w: 22, h: 22, s: 'dome' },
    { ox: -258, w: 26, h: 30, s: 'stepped' },
    { ox: -232, w: 20, h: 38, s: 'spire' },
    { ox: -210, w: 28, h: 32, s: 'cylinder' },
    { ox: -182, w: 24, h: 45, s: 'rect' },
    { ox: -155, w: 30, h: 50, s: 'dome' },
    { ox: -125, w: 22, h: 58, s: 'spire' },
    { ox: -100, w: 26, h: 48, s: 'stepped' },
    { ox: -74, w: 20, h: 62, s: 'cylinder' },
    { ox: -50, w: 28, h: 70, s: 'dome' },
    { ox: -22, w: 24, h: 78, s: 'rect' },
    { ox: 5, w: 36, h: 90, s: 'spire' },
    { ox: 35, w: 24, h: 75, s: 'stepped' },
    { ox: 60, w: 28, h: 65, s: 'dome' },
    { ox: 88, w: 22, h: 55, s: 'cylinder' },
    { ox: 112, w: 26, h: 60, s: 'rect' },
    { ox: 140, w: 24, h: 48, s: 'spire' },
    { ox: 165, w: 20, h: 52, s: 'dome' },
    { ox: 188, w: 28, h: 42, s: 'stepped' },
    { ox: 215, w: 22, h: 35, s: 'cylinder' },
    { ox: 240, w: 26, h: 28, s: 'rect' },
    { ox: 265, w: 20, h: 24, s: 'dome' },
  ];

  // --- Shape helper: traces diverse building outlines ---
  function traceBldShape(bx: number, by: number, w: number, h: number, s: BldStyle) {
    const hw2 = w / 2;
    ctx.beginPath();
    switch (s) {
      case 'dome':
        ctx.moveTo(bx - hw2, by + h);
        ctx.lineTo(bx - hw2, by + 10);
        ctx.arc(bx, by + 10, hw2, Math.PI, 0);
        ctx.lineTo(bx + hw2, by + h);
        ctx.closePath();
        break;
      case 'spire':
        ctx.moveTo(bx - hw2, by + h);
        ctx.lineTo(bx - hw2, by + 14);
        ctx.lineTo(bx - hw2 * 0.35, by + 10);
        ctx.lineTo(bx, by);
        ctx.lineTo(bx + hw2 * 0.35, by + 10);
        ctx.lineTo(bx + hw2, by + 14);
        ctx.lineTo(bx + hw2, by + h);
        ctx.closePath();
        break;
      case 'stepped':
        ctx.moveTo(bx - hw2, by + h);
        ctx.lineTo(bx - hw2, by + h * 0.55);
        ctx.lineTo(bx - hw2 * 0.6, by + h * 0.55);
        ctx.lineTo(bx - hw2 * 0.6, by + h * 0.28);
        ctx.lineTo(bx - hw2 * 0.25, by + h * 0.28);
        ctx.lineTo(bx - hw2 * 0.25, by);
        ctx.lineTo(bx + hw2 * 0.25, by);
        ctx.lineTo(bx + hw2 * 0.25, by + h * 0.28);
        ctx.lineTo(bx + hw2 * 0.6, by + h * 0.28);
        ctx.lineTo(bx + hw2 * 0.6, by + h * 0.55);
        ctx.lineTo(bx + hw2, by + h * 0.55);
        ctx.lineTo(bx + hw2, by + h);
        ctx.closePath();
        break;
      case 'cylinder':
        ctx.moveTo(bx - hw2, by + h);
        ctx.lineTo(bx - hw2, by + 7);
        ctx.ellipse(bx, by + 7, hw2, 7, 0, Math.PI, 0);
        ctx.lineTo(bx + hw2, by + h);
        ctx.closePath();
        break;
      default: // 'rect'
        ctx.rect(bx - hw2, by, w, h);
        break;
    }
  }

  // --- Damage state calculations ---
  const damaged = hpRatio < 1;
  const critical = hpRatio <= 0.3;
  const exposed = !barrierUp;
  const now = performance.now();
  const flickerRate = critical ? 80 : (exposed ? 120 : 200);
  const flickering = (damaged || exposed) && Math.sin(now / flickerRate) > 0;

  // --- Draw back-layer buildings (darker, recessed for depth) ---
  for (const b of backBuildings) {
    const bx = boat.x + b.ox;
    const by = topY - b.h + 4;
    const bldGrad = ctx.createLinearGradient(bx - b.w / 2, by, bx + b.w / 2, by + b.h);
    if (exposed) {
      bldGrad.addColorStop(0, critical ? "rgba(20, 8, 8, 0.7)" : "rgba(10, 18, 28, 0.7)");
      bldGrad.addColorStop(1, critical ? "rgba(15, 4, 4, 0.75)" : "rgba(8, 14, 22, 0.75)");
    } else {
      bldGrad.addColorStop(0, "rgba(18, 45, 60, 0.6)");
      bldGrad.addColorStop(1, "rgba(10, 30, 45, 0.7)");
    }
    traceBldShape(bx, by, b.w, b.h - 4, b.s);
    ctx.fillStyle = bldGrad;
    ctx.fill();
    // Dim window lights — clipped to building shape
    ctx.save();
    traceBldShape(bx, by, b.w, b.h - 4, b.s);
    ctx.clip();
    ctx.fillStyle = exposed ? "rgba(120, 40, 10, 0.3)" : "rgba(60, 160, 140, 0.25)";
    for (let wy = by + 5; wy < topY - 2; wy += 7) {
      for (let wx = bx - b.w / 2 + 4; wx < bx + b.w / 2 - 2; wx += 5) {
        if (Math.random() > 0.5) ctx.fillRect(wx, wy, 2, 2);
      }
    }
    ctx.restore();
  }

  // --- Draw front-layer buildings (futuristic glass towers) ---
  for (const b of buildings) {
    const bx = boat.x + b.ox;
    const by = topY - b.h;

    // Building body — glassy gradient
    const bldGrad = ctx.createLinearGradient(bx - b.w / 2, by, bx + b.w / 2, by + b.h);
    if (exposed) {
      bldGrad.addColorStop(0, critical ? "rgba(30, 10, 10, 0.9)" : "rgba(15, 25, 35, 0.9)");
      bldGrad.addColorStop(1, critical ? "rgba(20, 5, 5, 0.95)" : "rgba(10, 18, 28, 0.95)");
    } else {
      bldGrad.addColorStop(0, "rgba(30, 70, 90, 0.8)");
      bldGrad.addColorStop(0.5, "rgba(20, 50, 70, 0.85)");
      bldGrad.addColorStop(1, "rgba(15, 35, 55, 0.9)");
    }
    traceBldShape(bx, by, b.w, b.h, b.s);
    ctx.fillStyle = bldGrad;
    ctx.fill();

    // Glass reflection highlight (left edge)
    ctx.fillStyle = exposed ? "rgba(40, 60, 80, 0.3)" : "rgba(120, 220, 210, 0.15)";
    ctx.fillRect(bx - b.w / 2, by + (b.s === 'spire' ? 14 : b.s === 'dome' || b.s === 'cylinder' ? 10 : 0), 3, b.h - (b.s === 'spire' ? 14 : b.s === 'dome' || b.s === 'cylinder' ? 10 : 0));

    // Top accent (antenna for spire, ring for dome/cylinder, line for rect/stepped)
    if (b.s === 'spire') {
      ctx.strokeStyle = exposed ? "rgba(255, 80, 40, 0.4)" : "rgba(120, 240, 220, 0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx, by - 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(bx, by - 6, 2, 0, Math.PI * 2);
      ctx.fillStyle = exposed ? "rgba(255, 60, 30, 0.6)" : "rgba(80, 255, 220, 0.5)";
      ctx.fill();
    } else if (b.s === 'dome' || b.s === 'cylinder') {
      ctx.strokeStyle = exposed ? "rgba(200, 60, 30, 0.2)" : "rgba(100, 200, 190, 0.2)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (b.s === 'dome') ctx.arc(bx, by + 10, b.w / 2, Math.PI, 0);
      else ctx.ellipse(bx, by + 7, b.w / 2, 7, 0, Math.PI, 0);
      ctx.stroke();
    } else {
      ctx.fillStyle = exposed ? "rgba(60, 40, 30, 0.3)" : "rgba(150, 240, 230, 0.12)";
      ctx.fillRect(bx - b.w / 2, by, b.w, 2);
    }

    // Damage scars
    if (exposed) {
      ctx.fillStyle = "rgba(60, 30, 10, 0.3)";
      const scarCount = Math.ceil((1 - hpRatio) * 3);
      for (let si = 0; si < scarCount; si++) {
        const sy = by + (b.h * (si + 1)) / (scarCount + 1);
        ctx.fillRect(bx - b.w / 2, sy - 1, b.w, 2);
      }
    }

    // Window lights
    const lightChance = exposed ? 0.9 : (critical ? 0.85 : (damaged ? 0.55 : 0.3));
    const lightColor = exposed
      ? (flickering ? "#cc4400" : "#220800")
      : (critical
        ? (flickering ? "#aa3030" : "#331818")
        : (damaged ? "#4ab8c0" : "#80e8d8"));

    ctx.fillStyle = lightColor;
    const winStartY = by + (b.s === 'spire' ? 16 : b.s === 'dome' || b.s === 'cylinder' ? 12 : 6);
    for (let wy = winStartY; wy < topY - 4; wy += 8) {
      for (let wx = bx - b.w / 2 + 6; wx < bx + b.w / 2 - 3; wx += 6) {
        if (Math.random() > lightChance) {
          ctx.fillRect(wx, wy, 2, 2);
        }
      }
    }
  }

  // --- Smoke/fire particles when barrier is down ---
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

  // ==================== DOME BARRIER ====================
  if (barrierUp) {
    const domeRadius = hw * 0.85;  // Slightly smaller than platform width
    const domeCenterY = topY;      // Dome base at platform top

    // Dome color — aqua/teal shifting to red when damaged
    const domeR = Math.round(30 + (1 - hpRatio) * 200);
    const domeG = Math.round(200 * hpRatio + 40);
    const domeB = Math.round(220 * hpRatio + 30);
    const domeAlphaBase = 0.10 + (1 - hpRatio) * 0.15;

    // Radial gradient — glassy transparent center, visible edges
    const domeGrad = ctx.createRadialGradient(
      boat.x, domeCenterY, domeRadius * 0.3,
      boat.x, domeCenterY, domeRadius
    );
    domeGrad.addColorStop(0, `rgba(${domeR}, ${domeG}, ${domeB}, 0.01)`);
    domeGrad.addColorStop(0.6, `rgba(${domeR}, ${domeG}, ${domeB}, ${domeAlphaBase * 0.4})`);
    domeGrad.addColorStop(0.85, `rgba(${domeR}, ${domeG}, ${domeB}, ${domeAlphaBase * 0.7})`);
    domeGrad.addColorStop(1, `rgba(${domeR}, ${domeG}, ${domeB}, ${domeAlphaBase})`);

    // Specular highlight on dome
    const specGrad = ctx.createRadialGradient(
      boat.x - domeRadius * 0.3, domeCenterY - domeRadius * 0.5, 0,
      boat.x - domeRadius * 0.3, domeCenterY - domeRadius * 0.5, domeRadius * 0.4
    );
    specGrad.addColorStop(0, "rgba(255, 255, 255, 0.08)");
    specGrad.addColorStop(1, "rgba(255, 255, 255, 0)");

    // Draw dome as upper half of circle
    ctx.beginPath();
    ctx.arc(boat.x, domeCenterY, domeRadius, Math.PI, 0);  // Upper semicircle
    ctx.closePath();
    ctx.fillStyle = domeGrad;
    ctx.fill();

    // Draw specular highlight
    ctx.beginPath();
    ctx.arc(boat.x, domeCenterY, domeRadius, Math.PI, 0);
    ctx.closePath();
    ctx.fillStyle = specGrad;
    ctx.fill();
    ctx.fill();

    // Dome outline — gets brighter when damaged
    const outlineAlpha = critical ? (flickering ? 0.6 : 0.15) : (0.25 + (1 - hpRatio) * 0.2);
    ctx.beginPath();
    ctx.arc(boat.x, domeCenterY, domeRadius, Math.PI, 0);
    ctx.strokeStyle = `rgba(${domeR + 60}, ${Math.min(domeG + 40, 255)}, ${Math.min(domeB + 55, 255)}, ${outlineAlpha})`;
    ctx.lineWidth = damaged ? 3 : 2;
    ctx.stroke();

    // Inner ring highlight
    if (!critical || flickering) {
      ctx.beginPath();
      ctx.arc(boat.x, domeCenterY, domeRadius * 0.92, Math.PI * 0.95, Math.PI * 0.05);
      ctx.strokeStyle = `rgba(${domeR + 80}, ${Math.min(domeG + 60, 255)}, ${Math.min(domeB + 55, 255)}, 0.15)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // --- Cracks in the dome (appear when damaged) ---
    if (damaged) {
      const crackCount = Math.ceil((1 - hpRatio) * 8);  // More cracks = more damage
      ctx.strokeStyle = critical
        ? `rgba(255, 80, 40, ${0.3 + Math.sin(now / 150) * 0.15})`  // Pulsing red cracks
        : `rgba(200, 220, 255, ${0.15 + (1 - hpRatio) * 0.15})`;    // White stress fractures
      ctx.lineWidth = critical ? 2 : 1;
      
      for (let i = 0; i < crackCount; i++) {
        // Each crack is a curved line on the dome surface
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
        if (cy1 < domeCenterY && cy2 < domeCenterY) {  // Only draw above the base
          ctx.beginPath();
          ctx.moveTo(cx1, cy1);
          ctx.quadraticCurveTo(cmx, cmy, cx2, cy2);
          ctx.stroke();
        }
      }
    }

    // --- Hexagonal grid pattern on the dome ---
    const hexAlpha = Math.max(0.02, 0.08 * hpRatio);
    ctx.strokeStyle = `rgba(${domeR}, ${Math.min(domeG + 40, 255)}, ${Math.min(domeB + 40, 255)}, ${hexAlpha})`;
    ctx.lineWidth = 0.5;
    for (let a = Math.PI; a < Math.PI * 2; a += 0.12) {
      for (let r = domeRadius * 0.3; r < domeRadius * 0.95; r += 35) {
        const hx = boat.x + Math.cos(a) * r;
        const hy = domeCenterY + Math.sin(a) * r;
        if (hy < domeCenterY) {  // Only above base
          ctx.beginPath();
          ctx.arc(hx, hy, 8, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
  } else {
    // ==================== BROKEN DOME (barrier down) ====================
    const domeRadius = hw * 0.85;
    const domeCenterY = topY;

    // Dashed outline where the dome used to be
    ctx.beginPath();
    ctx.arc(boat.x, domeCenterY, domeRadius, Math.PI, 0);
    ctx.setLineDash([8, 12]);
    ctx.strokeStyle = "rgba(255, 80, 40, 0.15)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);  // Reset dash pattern

    // Floating energy fragments along the base
    for (let i = 0; i < 6; i++) {
      const fx = boat.x - hw * 0.7 + (i * hw * 0.28);
      const fy = topY - 2 + Math.sin(i * 2.1) * 3;
      ctx.beginPath();
      ctx.arc(fx, fy, 4 + (i % 3), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(100, 160, 200, 0.15)";
      ctx.fill();
    }
  }

  // --- Waterline highlight (where platform meets water) ---
  ctx.beginPath();
  ctx.moveTo(boat.x - hw + 10, topY + hd);
  ctx.lineTo(boat.x + hw - 10, topY + hd);
  ctx.strokeStyle = "rgba(100, 160, 200, 0.2)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}

// ==================== COLLISION ====================

/**
 * Checks if a point (the player) collides with the city platform.
 * Returns a push-out position to prevent the player from overlapping.
 * 
 * The player is bounced toward the nearest water edge and takes damage,
 * preventing them from resting on the city.
 * 
 * @param px - Player X position
 * @param py - Player Y position
 * @param radius - Player collision radius
 * @param boat - The city object
 * @param viewH - Logical view height
 * @returns Push-out position {x, y} or null if no collision
 */
export function collideWithBoat(
  px: number, py: number, radius: number,
  boat: Boat, viewH: number
): { x: number; y: number; damaging: boolean } | null {
  const topY = getBoatTopY(boat, viewH);
  const hw = boat.width / 2;
  const hd = boat.hullDepth;

  // Quick bounding box rejection
  if (px < boat.x - hw - radius || px > boat.x + hw + radius) return null;
  if (py < topY - radius - 40) return null;
  if (py > topY + hd + radius) return null;

  const inX = px > boat.x - hw + 10 && px < boat.x + hw - 10;

  // Surface collision (from above) — damaging
  if (inX && py > topY - radius && py < topY + 5) {
    return { x: px, y: topY - radius - 1, damaging: true };
  }

  // Underside collision (from below) — bounce only, no damage
  if (inX && py > topY + 5 && py < topY + hd + radius) {
    return { x: px, y: topY + hd + radius + 1, damaging: false };
  }

  return null;
}

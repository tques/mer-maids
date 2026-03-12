// Water system: rendering, splash particles, and physics

export const WATER_RATIO = 0.25;
export const WATER_SPEED_FACTOR = 0.40;
export const WAVE_AMPLITUDE = 6;
export const WAVE_FREQUENCY = 0.025;
export const WAVE_SPEED = 0.002;

export interface Splash {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  radius: number;
  color: string;
}

export interface Ripple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
}

let splashes: Splash[] = [];
let ripples: Ripple[] = [];
let waveTime = 0;

export function getWaterSurfaceY(canvasHeight: number): number {
  return canvasHeight * (1 - WATER_RATIO);
}

export function getWaveY(x: number, baseY: number): number {
  return baseY
    + Math.sin(x * WAVE_FREQUENCY + waveTime) * WAVE_AMPLITUDE
    + Math.sin(x * WAVE_FREQUENCY * 1.7 + waveTime * 1.3) * WAVE_AMPLITUDE * 0.5
    + Math.sin(x * WAVE_FREQUENCY * 0.6 + waveTime * 0.7) * WAVE_AMPLITUDE * 0.3;
}

export function isSubmerged(py: number, canvasHeight: number): boolean {
  const surfaceY = getWaterSurfaceY(canvasHeight);
  return py > surfaceY;
}

export function spawnSplash(x: number, y: number, vy: number, entering: boolean) {
  const count = entering ? 22 : 30;
  const baseSpeed = entering ? 4 : 7;
  const colors = [
    "rgba(140, 210, 255, 0.9)",
    "rgba(180, 230, 255, 0.85)",
    "rgba(100, 180, 240, 0.9)",
    "rgba(220, 240, 255, 0.95)",
    "rgba(60, 150, 220, 0.8)",
  ];
  for (let i = 0; i < count; i++) {
    const ang = entering
      ? -Math.PI * Math.random()
      : -Math.PI * (0.1 + Math.random() * 0.8);
    const speed = baseSpeed * (0.5 + Math.random());
    splashes.push({
      x: x + (Math.random() - 0.5) * 20,
      y,
      vx: Math.cos(ang) * speed + (Math.random() - 0.5) * 3,
      vy: Math.sin(ang) * speed * (entering ? 1 : 1.8),
      life: 1,
      maxLife: 0.5 + Math.random() * 0.4,
      radius: 2.5 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  }
  ripples.push({ x, y, radius: 4, maxRadius: 50 + Math.abs(vy) * 10, life: 1 });
  ripples.push({ x: x - 15, y, radius: 2, maxRadius: 30 + Math.abs(vy) * 5, life: 0.8 });
  ripples.push({ x: x + 15, y, radius: 2, maxRadius: 30 + Math.abs(vy) * 5, life: 0.8 });
}

export function updateParticles(dt: number) {
  waveTime += WAVE_SPEED * dt * 60;

  splashes = splashes.filter((s) => {
    s.x += s.vx;
    s.y += s.vy;
    s.vy += 0.12;
    s.vx *= 0.99;
    s.life -= dt / s.maxLife;
    return s.life > 0;
  });

  ripples = ripples.filter((r) => {
    r.life -= dt * 2.0;
    r.radius += (r.maxRadius - r.radius) * 0.06;
    return r.life > 0;
  });
}

/**
 * Draw water. When called with a camera-translated context, cw should be the
 * width of the drawable segment and ch the logical view height.
 * Accepts optional visibleX range to limit expensive wave rendering.
 */
export function drawWater(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  visibleStartX?: number,
  visibleEndX?: number,
) {
  const baseY = getWaterSurfaceY(ch);

  // Determine render range — only draw what's visible for performance
  const x0 = visibleStartX != null ? Math.max(0, Math.floor(visibleStartX) - 10) : 0;
  const x1 = visibleEndX != null ? Math.min(cw, Math.ceil(visibleEndX) + 10) : cw;

  // Wave surface path
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x0, ch);
  for (let x = x0; x <= x1; x += 3) {
    ctx.lineTo(x, getWaveY(x, baseY));
  }
  ctx.lineTo(x1, ch);
  ctx.closePath();

  // Deep ocean gradient
  const grad = ctx.createLinearGradient(0, baseY - 10, 0, ch);
  grad.addColorStop(0, "rgba(30, 110, 190, 0.50)");
  grad.addColorStop(0.1, "rgba(20, 90, 170, 0.58)");
  grad.addColorStop(0.3, "rgba(12, 65, 145, 0.68)");
  grad.addColorStop(0.6, "rgba(6, 42, 115, 0.78)");
  grad.addColorStop(1, "rgba(2, 18, 65, 0.88)");
  ctx.fillStyle = grad;
  ctx.fill();

  // Subsurface caustic light patches
  ctx.save();
  ctx.clip();
  ctx.globalAlpha = 0.07;
  const causticSpacing = 250;
  const causticCount = Math.ceil((x1 - x0) / causticSpacing) + 2;
  const causticStart = Math.floor(x0 / causticSpacing) * causticSpacing;
  for (let i = 0; i < causticCount; i++) {
    const cx = causticStart + i * causticSpacing + Math.sin(waveTime * 0.3 + i * 1.7) * 40;
    const cy = baseY + 25 + Math.sin(waveTime * 0.5 + i * 2.3) * 18;
    const cr = 50 + Math.sin(waveTime * 0.8 + i) * 15;
    const causticGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
    causticGrad.addColorStop(0, "rgba(120, 210, 255, 1)");
    causticGrad.addColorStop(0.6, "rgba(80, 180, 240, 0.4)");
    causticGrad.addColorStop(1, "rgba(80, 180, 240, 0)");
    ctx.fillStyle = causticGrad;
    ctx.fillRect(cx - cr, cy - cr, cr * 2, cr * 2);
  }
  ctx.restore();

  // Primary surface highlight
  ctx.beginPath();
  for (let x = x0; x <= x1; x += 3) {
    const wy = getWaveY(x, baseY);
    if (x === x0) ctx.moveTo(x, wy);
    else ctx.lineTo(x, wy);
  }
  ctx.strokeStyle = "rgba(190, 235, 255, 0.55)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Secondary deeper highlight
  ctx.beginPath();
  for (let x = x0; x <= x1; x += 4) {
    const wy = getWaveY(x, baseY) + 5;
    if (x === x0) ctx.moveTo(x, wy);
    else ctx.lineTo(x, wy);
  }
  ctx.strokeStyle = "rgba(80, 160, 230, 0.2)";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Tertiary deep shimmer
  ctx.beginPath();
  for (let x = x0; x <= x1; x += 5) {
    const wy = getWaveY(x, baseY) + 12;
    if (x === x0) ctx.moveTo(x, wy);
    else ctx.lineTo(x, wy);
  }
  ctx.strokeStyle = "rgba(60, 130, 200, 0.1)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Foam / white caps at wave peaks
  for (let x = x0; x <= x1; x += 6) {
    const wy = getWaveY(x, baseY);
    const slope = getWaveY(x + 3, baseY) - wy;
    if (slope < -0.6) {
      ctx.globalAlpha = Math.min(Math.abs(slope) * 0.35, 0.4);
      ctx.beginPath();
      ctx.arc(x, wy - 1, 2 + Math.abs(slope) * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(230, 245, 255, 0.8)";
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  ctx.restore();

  // Draw ripples
  for (const r of ripples) {
    if (r.x < x0 - r.maxRadius || r.x > x1 + r.maxRadius) continue;
    ctx.save();
    ctx.globalAlpha = r.life * 0.5;
    ctx.beginPath();
    ctx.ellipse(r.x, r.y, r.radius, r.radius * 0.25, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(180, 230, 255, 0.8)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(r.x, r.y, r.radius * 0.6, r.radius * 0.15, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(220, 240, 255, 0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  // Draw splash particles
  for (const s of splashes) {
    if (s.x < x0 - 10 || s.x > x1 + 10) continue;
    ctx.save();
    ctx.globalAlpha = s.life * 0.85;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius * (0.3 + s.life * 0.7), 0, Math.PI * 2);
    ctx.fillStyle = s.color;
    ctx.fill();
    if (s.radius > 3) {
      ctx.beginPath();
      ctx.arc(s.x - s.radius * 0.2, s.y - s.radius * 0.2, s.radius * 0.25 * s.life, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
      ctx.fill();
    }
    ctx.restore();
  }
}

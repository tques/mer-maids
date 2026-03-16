/**
 * water.ts — Water Rendering & Physics System
 * 
 * Handles everything related to the ocean:
 * - Wave surface calculation (layered sine waves for natural look)
 * - Underwater detection for physics switching
 * - Splash particle effects (entry/exit water)
 * - Ripple ring effects
 * - Full ocean rendering with gradient, caustics, foam, and highlights
 * 
 * The water surface divides the screen into air (above) and ocean (below).
 * The player's physics change when crossing this boundary.
 */

// ==================== CONSTANTS ====================

/** What fraction of the screen height is water (0.25 = bottom 25%) */
export const WATER_RATIO = 0.25;

/** Speed multiplier when the player is underwater (0.65 = 35% slower) */
export const WATER_SPEED_FACTOR = 0.65;

/** Maximum height of wave oscillation in pixels */
export const WAVE_AMPLITUDE = 6;

/** How fast waves animate (radians per frame, multiplied by dt) */
export const WAVE_SPEED = 0.002;

// ==================== INTERFACES ====================

/**
 * A single splash droplet particle.
 * Created when the player enters or exits the water.
 */
export interface Splash {
  x: number;       // World X position
  y: number;       // World Y position
  vx: number;      // Horizontal velocity
  vy: number;      // Vertical velocity (affected by gravity)
  life: number;    // Remaining life (1.0 → 0.0)
  maxLife: number;  // Total lifetime in seconds
  radius: number;  // Visual size
  color: string;   // CSS color string
}

/**
 * An expanding ring on the water surface.
 * Created alongside splashes for visual impact.
 */
export interface Ripple {
  x: number;       // Center X position
  y: number;       // Center Y position (at water surface)
  radius: number;  // Current radius (grows over time)
  maxRadius: number; // Maximum radius before fading
  life: number;    // Remaining life (1.0 → 0.0)
}

// ==================== MODULE STATE ====================
// These are module-level variables (not React state) for performance.
// They persist across frames and are updated every tick.

let splashes: Splash[] = [];  // Active splash particles
let ripples: Ripple[] = [];   // Active ripple rings
let waveTime = 0;             // Accumulated wave animation time

// ==================== UTILITY FUNCTIONS ====================

/**
 * Returns the Y coordinate of the water surface line.
 * Everything below this Y value is "underwater."
 * 
 * @param canvasHeight - The logical view height (canvas.height / ZOOM)
 * @returns Y position of the water surface in world coordinates
 */
export function getWaterSurfaceY(canvasHeight: number): number {
  return canvasHeight * (1 - WATER_RATIO);
}

/**
 * Calculates the wave height at a specific X position.
 * Uses 3 layered sine waves at different frequencies for a natural look.
 * The frequencies are chosen as exact multiples of 2π/worldWidth so that
 * waves tile seamlessly when the world wraps.
 * 
 * @param x - World X position to sample
 * @param baseY - Base water surface Y (from getWaterSurfaceY)
 * @param worldWidth - Total world width for seamless tiling (default 3000)
 * @returns The actual Y position of the wave at this X
 */
export function getWaveY(x: number, baseY: number, worldWidth: number = 3000): number {
  // Calculate frequencies that tile exactly over the world width
  const base = (2 * Math.PI) / worldWidth;
  const f1 = base * 12;   // ~12 full wave cycles across the world
  const f2 = base * 20;   // ~20 full cycles (higher frequency detail)
  const f3 = base * 7;    // ~7 full cycles (slow, large swells)
  
  return baseY
    + Math.sin(x * f1 + waveTime) * WAVE_AMPLITUDE              // Primary wave
    + Math.sin(x * f2 + waveTime * 1.3) * WAVE_AMPLITUDE * 0.5  // Secondary ripple
    + Math.sin(x * f3 + waveTime * 0.7) * WAVE_AMPLITUDE * 0.3; // Tertiary swell
}

/**
 * Checks if a Y position is below the water surface.
 * Used to switch between air physics and water physics.
 * 
 * @param py - The Y position to check
 * @param canvasHeight - Logical view height
 * @returns true if the position is underwater
 */
export function isSubmerged(py: number, canvasHeight: number): boolean {
  const surfaceY = getWaterSurfaceY(canvasHeight);
  return py > surfaceY;
}

// ==================== PARTICLE SPAWNING ====================

/**
 * Creates a burst of splash particles and ripple rings.
 * Called when the player crosses the water surface.
 * 
 * @param x - X position of the splash
 * @param y - Y position (should be at water surface)
 * @param vy - Vertical velocity at moment of crossing (affects intensity)
 * @param entering - true if going INTO water, false if coming OUT
 */
export function spawnSplash(x: number, y: number, vy: number, entering: boolean) {
  const count = entering ? 22 : 30;       // More particles when exiting (dramatic)
  const baseSpeed = entering ? 4 : 7;     // Faster particles when exiting
  
  // Color palette for water droplets
  const colors = [
    "rgba(140, 210, 255, 0.9)",
    "rgba(180, 230, 255, 0.85)",
    "rgba(100, 180, 240, 0.9)",
    "rgba(220, 240, 255, 0.95)",
    "rgba(60, 150, 220, 0.8)",
  ];
  
  // Spawn individual droplet particles
  for (let i = 0; i < count; i++) {
    const ang = entering
      ? -Math.PI * Math.random()                        // Spray upward (entering)
      : -Math.PI * (0.1 + Math.random() * 0.8);        // Focused upward spray (exiting)
    const speed = baseSpeed * (0.5 + Math.random());
    splashes.push({
      x: x + (Math.random() - 0.5) * 20,               // Slight horizontal spread
      y,
      vx: Math.cos(ang) * speed + (Math.random() - 0.5) * 3,
      vy: Math.sin(ang) * speed * (entering ? 1 : 1.8), // Exiting = taller splash
      life: 1,
      maxLife: 0.5 + Math.random() * 0.4,
      radius: 2.5 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  }
  
  // Spawn 3 concentric ripple rings
  ripples.push({ x, y, radius: 4, maxRadius: 50 + Math.abs(vy) * 10, life: 1 });
  ripples.push({ x: x - 15, y, radius: 2, maxRadius: 30 + Math.abs(vy) * 5, life: 0.8 });
  ripples.push({ x: x + 15, y, radius: 2, maxRadius: 30 + Math.abs(vy) * 5, life: 0.8 });
}

// ==================== PHYSICS UPDATE ====================

/**
 * Updates all water particles and advances wave animation.
 * Called once per frame from the main game loop.
 * 
 * @param dt - Delta time in seconds (typically 1/60)
 */
export function updateParticles(dt: number) {
  // Advance wave animation time
  waveTime += WAVE_SPEED * dt * 60;

  // Update splash particles — apply gravity, drag, and decay
  splashes = splashes.filter((s) => {
    s.x += s.vx;
    s.y += s.vy;
    s.vy += 0.12;      // Gravity pulls droplets down
    s.vx *= 0.99;      // Slight air resistance
    s.life -= dt / s.maxLife;  // Fade out over lifetime
    return s.life > 0;  // Remove dead particles
  });

  // Update ripple rings — expand and fade
  ripples = ripples.filter((r) => {
    r.life -= dt * 2.0;
    r.radius += (r.maxRadius - r.radius) * 0.06;  // Ease toward max radius
    return r.life > 0;
  });
}

// ==================== RENDERING ====================

/**
 * Draws the complete ocean: gradient, caustics, wave highlights, foam, ripples, and splashes.
 * This is one of the most visually complex functions in the game.
 * 
 * Called within a camera-translated context, so coordinates are in world space.
 * 
 * @param ctx - The canvas 2D rendering context
 * @param cw - Width of the drawable area (world width for this copy)
 * @param ch - Logical view height
 * @param visibleStartX - Left edge of visible area (for culling optimization)
 * @param visibleEndX - Right edge of visible area (for culling optimization)
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
  const x0 = visibleStartX != null ? Math.max(-5, Math.floor(visibleStartX) - 10) : -5;
  const x1 = visibleEndX != null ? Math.min(cw + 5, Math.ceil(visibleEndX) + 10) : cw + 5;

  // Clip to world bounds to prevent bleeding at wrap boundaries
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, cw, ch);
  ctx.clip();

  // === OCEAN BODY ===
  // Draw the wave surface path and fill with a deep gradient
  ctx.beginPath();
  ctx.moveTo(x0, ch);  // Start at bottom-left
  for (let x = x0; x <= x1; x += 3) {  // Step every 3px for performance
    ctx.lineTo(x, getWaveY(x, baseY, cw));
  }
  ctx.lineTo(x1, ch);  // Close at bottom-right
  ctx.closePath();

  // Tropical ocean gradient — vibrant turquoise to deep teal
  const grad = ctx.createLinearGradient(0, baseY - 10, 0, ch);
  grad.addColorStop(0, "rgba(40, 210, 200, 0.50)");
  grad.addColorStop(0.08, "rgba(20, 185, 180, 0.55)");
  grad.addColorStop(0.2, "rgba(10, 150, 160, 0.62)");
  grad.addColorStop(0.4, "rgba(5, 110, 140, 0.72)");
  grad.addColorStop(0.7, "rgba(2, 70, 110, 0.82)");
  grad.addColorStop(1, "rgba(0, 30, 60, 0.90)");
  ctx.fillStyle = grad;
  ctx.fill();

  // === CAUSTIC LIGHT PATCHES ===
  // Animated light spots below the surface (like sunlight refracted through waves)
  ctx.save();
  ctx.clip();
  ctx.globalAlpha = 0.07;  // Very subtle
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

  // === WAVE SURFACE HIGHLIGHTS ===
  // Three layers of wave-following lines at different depths for a 3D feel

  // Primary highlight (brightest, at surface)
  ctx.beginPath();
  for (let x = x0; x <= x1; x += 3) {
    const wy = getWaveY(x, baseY, cw);
    if (x === x0) ctx.moveTo(x, wy);
    else ctx.lineTo(x, wy);
  }
  ctx.strokeStyle = "rgba(190, 235, 255, 0.55)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Secondary highlight (dimmer, slightly below surface)
  ctx.beginPath();
  for (let x = x0; x <= x1; x += 4) {
    const wy = getWaveY(x, baseY, cw) + 5;
    if (x === x0) ctx.moveTo(x, wy);
    else ctx.lineTo(x, wy);
  }
  ctx.strokeStyle = "rgba(80, 160, 230, 0.2)";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Tertiary highlight (very faint, deeper)
  ctx.beginPath();
  for (let x = x0; x <= x1; x += 5) {
    const wy = getWaveY(x, baseY, cw) + 12;
    if (x === x0) ctx.moveTo(x, wy);
    else ctx.lineTo(x, wy);
  }
  ctx.strokeStyle = "rgba(60, 130, 200, 0.1)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // === FOAM / WHITE CAPS ===
  // Small bright dots at wave peaks where the slope is steep
  for (let x = x0; x <= x1; x += 6) {
    const wy = getWaveY(x, baseY, cw);
    const slope = getWaveY(x + 3, baseY, cw) - wy;  // Approximate slope
    if (slope < -0.6) {  // Only on steep downward slopes (wave crests)
      ctx.globalAlpha = Math.min(Math.abs(slope) * 0.35, 0.4);
      ctx.beginPath();
      ctx.arc(x, wy - 1, 2 + Math.abs(slope) * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(230, 245, 255, 0.8)";
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  ctx.restore();  // Restore from clip

  // === RIPPLE RINGS ===
  // Expanding elliptical rings on the water surface
  for (const r of ripples) {
    if (r.x < x0 - r.maxRadius || r.x > x1 + r.maxRadius) continue;  // Cull off-screen
    ctx.save();
    ctx.globalAlpha = r.life * 0.5;
    // Outer ring (elliptical for perspective)
    ctx.beginPath();
    ctx.ellipse(r.x, r.y, r.radius, r.radius * 0.25, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(180, 230, 255, 0.8)";
    ctx.lineWidth = 2;
    ctx.stroke();
    // Inner ring
    ctx.beginPath();
    ctx.ellipse(r.x, r.y, r.radius * 0.6, r.radius * 0.15, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(220, 240, 255, 0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  // === SPLASH PARTICLES ===
  // Individual water droplets from splashes
  for (const s of splashes) {
    if (s.x < x0 - 10 || s.x > x1 + 10) continue;  // Cull off-screen
    ctx.save();
    ctx.globalAlpha = s.life * 0.85;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius * (0.3 + s.life * 0.7), 0, Math.PI * 2);
    ctx.fillStyle = s.color;
    ctx.fill();
    // Specular highlight on larger droplets
    if (s.radius > 3) {
      ctx.beginPath();
      ctx.arc(s.x - s.radius * 0.2, s.y - s.radius * 0.2, s.radius * 0.25 * s.life, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
      ctx.fill();
    }
    ctx.restore();
  }
}

/**
 * jettrail.ts — Water Jet Propulsion Particle Effects
 * 
 * Creates the visual trail behind the player's mech when thrusting.
 * The mech uses a water-jet propulsion system, so the trail looks like
 * a concentrated water stream rather than fire/smoke.
 * 
 * Four particle types create a layered effect:
 * 1. **Core** — Tight, bright white-blue stream (the main jet)
 * 2. **Spray** — Wider fan of small droplets around the core
 * 3. **Mist** — Large, soft, translucent clouds that expand and fade
 * 4. **Drip** — Occasional large drops that fall with gravity
 * 
 * When fuel is low, the jet sputters (randomly skips frames,
 * reduced particle count, choppy effect).
 */

// ==================== INTERFACE ====================

/** A single particle in the jet trail */
export interface JetParticle {
  x: number;       // World X position
  y: number;       // World Y position
  vx: number;      // X velocity
  vy: number;      // Y velocity
  life: number;    // Remaining life (1.0 → 0.0)
  maxLife: number;  // Total lifetime in seconds
  size: number;    // Visual radius
  type: 'core' | 'spray' | 'mist' | 'drip';  // Determines physics and rendering
  opacity: number; // Base opacity multiplier
}

// ==================== MODULE STATE ====================

let particles: JetParticle[] = [];

/** Clear all jet particles. Called when starting a new game. */
export function resetJetTrail() {
  particles = [];
}

// ==================== SPAWNING ====================

/**
 * Spawn new jet particles behind the player's mech.
 * Called every frame while the player is thrusting.
 * 
 * @param x - Player X position
 * @param y - Player Y position
 * @param angle - Direction the player is facing (radians)
 * @param throttle - Current throttle level (0-1, affects intensity)
 * @param submerged - Whether the player is underwater (reduces effects)
 * @param fuel - Current fuel amount
 * @param maxFuel - Maximum fuel capacity
 */
export function spawnJetParticles(
  x: number, y: number,
  angle: number,
  throttle: number,
  submerged: boolean,
  fuel: number,
  maxFuel: number,
) {
  if (throttle < 0.05) return;  // No particles when barely thrusting

  const fuelRatio = fuel / maxFuel;
  const sputtering = fuelRatio < 0.25;  // Low fuel = choppy jet

  // When sputtering, randomly skip frames for a choppy effect
  if (sputtering && Math.random() > fuelRatio * 3 + 0.15) return;

  const backAngle = angle + Math.PI;  // Particles go BEHIND the player
  const effectiveThrottle = sputtering ? throttle * (0.3 + Math.random() * 0.5) : throttle;

  // === CORE STREAM: tight concentrated water beam ===
  const coreCount = submerged ? 1 : Math.ceil(effectiveThrottle * 4);
  for (let i = 0; i < coreCount; i++) {
    const spread = (Math.random() - 0.5) * 0.15; // Very tight spread angle
    const streamAngle = backAngle + spread;
    const speed = 3.5 + Math.random() * 3 * effectiveThrottle;
    const distBack = 14 + Math.random() * 4;  // How far behind the player to spawn
    particles.push({
      x: x + Math.cos(backAngle) * distBack + (Math.random() - 0.5) * 2,
      y: y + Math.sin(backAngle) * distBack + (Math.random() - 0.5) * 2,
      vx: Math.cos(streamAngle) * speed,
      vy: Math.sin(streamAngle) * speed,
      life: 1,
      maxLife: 0.18 + Math.random() * 0.12,
      size: 2.5 + Math.random() * 2 * effectiveThrottle,
      type: 'core',
      opacity: 0.85,
    });
  }

  // === SPRAY: wider fan of droplets around the core ===
  if (!submerged && effectiveThrottle > 0.3) {
    const sprayCount = Math.ceil(effectiveThrottle * 3);
    for (let i = 0; i < sprayCount; i++) {
      const spread = (Math.random() - 0.5) * 1.2; // Much wider than core
      const sprayAngle = backAngle + spread;
      const speed = 1.5 + Math.random() * 2.5 * effectiveThrottle;
      const distBack = 16 + Math.random() * 6;
      particles.push({
        x: x + Math.cos(backAngle) * distBack + (Math.random() - 0.5) * 6,
        y: y + Math.sin(backAngle) * distBack + (Math.random() - 0.5) * 6,
        vx: Math.cos(sprayAngle) * speed,
        vy: Math.sin(sprayAngle) * speed + 0.5, // Slight downward pull
        life: 1,
        maxLife: 0.15 + Math.random() * 0.15,
        size: 1 + Math.random() * 2,
        type: 'spray',
        opacity: 0.5,
      });
    }
  }

  // === MIST: large, fading cloud behind the stream ===
  if (!submerged && effectiveThrottle > 0.5 && Math.random() < effectiveThrottle * 0.6) {
    const distBack = 22 + Math.random() * 10;
    particles.push({
      x: x + Math.cos(backAngle) * distBack + (Math.random() - 0.5) * 8,
      y: y + Math.sin(backAngle) * distBack + (Math.random() - 0.5) * 8,
      vx: Math.cos(backAngle) * 0.5 + (Math.random() - 0.5) * 0.8,
      vy: 0.2 + Math.random() * 0.3, // Drifts down slowly
      life: 1,
      maxLife: 0.3 + Math.random() * 0.3,
      size: 6 + Math.random() * 8 * effectiveThrottle,
      type: 'mist',
      opacity: 0.15,  // Very transparent
    });
  }

  // === DRIPS: occasional larger drops that fall with gravity ===
  if (!submerged && Math.random() < effectiveThrottle * 0.25) {
    const spread = (Math.random() - 0.5) * 0.8;
    const dripAngle = backAngle + spread;
    const speed = 1 + Math.random() * 1.5;
    const distBack = 18 + Math.random() * 8;
    particles.push({
      x: x + Math.cos(backAngle) * distBack + (Math.random() - 0.5) * 6,
      y: y + Math.sin(backAngle) * distBack,
      vx: Math.cos(dripAngle) * speed,
      vy: Math.sin(dripAngle) * speed,
      life: 1,
      maxLife: 0.4 + Math.random() * 0.3,
      size: 2 + Math.random() * 2,
      type: 'drip',
      opacity: 0.7,
    });
  }
}

// ==================== PHYSICS UPDATE ====================

/**
 * Update all jet trail particles each frame.
 * Each type has different physics:
 * - Core: fast deceleration, shrinks
 * - Spray: medium deceleration, slight gravity
 * - Mist: slow deceleration, expands over time
 * - Drip: heavy gravity, slight deceleration
 * 
 * @param dt - Delta time in seconds
 */
export function updateJetTrail(dt: number) {
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;

    if (p.type === 'core') {
      p.vx *= 0.93;   // Quick deceleration
      p.vy *= 0.93;
      p.size *= 0.97;  // Shrinks
    } else if (p.type === 'spray') {
      p.vx *= 0.95;
      p.vy *= 0.95;
      p.vy += 0.04;   // Light gravity
    } else if (p.type === 'mist') {
      p.vx *= 0.98;   // Slow deceleration
      p.vy *= 0.98;
      p.size *= 1.02;  // Expands!
    } else if (p.type === 'drip') {
      p.vy += 0.12;   // Heavy gravity
      p.vx *= 0.99;
      p.size *= 0.995;
    }

    p.life -= dt / p.maxLife;  // Count down lifetime
  }
  particles = particles.filter(p => p.life > 0);
}

// ==================== RENDERING ====================

/**
 * Draw all jet trail particles.
 * Each type has a distinct visual style:
 * - Core: bright white-blue with outer glow
 * - Spray: small blue droplets
 * - Mist: large, soft radial gradient clouds
 * - Drip: elongated ellipses stretched in direction of motion
 */
export function drawJetTrail(ctx: CanvasRenderingContext2D) {
  for (const p of particles) {
    ctx.save();

    if (p.type === 'core') {
      // Bright white-blue concentrated stream
      const alpha = p.life * p.opacity;
      ctx.globalAlpha = alpha;
      // Outer glow ring
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 1.8, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(100, 180, 255, ${alpha * 0.3})`;
      ctx.fill();
      // Main dot
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180, 220, 255, ${alpha * 0.8})`;
      ctx.fill();
      // Bright center highlight
      if (p.size > 1.5) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(240, 250, 255, ${alpha * 0.9})`;
        ctx.fill();
      }
    } else if (p.type === 'spray') {
      // Small blue droplets
      const alpha = p.life * p.opacity;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(140, 200, 255, ${alpha * 0.7})`;
      ctx.fill();
    } else if (p.type === 'mist') {
      // Large, soft, translucent cloud using radial gradient
      const alpha = p.life * p.opacity;
      ctx.globalAlpha = alpha;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
      grad.addColorStop(0, `rgba(160, 210, 255, ${alpha * 0.4})`);
      grad.addColorStop(1, `rgba(160, 210, 255, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
    } else if (p.type === 'drip') {
      // Elongated falling drops (stretched ellipse in direction of motion)
      const alpha = p.life * p.opacity;
      ctx.globalAlpha = alpha;
      const speed = Math.hypot(p.vx, p.vy);
      const stretch = Math.min(speed * 0.4, 2.5);  // More speed = more stretched
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.atan2(p.vy, p.vx));  // Align with velocity
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size * (1 + stretch), p.size * 0.6, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(130, 200, 255, ${alpha * 0.6})`;
      ctx.fill();
    }

    ctx.restore();
  }
}

// ==================== SHIP PITCH ====================

/**
 * Compute a pitch angle offset for the player ship based on its state.
 * This tilts the ship's nose up when thrusting and down when falling,
 * creating a more dynamic visual feel.
 * 
 * @param throttle - Current throttle level (0-1)
 * @param isMoving - Whether the player is actively thrusting
 * @param vy - Current vertical velocity
 * @param submerged - Whether the player is underwater
 * @returns Angle offset in radians (negative = nose up, positive = nose down)
 */
export function getShipPitch(
  throttle: number,
  isMoving: boolean,
  vy: number,
  submerged: boolean,
): number {
  if (submerged) return 0;  // No pitch adjustment underwater

  // Thrusting: nose tilts up slightly
  if (isMoving && throttle > 0.3) {
    return -0.12 * throttle; // Negative = nose up relative to movement direction
  }

  // Falling/stalling: nose dips down
  if (vy > 1) {
    const dip = Math.min(vy / 7, 1);  // Proportional to fall speed
    return 0.25 * dip; // Positive = nose down
  }

  return 0;
}

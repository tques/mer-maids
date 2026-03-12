import { useEffect, useRef, useState, useCallback } from "react";
import {
  getWaterSurfaceY, isSubmerged, spawnSplash, updateParticles, drawWater,
  WATER_SPEED_FACTOR,
} from "../game/water";
import { createBoat, drawBoat, collideWithBoat, Boat } from "../game/boat";
import { updateEnemies, checkBulletCollisions, checkChaserBulletHitsPlayer, checkBombHitsShip, drawEnemies, spawnExplosion, resetEnemies } from "../game/enemies";
import { resetPowerups, checkScoreRewards, checkPowerupPickup, updatePowerups, drawPowerups } from "../game/powerups";

const SPEED = 4;
const TRI_SIZE = 20;
const GRAVITY = 0.12;
const MAX_FALL_SPEED = 7;
const FLOAT_DURATION = 1200;
const DRAG = 0.99;
const PLAYER_MAX_HP = 3;
const SHIP_MAX_HP = 10;
const PLAYER_LIVES = 3;
const INVULN_DURATION = 1500;
const BULLET_SPEED = 8;
const BULLET_RADIUS = 5;
const ROLL_DISTANCE = 60;
const ROLL_DURATION = 300;
const WORLD_WIDTH = 3000;
const ZOOM = 1.4;
const MAX_AMMO = 30;
const AMMO_LOW_THRESHOLD = 8;
const AMMO_BOX_SIZE = 22;

interface Bullet {
  x: number;
  y: number;
  dx: number;
  dy: number;
  id: number;
}

interface AmmoBox {
  x: number;
  y: number;
  spawnTime: number;
}

const Index = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const posRef = useRef({ x: 0, y: 0 });
  const mouseRef = useRef({ x: 0, y: 0 });
  const keysRef = useRef<Set<string>>(new Set());
  const bulletsRef = useRef<Bullet[]>([]);
  const bulletIdRef = useRef(0);
  const rafRef = useRef(0);
  const rollRef = useRef<{ active: boolean; dir: -1 | 1; startTime: number; startX: number; startY: number; perpX: number; perpY: number; spinAngle: number }>({ active: false, dir: 1, startTime: 0, startX: 0, startY: 0, perpX: 0, perpY: 0, spinAngle: 0 });
  const rightMouseRef = useRef(false);
  const shootCooldownRef = useRef(0);
  const SHOOT_INTERVAL = 280;
  const wasSubmergedRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const boatRef = useRef<Boat | null>(null);
  const velRef = useRef({ x: 0, y: 0 });
  const floatTimerRef = useRef(0);
  const wasMovingRef = useRef(false);
  const throttleRef = useRef(1);
  const [showHint, setShowHint] = useState(true);
  const [gameStarted, setGameStarted] = useState(false);
  const gameStartedRef = useRef(false);
  const playerHPRef = useRef(PLAYER_MAX_HP);
  const playerLivesRef = useRef(PLAYER_LIVES);
  const shipHPRef = useRef(SHIP_MAX_HP);
  const invulnRef = useRef(0);
  const gameOverRef = useRef(false);
  const pausedRef = useRef(false);
  const ammoRef = useRef(MAX_AMMO);
  const ammoBoxRef = useRef<AmmoBox | null>(null);
  const ammoBoxAlertRef = useRef(0); // countdown for HUD flash
  const [paused, setPaused] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [gameOverReason, setGameOverReason] = useState("");

  // Helper: convert screen mouse to world coords
  const getWorldMouse = useCallback(() => {
    const mouse = mouseRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return { x: mouse.x, y: mouse.y };
    const viewW = canvas.width / ZOOM;
    const camX = posRef.current.x - viewW / 2;
    return {
      x: mouse.x / ZOOM + camX,
      y: mouse.y / ZOOM,
    };
  }, []);

  const shake = useCallback((dx: number, dy: number) => {
    const el = containerRef.current;
    if (!el) return;
    el.style.transform = `translate(${dx * 2}px, ${dy * 2}px)`;
    setTimeout(() => { el.style.transform = "translate(0,0)"; }, 150);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      if (posRef.current.x === 0 && posRef.current.y === 0) {
        const viewH = canvas.height / ZOOM;
        posRef.current = { x: WORLD_WIDTH / 2, y: viewH * 0.4 };
      }
      boatRef.current = createBoat(WORLD_WIDTH);
      mouseRef.current = { x: canvas.width / 2, y: canvas.height / 2 };
    };
    resize();
    window.addEventListener("resize", resize);

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        setShowHint(false);
        keysRef.current.add("w");
      } else if (e.button === 2) {
        e.preventDefault();
        setShowHint(false);
        rightMouseRef.current = true;
        shootCooldownRef.current = 0;
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) keysRef.current.delete("w");
      if (e.button === 2) rightMouseRef.current = false;
    };

    const onContextMenu = (e: Event) => e.preventDefault();

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === "escape" && gameStartedRef.current && !gameOverRef.current) {
        pausedRef.current = !pausedRef.current;
        setPaused(pausedRef.current);
        if (!pausedRef.current) {
          rafRef.current = requestAnimationFrame(loop);
        }
        return;
      }
      if (key === "a" || key === "d") {
        e.preventDefault();
        setShowHint(false);
        const roll = rollRef.current;
        if (!roll.active) {
          const pos = posRef.current;
          const wm = getWorldMouse();
          const angle = Math.atan2(wm.y - pos.y, wm.x - pos.x);
          const dir = key === "a" ? -1 : 1;
          const perpX = -Math.sin(angle) * dir;
          const perpY = Math.cos(angle) * dir;
          roll.active = true;
          roll.dir = dir as -1 | 1;
          roll.startTime = performance.now();
          roll.startX = pos.x;
          roll.startY = pos.y;
          roll.perpX = perpX;
          roll.perpY = perpY;
          roll.spinAngle = 0;
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };

    const ctx = canvas.getContext("2d")!;

    const loop = () => {
      if (gameOverRef.current) return;
      if (pausedRef.current) return;
      const { width: cw, height: ch } = canvas;
      const viewW = cw / ZOOM;
      const viewH = ch / ZOOM;
      const pos = posRef.current;

      // World-space mouse
      const camX = pos.x - viewW / 2;
      const wmx = mouseRef.current.x / ZOOM + camX;
      const wmy = mouseRef.current.y / ZOOM;
      const angle = Math.atan2(wmy - pos.y, wmx - pos.x);

      // Barrel roll
      const roll = rollRef.current;
      if (roll.active) {
        const elapsed = performance.now() - roll.startTime;
        const t = Math.min(elapsed / ROLL_DURATION, 1);
        const prevT = Math.max((elapsed - 16) / ROLL_DURATION, 0);
        const ease = (v: number) => 1 - (1 - v) * (1 - v);
        const dt = ease(t) - ease(prevT);
        pos.x += roll.perpX * ROLL_DISTANCE * dt;
        pos.y += roll.perpY * ROLL_DISTANCE * dt;
        roll.spinAngle = roll.dir * Math.PI * 2 * ease(t);
        if (t >= 1) roll.active = false;
      }

      // Water submersion check (using viewH for world-space height)
      const submerged = isSubmerged(pos.y, viewH);
      const wasSubmerged = wasSubmergedRef.current;
      const speedMult = submerged ? WATER_SPEED_FACTOR : 1;

      // Splash on entry/exit
      if (submerged && !wasSubmerged) {
        const vy = pos.y - lastPosRef.current.y;
        spawnSplash(pos.x, getWaterSurfaceY(viewH), vy, true);
      } else if (!submerged && wasSubmerged) {
        const vy = pos.y - lastPosRef.current.y;
        spawnSplash(pos.x, getWaterSurfaceY(viewH), vy, false);
      }
      wasSubmergedRef.current = submerged;
      lastPosRef.current = { x: pos.x, y: pos.y };

      // Move toward world-space mouse
      const isMoving = keysRef.current.has("w");
      const vel = velRef.current;
      if (isMoving) {
        const stalling = floatTimerRef.current > FLOAT_DURATION;
        if (stalling && throttleRef.current < 1) {
          throttleRef.current = Math.min(throttleRef.current + 0.012, 1);
        } else if (!stalling) {
          throttleRef.current = 1;
        }

        const power = SPEED * speedMult * throttleRef.current;
        const dist = Math.hypot(wmx - pos.x, wmy - pos.y);
        if (dist > 5) {
          const targetVx = Math.cos(angle) * power;
          const targetVy = Math.sin(angle) * power;
          vel.x += (targetVx - vel.x) * (0.05 + throttleRef.current * 0.15);
          vel.y += (targetVy - vel.y) * (0.05 + throttleRef.current * 0.15);
        }
        pos.x += vel.x;
        pos.y += vel.y;

        if (throttleRef.current >= 0.95) {
          floatTimerRef.current = 0;
        }
        wasMovingRef.current = true;
      } else if (wasMovingRef.current) {
        floatTimerRef.current += 16;
        throttleRef.current = Math.max(throttleRef.current - 0.02, 0);

        vel.x *= DRAG;
        vel.y *= DRAG;

        if (floatTimerRef.current > FLOAT_DURATION) {
          const gravityT = Math.min((floatTimerRef.current - FLOAT_DURATION) / 800, 1);
          vel.y = Math.min(vel.y + GRAVITY * gravityT * gravityT, MAX_FALL_SPEED);
        }

        pos.x += vel.x;
        pos.y += vel.y;
      }

      // Horizontal wrapping in world space
      pos.x = ((pos.x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;

      // Vertical clamp
      let hitY = 0;
      if (pos.y < TRI_SIZE) { pos.y = TRI_SIZE; hitY = -1; }
      if (pos.y > viewH - TRI_SIZE) { pos.y = viewH - TRI_SIZE; hitY = 1; }
      if (hitY) shake(0, hitY);

      // Recalculate camera after position update
      const finalCamX = pos.x - viewW / 2;

      // Continuous fire (ammo gated)
      if (rightMouseRef.current && ammoRef.current > 0) {
        shootCooldownRef.current -= 16;
        if (shootCooldownRef.current <= 0) {
          shootCooldownRef.current = SHOOT_INTERVAL;
          ammoRef.current -= 1;
          const fireAngle = angle;
          bulletsRef.current.push({
            x: pos.x + Math.cos(fireAngle) * (TRI_SIZE + 4),
            y: pos.y + Math.sin(fireAngle) * (TRI_SIZE + 4),
            dx: Math.cos(fireAngle) * BULLET_SPEED,
            dy: Math.sin(fireAngle) * BULLET_SPEED,
            id: bulletIdRef.current++,
          });
        }
      }

      // Update bullets (world space, cull by distance from player)
      bulletsRef.current = bulletsRef.current.filter((b) => {
        b.x += b.dx;
        b.y += b.dy;
        return b.y > -10 && b.y < viewH + 10 && Math.abs(b.x - pos.x) < viewW * 1.5;
      });

      // Update enemies
      const boatX = boatRef.current ? boatRef.current.x : WORLD_WIDTH / 2;
      const boatW = boatRef.current ? boatRef.current.width : 400;
      if (gameStartedRef.current) {
        updateEnemies(1 / 60, WORLD_WIDTH, viewH, boatX, boatW, pos.x, pos.y, viewW / 2);
        bulletsRef.current = checkBulletCollisions(bulletsRef.current);
      }

      // Enemy projectile collisions
      if (gameStartedRef.current) {
        if (invulnRef.current > 0) {
          invulnRef.current -= 16;
        } else {
          const playerHits = checkChaserBulletHitsPlayer(pos.x, pos.y, TRI_SIZE);
          if (playerHits > 0) {
            spawnExplosion(pos.x, pos.y, 20);
            shake(0, 1);
            invulnRef.current = INVULN_DURATION;
            playerHPRef.current -= playerHits;
            if (playerHPRef.current <= 0) {
              playerLivesRef.current -= 1;
              if (playerLivesRef.current <= 0) {
                gameOverRef.current = true;
                setGameOver(true);
                setGameOverReason("All ships lost!");
              } else {
                playerHPRef.current = PLAYER_MAX_HP;
              }
            }
          }
        }

        const waterY = getWaterSurfaceY(viewH);
        const bombHits = checkBombHitsShip(boatX, boatW, waterY);
        if (bombHits > 0) {
          shake(0, 1);
          shipHPRef.current = Math.max(shipHPRef.current - bombHits, 0);
          if (shipHPRef.current <= 0) {
            gameOverRef.current = true;
            setGameOver(true);
            setGameOverReason("Carrier destroyed!");
          }
        }
      }

      // === AMMO BOX SYSTEM ===
      if (gameStartedRef.current) {
        // Spawn ammo box when ammo is low and none exists
        if (ammoRef.current <= AMMO_LOW_THRESHOLD && !ammoBoxRef.current) {
          const edgeX = Math.random() < 0.5 ? 20 : WORLD_WIDTH - 20;
          const surfY = getWaterSurfaceY(viewH);
          const boxY = 40 + Math.random() * (surfY - 80);
          ammoBoxRef.current = { x: edgeX, y: boxY, spawnTime: performance.now() };
          ammoBoxAlertRef.current = 3000; // 3s HUD flash
        }

        // Tick alert timer
        if (ammoBoxAlertRef.current > 0) {
          ammoBoxAlertRef.current -= 16;
        }

        // Check pickup collision
        const box = ammoBoxRef.current;
        if (box) {
          // Wrap-aware distance
          let ddx = Math.abs(pos.x - box.x);
          if (ddx > WORLD_WIDTH / 2) ddx = WORLD_WIDTH - ddx;
          const ddy = Math.abs(pos.y - box.y);
          if (ddx < TRI_SIZE + AMMO_BOX_SIZE && ddy < TRI_SIZE + AMMO_BOX_SIZE) {
            ammoRef.current = MAX_AMMO;
            ammoBoxRef.current = null;
            ammoBoxAlertRef.current = 0;
          }
        }
      }

      // Update water particles
      updateParticles(1 / 60);

      // === DRAWING ===
      // Clear
      ctx.clearRect(0, 0, cw, ch);

      // Apply zoom
      ctx.save();
      ctx.scale(ZOOM, ZOOM);

      // Draw sky gradient (view space, no camera)
      const skyGrad = ctx.createLinearGradient(0, 0, 0, viewH);
      skyGrad.addColorStop(0, "#0a0a1a");
      skyGrad.addColorStop(0.35, "#1a1a3e");
      skyGrad.addColorStop(0.55, "#2d4a6f");
      skyGrad.addColorStop(0.7, "#e8a838");
      skyGrad.addColorStop(0.78, "#f7d794");
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, viewW, viewH);

      // Apply camera translation (pixel-snapped to remove 1px seams at wrap boundaries)
      const drawCamX = Math.round(finalCamX * ZOOM) / ZOOM;
      ctx.save();
      ctx.translate(-drawCamX, 0);

      // Draw wrapping copies (only visible ones)
      for (const offset of [-WORLD_WIDTH, 0, WORLD_WIDTH]) {
        const worldStart = offset;
        const worldEnd = offset + WORLD_WIDTH;
        // Skip if entirely off-screen
        if (worldEnd < drawCamX - 100 || worldStart > drawCamX + viewW + 100) continue;

        ctx.save();
        ctx.translate(offset, 0);

        // Water — pass visible range for performance
        const localVisStart = drawCamX - offset;
        const localVisEnd = drawCamX + viewW - offset;
        drawWater(ctx, WORLD_WIDTH, viewH, localVisStart, localVisEnd);

        // Enemies, bombs, explosions
        drawEnemies(ctx);

        // Boat
        if (boatRef.current) {
          drawBoat(ctx, boatRef.current, viewH);
        }

        // Player bullets
        ctx.fillStyle = "#D93636";
        for (const b of bulletsRef.current) {
          ctx.beginPath();
          ctx.arc(b.x, b.y, BULLET_RADIUS, 0, Math.PI * 2);
          ctx.fill();
        }

        // Ammo box
        const box = ammoBoxRef.current;
        if (box) {
          const t = (performance.now() - box.spawnTime) / 400;
          const bobY = box.y + Math.sin(t) * 4;
          const s = AMMO_BOX_SIZE;
          ctx.save();
          ctx.translate(box.x, bobY);
          // Glow
          ctx.shadowColor = "rgba(255, 220, 60, 0.6)";
          ctx.shadowBlur = 16;
          // Crate body
          ctx.fillStyle = "#c8a020";
          ctx.fillRect(-s / 2, -s / 2, s, s);
          // Lid highlight
          ctx.fillStyle = "#f0c830";
          ctx.fillRect(-s / 2, -s / 2, s, s * 0.35);
          // Bullet icons (3 small vertical rounds)
          ctx.fillStyle = "#805a00";
          const bw = 3, bh = 10;
          ctx.fillRect(-bw * 2, -bh / 2 + 2, bw, bh);
          ctx.fillRect(-bw / 2, -bh / 2 + 2, bw, bh);
          ctx.fillRect(bw, -bh / 2 + 2, bw, bh);
          // Bullet tips
          ctx.fillStyle = "#d4a017";
          ctx.beginPath();
          ctx.arc(-bw * 2 + bw / 2, -bh / 2 + 2, bw / 2 + 0.5, Math.PI, 0);
          ctx.arc(-bw / 2 + bw / 2, -bh / 2 + 2, bw / 2 + 0.5, Math.PI, 0);
          ctx.arc(bw + bw / 2, -bh / 2 + 2, bw / 2 + 0.5, Math.PI, 0);
          ctx.fill();
          // Border
          ctx.strokeStyle = "#604800";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(-s / 2, -s / 2, s, s);
          ctx.restore();
        }

        // Player triangle
        const isInvuln = invulnRef.current > 0;
        const showPlayer = !isInvuln || Math.floor(performance.now() / 80) % 2 === 0;
        if (showPlayer) {
          ctx.save();
          ctx.translate(pos.x, pos.y);
          ctx.rotate(angle);

          if (roll.active) {
            const elapsed = performance.now() - roll.startTime;
            const t = Math.min(elapsed / ROLL_DURATION, 1);
            const rollAngle = roll.dir * Math.PI * 2 * t;
            const scaleY = Math.cos(rollAngle);
            ctx.scale(1, scaleY);
          }

          ctx.shadowColor = "rgba(0,0,0,0.3)";
          ctx.shadowBlur = 12;
          ctx.shadowOffsetY = 4;

          ctx.beginPath();
          ctx.moveTo(TRI_SIZE, 0);
          ctx.lineTo(-TRI_SIZE * 0.7, -TRI_SIZE * 0.6);
          ctx.lineTo(-TRI_SIZE * 0.7, TRI_SIZE * 0.6);
          ctx.closePath();
          ctx.fillStyle = isInvuln ? "#ff8888" : "#D93636";
          ctx.fill();

          ctx.shadowColor = "transparent";
          ctx.restore();
        }

        ctx.restore(); // offset
      }

      ctx.restore(); // camera translation
      ctx.restore(); // zoom

      // HUD (screen space, no transforms)
      ctx.save();
      ctx.font = "bold 14px monospace";
      ctx.textAlign = "left";

      const hudY = 28;
      const hudX = 16;
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(hudX - 4, hudY - 16, 200, 74);

      // Ammo counter
      const ammo = ammoRef.current;
      const ammoColor = ammo <= AMMO_LOW_THRESHOLD ? "#f0c830" : "#aaa";
      ctx.fillStyle = ammoColor;
      ctx.fillText("AMMO", hudX, hudY + 44);
      const ammoBarW = 120;
      const ammoFill = (ammo / MAX_AMMO) * ammoBarW;
      ctx.fillStyle = "#333";
      ctx.fillRect(hudX + 50, hudY + 34, ammoBarW, 10);
      ctx.fillStyle = ammo <= AMMO_LOW_THRESHOLD ? "#f0c830" : "#D93636";
      ctx.fillRect(hudX + 50, hudY + 34, ammoFill, 10);
      ctx.fillStyle = ammoColor;
      ctx.font = "bold 11px monospace";
      ctx.fillText(`${ammo}`, hudX + 50 + ammoBarW + 6, hudY + 44);
      ctx.font = "bold 14px monospace";

      // Ammo box alert
      if (ammoBoxRef.current && ammoBoxAlertRef.current > 0) {
        const flash = Math.sin(performance.now() / 200) > 0;
        if (flash) {
          ctx.fillStyle = "#f0c830";
          ctx.fillText("▼ AMMO CRATE SPAWNED ▼", hudX, hudY + 64);
        }
      }

      ctx.fillStyle = "#D93636";
      ctx.fillText("LIVES", hudX, hudY);
      for (let i = 0; i < PLAYER_LIVES; i++) {
        const lx = hudX + 60 + i * 22;
        ctx.beginPath();
        ctx.moveTo(lx + 8, hudY - 5);
        ctx.lineTo(lx - 2, hudY - 10);
        ctx.lineTo(lx - 2, hudY);
        ctx.closePath();
        ctx.fillStyle = i < playerLivesRef.current ? "#D93636" : "#444";
        ctx.fill();
      }

      ctx.fillStyle = "#aaa";
      ctx.fillText("HP", hudX, hudY + 22);
      for (let i = 0; i < PLAYER_MAX_HP; i++) {
        ctx.fillStyle = i < playerHPRef.current ? "#D93636" : "#444";
        ctx.fillRect(hudX + 30 + i * 18, hudY + 12, 14, 10);
      }

      ctx.textAlign = "right";
      const shipHudX = cw - 16;
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(shipHudX - 240, hudY - 16, 244, 30);

      ctx.fillStyle = "#888";
      ctx.fillText("CARRIER", shipHudX - 180, hudY);
      for (let i = 0; i < SHIP_MAX_HP; i++) {
        const bx = shipHudX - 170 + i * 17;
        ctx.fillStyle = i < shipHPRef.current ? "#5a9" : "#444";
        ctx.fillRect(bx, hudY - 12, 13, 10);
      }

      ctx.restore();

      rafRef.current = requestAnimationFrame(loop);
    };

    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, [shake, getWorldMouse]);

  return (
    <div
      ref={containerRef}
      className="relative w-screen h-screen select-none overflow-hidden"
      style={{
        transition: "transform 150ms cubic-bezier(0.22, 1, 0.36, 1)",
        cursor: "crosshair",
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />
      {!gameStarted && !gameOver && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.75)", cursor: "pointer" }}
          onClick={() => {
            gameStartedRef.current = true;
            setGameStarted(true);
            setShowHint(false);
            resetEnemies();
          }}
        >
          <div className="text-5xl font-bold tracking-widest uppercase mb-6" style={{ color: "#D93636", fontFamily: "var(--font-mono)" }}>
            CARRIER DEFENSE
          </div>
          <div className="max-w-md text-center space-y-3 mb-10" style={{ color: "#ccc", fontFamily: "var(--font-mono)", fontSize: "14px", lineHeight: "1.8" }}>
            <p><span style={{ color: "#D93636" }}>LEFT CLICK</span> — hold to fly toward cursor</p>
            <p><span style={{ color: "#D93636" }}>RIGHT CLICK</span> — fire projectiles</p>
            <p><span style={{ color: "#74b9ff" }}>A / D</span> — barrel roll left / right</p>
            <p><span style={{ color: "#74b9ff" }}>ESC</span> — pause</p>
            <p className="mt-4 opacity-70">Defend your carrier from enemy bombers and fighters. Dive underwater to evade — but you'll slow down.</p>
          </div>
          <div className="text-sm tracking-widest uppercase animate-pulse" style={{ color: "#f7d794", fontFamily: "var(--font-mono)" }}>
            Click anywhere to start
          </div>
        </div>
      )}
      {showHint && gameStarted && !gameOver && (
        <div
          className="absolute bottom-6 left-1/2 -translate-x-1/2 tracking-widest uppercase text-sm opacity-40 pointer-events-none"
          style={{ color: "var(--canvas)", fontFamily: "var(--font-mono)" }}
        >
          left click to move · right click to fire
        </div>
      )}
      {paused && !gameOver && (
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
          <div className="text-4xl font-bold tracking-widest uppercase mb-4" style={{ color: "#f7d794", fontFamily: "var(--font-mono)" }}>
            PAUSED
          </div>
          <div className="text-sm tracking-widest uppercase opacity-50" style={{ color: "#ccc", fontFamily: "var(--font-mono)" }}>
            Press ESC to resume
          </div>
        </div>
      )}
      {gameOver && (
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
          <div className="text-4xl font-bold tracking-widest uppercase mb-4" style={{ color: "#D93636", fontFamily: "var(--font-mono)" }}>
            GAME OVER
          </div>
          <div className="text-lg tracking-wider uppercase mb-8 opacity-70" style={{ color: "#ccc", fontFamily: "var(--font-mono)" }}>
            {gameOverReason}
          </div>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 text-sm tracking-widest uppercase border cursor-pointer"
            style={{
              color: "#D93636",
              borderColor: "#D93636",
              backgroundColor: "transparent",
              fontFamily: "var(--font-mono)",
            }}
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
};

export default Index;

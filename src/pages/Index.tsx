import { useEffect, useRef, useState, useCallback } from "react";
import {
  getWaterSurfaceY, isSubmerged, spawnSplash, updateParticles, drawWater,
  WATER_SPEED_FACTOR,
} from "../game/water";
import { createBoat, drawBoat, Boat } from "../game/boat";
import { updateEnemies, checkBulletCollisions, checkChaserBulletHitsPlayer, checkBombHitsShip, drawEnemies, spawnExplosion, resetEnemies } from "../game/enemies";

const SPEED = 4;
const TRI_SIZE = 20;
const GRAVITY = 0.12;
const MAX_FALL_SPEED = 7;
const FLOAT_DURATION = 1200; // ms of coasting before gravity dominates
const DRAG = 0.99; // momentum decay per frame (slower decay = longer coast)
const PLAYER_MAX_HP = 3;
const SHIP_MAX_HP = 10;
const PLAYER_LIVES = 3;
const INVULN_DURATION = 1500; // ms of invulnerability after hit
const BULLET_SPEED = 8;
const BULLET_RADIUS = 5;
const ROLL_DISTANCE = 60;
const ROLL_DURATION = 300; // ms

interface Bullet {
  x: number;
  y: number;
  dx: number;
  dy: number;
  id: number;
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
  const [gameOver, setGameOver] = useState(false);
  const [gameOverReason, setGameOverReason] = useState("");

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
        posRef.current = { x: canvas.width / 2, y: canvas.height / 2 };
      }
      boatRef.current = createBoat(canvas.width);
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
        const pos = posRef.current;
        const mouse = mouseRef.current;
        const angle = Math.atan2(mouse.y - pos.y, mouse.x - pos.x);
        bulletsRef.current.push({
          x: pos.x + Math.cos(angle) * (TRI_SIZE + 4),
          y: pos.y + Math.sin(angle) * (TRI_SIZE + 4),
          dx: Math.cos(angle) * BULLET_SPEED,
          dy: Math.sin(angle) * BULLET_SPEED,
          id: bulletIdRef.current++,
        });
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) keysRef.current.delete("w");
    };

    const onContextMenu = (e: Event) => e.preventDefault();

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === "a" || key === "d") {
        e.preventDefault();
        setShowHint(false);
        const roll = rollRef.current;
        if (!roll.active) {
          const pos = posRef.current;
          const mouse = mouseRef.current;
          const angle = Math.atan2(mouse.y - pos.y, mouse.x - pos.x);
          const dir = key === "a" ? -1 : 1;
          // Perpendicular to aim direction
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
      const { width: cw, height: ch } = canvas;
      const pos = posRef.current;
      const mouse = mouseRef.current;
      const angle = Math.atan2(mouse.y - pos.y, mouse.x - pos.x);

      // Barrel roll — lateral displacement is additive, not absolute
      const roll = rollRef.current;
      if (roll.active) {
        const elapsed = performance.now() - roll.startTime;
        const t = Math.min(elapsed / ROLL_DURATION, 1);
        const prevT = Math.max((elapsed - 16) / ROLL_DURATION, 0);
        // Ease out
        const ease = (v: number) => 1 - (1 - v) * (1 - v);
        const dt = ease(t) - ease(prevT);
        pos.x += roll.perpX * ROLL_DISTANCE * dt;
        pos.y += roll.perpY * ROLL_DISTANCE * dt;
        roll.spinAngle = roll.dir * Math.PI * 2 * ease(t);
        if (t >= 1) roll.active = false;
      }

      // Water submersion check
      const submerged = isSubmerged(pos.y, ch);
      const wasSubmerged = wasSubmergedRef.current;
      const speedMult = submerged ? WATER_SPEED_FACTOR : 1;

      // Splash on entry/exit
      if (submerged && !wasSubmerged) {
        const vy = pos.y - lastPosRef.current.y;
        spawnSplash(pos.x, getWaterSurfaceY(ch), vy, true);
      } else if (!submerged && wasSubmerged) {
        const vy = pos.y - lastPosRef.current.y;
        spawnSplash(pos.x, getWaterSurfaceY(ch), vy, false);
      }
      wasSubmergedRef.current = submerged;
      lastPosRef.current = { x: pos.x, y: pos.y };

      // Move toward mouse (always, including during roll)
      const isMoving = keysRef.current.has("w");
      const vel = velRef.current;
      if (isMoving) {
        // Recover throttle gradually from stall
        const stalling = floatTimerRef.current > FLOAT_DURATION;
        if (stalling && throttleRef.current < 1) {
          throttleRef.current = Math.min(throttleRef.current + 0.012, 1); // ~80 frames to full recovery
        } else if (!stalling) {
          throttleRef.current = 1;
        }

        const power = SPEED * speedMult * throttleRef.current;
        const dist = Math.hypot(mouse.x - pos.x, mouse.y - pos.y);
        if (dist > 5) {
          // Blend: current falling velocity lerps toward desired direction
          const targetVx = Math.cos(angle) * power;
          const targetVy = Math.sin(angle) * power;
          vel.x += (targetVx - vel.x) * (0.05 + throttleRef.current * 0.15);
          vel.y += (targetVy - vel.y) * (0.05 + throttleRef.current * 0.15);
        }
        pos.x += vel.x;
        pos.y += vel.y;

        // Only reset float timer once recovered
        if (throttleRef.current >= 0.95) {
          floatTimerRef.current = 0;
        }
        wasMovingRef.current = true;
      } else if (wasMovingRef.current) {
        // Coast: maintain momentum with drag, then gravity takes over
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

      // Clamp & collide
      let hitX = 0, hitY = 0;
      if (pos.x < TRI_SIZE) { pos.x = TRI_SIZE; hitX = -1; }
      if (pos.x > cw - TRI_SIZE) { pos.x = cw - TRI_SIZE; hitX = 1; }
      if (pos.y < TRI_SIZE) { pos.y = TRI_SIZE; hitY = -1; }
      if (pos.y > ch - TRI_SIZE) { pos.y = ch - TRI_SIZE; hitY = 1; }
      if (hitX) shake(hitX, 0);
      if (hitY) shake(0, hitY);

      // Update bullets
      bulletsRef.current = bulletsRef.current.filter((b) => {
        b.x += b.dx;
        b.y += b.dy;
        return b.x > -10 && b.x < cw + 10 && b.y > -10 && b.y < ch + 10;
      });

      // Update enemies & bombs (only after game starts)
      const boatX = boatRef.current ? boatRef.current.x : cw / 2;
      const boatW = boatRef.current ? boatRef.current.width : cw * 0.45;
      if (gameStartedRef.current) {
        updateEnemies(1 / 60, cw, ch, boatX, boatW, pos.x, pos.y);
        bulletsRef.current = checkBulletCollisions(bulletsRef.current);
      }

      // Enemy projectile collisions
      if (gameStartedRef.current && invulnRef.current > 0) {
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

      // Bomb-ship collisions
      const waterY = getWaterSurfaceY(ch);
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

      // Update water particles
      updateParticles(1 / 60);

      // Draw sunset sky gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, ch);
      skyGrad.addColorStop(0, "#0a0a1a");       // deep night
      skyGrad.addColorStop(0.35, "#1a1a3e");    // dark indigo
      skyGrad.addColorStop(0.55, "#2d4a6f");    // steel blue
      skyGrad.addColorStop(0.7, "#e8a838");     // amber gold
      skyGrad.addColorStop(0.78, "#f7d794");    // pale gold horizon
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, cw, ch);

      // Water (behind everything else)
      drawWater(ctx, cw, ch);

      // Enemies, bombs, explosions
      drawEnemies(ctx);

      // Boat (on top of water)
      if (boatRef.current) {
        drawBoat(ctx, boatRef.current, ch);
      }

      // Bullets
      ctx.fillStyle = "#D93636";
      for (const b of bulletsRef.current) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, BULLET_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }

      // Triangle pointing at mouse (flash when invulnerable)
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

      // HUD
      ctx.save();
      ctx.font = "bold 14px monospace";
      ctx.textAlign = "left";

      // Player lives & HP (top-left)
      const hudY = 28;
      const hudX = 16;
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(hudX - 4, hudY - 16, 200, 52);

      ctx.fillStyle = "#D93636";
      ctx.fillText("LIVES", hudX, hudY);
      for (let i = 0; i < PLAYER_LIVES; i++) {
        const lx = hudX + 60 + i * 22;
        if (i < playerLivesRef.current) {
          ctx.beginPath();
          ctx.moveTo(lx + 8, hudY - 5);
          ctx.lineTo(lx - 2, hudY - 10);
          ctx.lineTo(lx - 2, hudY);
          ctx.closePath();
          ctx.fillStyle = "#D93636";
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(lx + 8, hudY - 5);
          ctx.lineTo(lx - 2, hudY - 10);
          ctx.lineTo(lx - 2, hudY);
          ctx.closePath();
          ctx.fillStyle = "#444";
          ctx.fill();
        }
      }

      // HP bar
      ctx.fillStyle = "#aaa";
      ctx.fillText("HP", hudX, hudY + 22);
      for (let i = 0; i < PLAYER_MAX_HP; i++) {
        ctx.fillStyle = i < playerHPRef.current ? "#D93636" : "#444";
        ctx.fillRect(hudX + 30 + i * 18, hudY + 12, 14, 10);
      }

      // Ship HP (top-right)
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
  }, [shake]);

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
      {showHint && !gameOver && (
        <div
          className="absolute bottom-6 left-1/2 -translate-x-1/2 tracking-widest uppercase text-sm opacity-40 pointer-events-none"
          style={{ color: "var(--canvas)", fontFamily: "var(--font-mono)" }}
        >
          left click to move · right click to fire
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

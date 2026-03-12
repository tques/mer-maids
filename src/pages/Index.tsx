import { useEffect, useRef, useState, useCallback } from "react";
import {
  getWaterSurfaceY,
  isSubmerged,
  spawnSplash,
  updateParticles,
  drawWater,
  WATER_SPEED_FACTOR,
} from "../game/water";
import { createBoat, drawBoat, collideWithBoat, Boat } from "../game/boat";
import {
  updateEnemies,
  checkBulletCollisions,
  checkChaserBulletHitsPlayer,
  checkBombHitsShip,
  drawEnemies,
  spawnExplosion,
  resetEnemies,
  fleeAllEnemies,
} from "../game/enemies";
import { resetPowerups, checkScoreRewards, checkPowerupPickup, updatePowerups, drawPowerups } from "../game/powerups";
import {
  createWaveState,
  updateWave,
  getWaveDifficulty,
  drawWaveTransition,
  drawWaveHUD,
  WaveState,
} from "../game/waves";
import { resetJetTrail, spawnJetParticles, updateJetTrail, drawJetTrail, getShipPitch } from "../game/jettrail";
import { pollGamepad } from "../game/gamepad";

const SPEED = 5.5;              // was 4 — base thrust power increased 37%
const TRI_SIZE = 20;
const GRAVITY = 0.09;
const THRUST_GRAVITY = 0.014;   // was 0.018 — less drag while thrusting
const CLIMB_PENALTY = 0.18;     // was 0.20 — climbing slightly easier
const DIVE_BOOST = 0.15;
const MAX_FALL_SPEED = 7;
const AIR_DRAG = 0.995;
const BUOYANCY = 0.14;         // upward force when submerged
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
const MAX_AMMO = 60;
const AMMO_LOW_THRESHOLD = 12;
const AMMO_BOX_SIZE = 22;
const MAX_FUEL = 50;
const FUEL_BURN_RATE = 8; // fuel/sec while flying
const FUEL_REFILL_RATE = 25; // fuel/sec while submerged
const FUEL_LOW_THRESHOLD = 25;

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
  const rollRef = useRef<{
    active: boolean;
    dir: -1 | 1;
    startTime: number;
    startX: number;
    startY: number;
    perpX: number;
    perpY: number;
    spinAngle: number;
  }>({ active: false, dir: 1, startTime: 0, startX: 0, startY: 0, perpX: 0, perpY: 0, spinAngle: 0 });
  const rightMouseRef = useRef(false);
  const shootCooldownRef = useRef(0);
  const SHOOT_INTERVAL = 280;
  const wasSubmergedRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const boatRef = useRef<Boat | null>(null);
  const velRef = useRef({ x: 0, y: 0 });
  const gpDpadPrev = useRef({ left: false, right: false });
  const gpStartPrev = useRef(false);
  const gpFaceAPrev = useRef(false);
  const gpDpadUpPrev = useRef(false);
  const gpDpadDownPrev = useRef(false);
  
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
  const ammoBoxAlertRef = useRef(0);
  const scoreRef = useRef(0);
  const waveRef = useRef<WaveState>(createWaveState());
  const fuelRef = useRef(MAX_FUEL);
  const [paused, setPaused] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [gameOverReason, setGameOverReason] = useState("");
  const [useRightStick, setUseRightStick] = useState(false);
  const useRightStickRef = useRef(false);
  const [pauseMenuIndex, setPauseMenuIndex] = useState(0);
  const pauseMenuIndexRef = useRef(0);
  const gamepadAimingRef = useRef(false); // true when gamepad stick was last used for aiming
  const lastGamepadAngleRef = useRef(0); // remember last stick angle when stick returns to center
  const loopRef = useRef<(() => void) | null>(null);

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
    setTimeout(() => {
      el.style.transform = "translate(0,0)";
    }, 150);
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
        const surfaceY = getWaterSurfaceY(viewH);
        // Start in the water, to the side of the city
        posRef.current = { x: WORLD_WIDTH / 2 - 420, y: surfaceY + 30 };
      }
      boatRef.current = createBoat(WORLD_WIDTH);
      mouseRef.current = { x: canvas.width / 2, y: canvas.height / 2 };
    };
    resize();
    window.addEventListener("resize", resize);

    const onMouseMove = (e: MouseEvent) => {
      if (gamepadAimingRef.current) return; // ignore mouse movement while gamepad is active
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onMouseClick = () => {
      // Any mouse click re-enables mouse aiming
      gamepadAimingRef.current = false;
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

      // Poll gamepad
      const gp = pollGamepad();

      // World-space mouse
      const camX = pos.x - viewW / 2;
      const wmx = mouseRef.current.x / ZOOM + camX;
      const wmy = mouseRef.current.y / ZOOM;

      // Gamepad menu controls (edge-triggered)
      const startPressed = gp.start && !gpStartPrev.current;
      const faceAPressed = gp.faceA && !gpFaceAPrev.current;
      gpStartPrev.current = gp.start;
      gpFaceAPrev.current = gp.faceA;

      // Start button → toggle pause (only in-game)
      if (startPressed && gameStartedRef.current && !gameOverRef.current) {
        pausedRef.current = !pausedRef.current;
        setPaused(pausedRef.current);
        if (pausedRef.current) {
          // Reset pause menu
          pauseMenuIndexRef.current = 0;
          setPauseMenuIndex(0);
        }
        if (!pausedRef.current) {
          rafRef.current = requestAnimationFrame(loop);
        }
        return; // skip this frame
      }

      // Handle pause menu navigation with gamepad
      const PAUSE_MENU_COUNT = 3;
      if (pausedRef.current && gp.connected) {
        const dpadUpPressed = gp.dpadUp && !gpDpadUpPrev.current;
        const dpadDownPressed = gp.dpadDown && !gpDpadDownPrev.current;
        gpDpadUpPrev.current = gp.dpadUp;
        gpDpadDownPrev.current = gp.dpadDown;

        if (dpadUpPressed) {
          const newIdx = (pauseMenuIndexRef.current - 1 + PAUSE_MENU_COUNT) % PAUSE_MENU_COUNT;
          pauseMenuIndexRef.current = newIdx;
          setPauseMenuIndex(newIdx);
        }
        if (dpadDownPressed) {
          const newIdx = (pauseMenuIndexRef.current + 1) % PAUSE_MENU_COUNT;
          pauseMenuIndexRef.current = newIdx;
          setPauseMenuIndex(newIdx);
        }

        if (faceAPressed) {
          if (pauseMenuIndexRef.current === 0) {
            pausedRef.current = false;
            setPaused(false);
            rafRef.current = requestAnimationFrame(loop);
          } else if (pauseMenuIndexRef.current === 1) {
            const newVal = !useRightStickRef.current;
            useRightStickRef.current = newVal;
            setUseRightStick(newVal);
          } else if (pauseMenuIndexRef.current === 2) {
            window.location.reload();
          }
        }
        // Don't process game logic while paused
        return;
      } else {
        gpDpadUpPrev.current = gp.dpadUp;
        gpDpadDownPrev.current = gp.dpadDown;
      }

      // Determine which stick to use for aiming based on preference
      const aimStickX = useRightStickRef.current ? gp.rightStickX : gp.stickX;
      const aimStickY = useRightStickRef.current ? gp.rightStickY : gp.stickY;
      const aimStickActive = useRightStickRef.current ? gp.rightStickActive : gp.stickActive;

      // Angle: prefer gamepad stick if active, keep last gamepad angle if in gamepad mode, otherwise mouse
      let angle: number;
      if (aimStickActive) {
        gamepadAimingRef.current = true;
        angle = Math.atan2(aimStickY, aimStickX);
        lastGamepadAngleRef.current = angle;
      } else if (gamepadAimingRef.current) {
        // Stick released but still in gamepad mode — keep last angle
        angle = lastGamepadAngleRef.current;
      } else {
        angle = Math.atan2(wmy - pos.y, wmx - pos.x);
      }

      // Gamepad d-pad → barrel rolls (edge-triggered)
      const prevDpad = gpDpadPrev.current;
      if (gp.dpadLeft && !prevDpad.left && !rollRef.current.active) {
        const perpX = -Math.sin(angle) * -1;
        const perpY = Math.cos(angle) * -1;
        const r = rollRef.current;
        r.active = true; r.dir = -1; r.startTime = performance.now();
        r.startX = pos.x; r.startY = pos.y; r.perpX = perpX; r.perpY = perpY; r.spinAngle = 0;
      }
      if (gp.dpadRight && !prevDpad.right && !rollRef.current.active) {
        const perpX = -Math.sin(angle) * 1;
        const perpY = Math.cos(angle) * 1;
        const r = rollRef.current;
        r.active = true; r.dir = 1; r.startTime = performance.now();
        r.startX = pos.x; r.startY = pos.y; r.perpX = perpX; r.perpY = perpY; r.spinAngle = 0;
      }
      gpDpadPrev.current = { left: gp.dpadLeft, right: gp.dpadRight };

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

      // Fuel system: refill when submerged, burn when flying
      const dt = 1 / 60;
      if (submerged) {
        fuelRef.current = Math.min(fuelRef.current + FUEL_REFILL_RATE * dt, MAX_FUEL);
      }

      // Move toward world-space mouse or gamepad stick
      if (gp.thrust || gp.fire) gamepadAimingRef.current = true;
      const isMoving = keysRef.current.has("w") || gp.thrust;
      const hasFuel = fuelRef.current > 0;
      const vel = velRef.current;
      if (isMoving && hasFuel) {
        // Burn fuel when flying (not submerged)
        if (!submerged) {
          fuelRef.current = Math.max(fuelRef.current - FUEL_BURN_RATE * dt, 0);
        }

        throttleRef.current = Math.min(throttleRef.current + 0.04, 1);

        // Gravity-affected flight: climbing is harder, diving is easier
        const verticalComponent = Math.sin(angle);
        let gravityMod = 1.0;
        if (!submerged) {
          if (verticalComponent < 0) {
            gravityMod = 1.0 - CLIMB_PENALTY * Math.abs(verticalComponent);
          } else {
            gravityMod = 1.0 + DIVE_BOOST * verticalComponent;
          }
        }

        const power = SPEED * speedMult * throttleRef.current * gravityMod;
        const dist = Math.hypot(wmx - pos.x, wmy - pos.y);
        if (dist > 5) {
          const targetVx = Math.cos(angle) * power;
          const targetVy = Math.sin(angle) * power;
          vel.x += (targetVx - vel.x) * (0.05 + throttleRef.current * 0.15);
          vel.y += (targetVy - vel.y) * (0.05 + throttleRef.current * 0.15);
        }

        // Passive gravity even while thrusting
        if (!submerged) {
          vel.y += THRUST_GRAVITY;
        }

        // Buoyancy when submerged — push toward surface
        if (submerged) {
          const surfaceY = getWaterSurfaceY(viewH);
          const depth = pos.y - surfaceY;
          const buoyancyForce = BUOYANCY * Math.min(depth / 40, 1);
          vel.y -= buoyancyForce;
        }

        pos.x += vel.x;
        pos.y += vel.y;

        // Spawn jet trail when moving
        spawnJetParticles(pos.x, pos.y, angle, throttleRef.current, submerged, fuelRef.current, MAX_FUEL);

        wasMovingRef.current = true;
      } else {
        // Not thrusting — natural gravity + air drag, more momentum retained
        throttleRef.current = Math.max(throttleRef.current - 0.03, 0);

        vel.x *= AIR_DRAG;
        vel.y *= AIR_DRAG;

        // Gravity in air, buoyancy in water
        if (!submerged) {
          vel.y = Math.min(vel.y + GRAVITY, MAX_FALL_SPEED);
        } else {
          const surfaceY = getWaterSurfaceY(viewH);
          const depth = pos.y - surfaceY;
          const buoyancyForce = BUOYANCY * Math.min(depth / 40, 1);
          vel.y -= buoyancyForce;
          // Water drag (heavier than air)
          vel.x *= 0.97;
          vel.y *= 0.97;
        }

        pos.x += vel.x;
        pos.y += vel.y;

        if (Math.abs(vel.x) < 0.01 && Math.abs(vel.y) < 0.01 && !submerged) {
          wasMovingRef.current = false;
        }
      }

      // Horizontal wrapping in world space
      pos.x = ((pos.x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;

      // Vertical clamp
      let hitY = 0;
      if (pos.y < TRI_SIZE) {
        pos.y = TRI_SIZE;
        hitY = -1;
      }
      if (pos.y > viewH - TRI_SIZE) {
        pos.y = viewH - TRI_SIZE;
        hitY = 1;
      }
      if (hitY) shake(0, hitY);

      // Recalculate camera after position update
      const finalCamX = pos.x - viewW / 2;

      // Continuous fire (ammo gated) — mouse right-click or gamepad buttons
      if ((rightMouseRef.current || gp.fire) && ammoRef.current > 0) {
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
        const wave = waveRef.current;
        const waveDiff = getWaveDifficulty(wave.wave);

        // Update wave system
        const waveResult = updateWave(wave, 1 / 60, scoreRef.current);
        if (waveResult.waveCompleted) {
          fleeAllEnemies();
        }
        if (waveResult.newLife) {
          playerLivesRef.current = Math.min(playerLivesRef.current + 1, PLAYER_LIVES + 5);
          playerHPRef.current = PLAYER_MAX_HP;
        }
        if (waveResult.startNextWave) {
          resetEnemies();
          resetPowerups();
        }

        updateEnemies(1 / 60, WORLD_WIDTH, viewH, boatX, boatW, pos.x, pos.y, viewW / 2, waveDiff, wave.enemiesFleeing);
        const result = checkBulletCollisions(bulletsRef.current);
        bulletsRef.current = result.remaining;
        scoreRef.current += result.score;
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
            setGameOverReason("City destroyed!");
          }
        }

        // Boat collision
        if (boatRef.current) {
          const pushOut = collideWithBoat(pos.x, pos.y, TRI_SIZE, boatRef.current, viewH);
          if (pushOut) {
            pos.x = pushOut.x;
            pos.y = pushOut.y;
            velRef.current.x *= 0.3;
            velRef.current.y *= -0.5;
          }
        }

        // Powerup rewards based on score
        checkScoreRewards(scoreRef.current, boatX, boatW, viewH);
        updatePowerups();

        // Powerup pickup
        const pickedUp = checkPowerupPickup(pos.x, pos.y, TRI_SIZE);
        if (pickedUp === "health") {
          playerHPRef.current = Math.min(playerHPRef.current + 1, PLAYER_MAX_HP);
        } else if (pickedUp === "repair") {
          shipHPRef.current = Math.min(shipHPRef.current + 3, SHIP_MAX_HP);
        }
      }

      // === AMMO BOX SYSTEM ===
      if (gameStartedRef.current) {
        if (ammoRef.current <= AMMO_LOW_THRESHOLD && !ammoBoxRef.current) {
          const edgeX = Math.random() < 0.5 ? 20 : WORLD_WIDTH - 20;
          const surfY = getWaterSurfaceY(viewH);
          const boxY = 40 + Math.random() * (surfY - 80);
          ammoBoxRef.current = { x: edgeX, y: boxY, spawnTime: performance.now() };
          ammoBoxAlertRef.current = 3000;
        }

        if (ammoBoxAlertRef.current > 0) {
          ammoBoxAlertRef.current -= 16;
        }

        const box = ammoBoxRef.current;
        if (box) {
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

      // Update water particles and jet trail
      updateParticles(1 / 60);
      updateJetTrail(1 / 60);

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

        // Powerups
        drawPowerups(ctx);

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
          const bw = 3,
            bh = 10;
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
          // "Ammo" label
          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;
          ctx.fillStyle = "#fff";
          ctx.font = "bold 8px monospace";
          ctx.textAlign = "center";
          ctx.fillText("Ammo", 0, -s / 2 - 6);
          ctx.restore();
        }

        // Player triangle
        const isInvuln = invulnRef.current > 0;
        const showPlayer = !isInvuln || Math.floor(performance.now() / 80) % 2 === 0;
        if (showPlayer) {
          const pitchOffset = getShipPitch(throttleRef.current, keysRef.current.has("w"), velRef.current.y, isSubmerged(pos.y, viewH));
          ctx.save();
          ctx.translate(pos.x, pos.y);
          ctx.rotate(angle + pitchOffset);

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

          // Mech arch/crescent shape
          const r = TRI_SIZE * 0.9;
          ctx.beginPath();
          ctx.arc(0, 0, r, -Math.PI * 0.55, Math.PI * 0.55, false);
          ctx.lineTo(r * 0.3, TRI_SIZE * 0.35);
          ctx.arc(0, 0, r * 0.45, Math.PI * 0.4, -Math.PI * 0.4, true);
          ctx.lineTo(r * Math.cos(Math.PI * 0.55), -r * Math.sin(Math.PI * 0.55));
          ctx.closePath();
          ctx.fillStyle = isInvuln ? "#ff8888" : "#D93636";
          ctx.fill();
          // Visor / eye slit
          ctx.beginPath();
          ctx.arc(r * 0.35, 0, r * 0.12, 0, Math.PI * 2);
          ctx.fillStyle = isInvuln ? "#ffaaaa" : "#ff6b6b";
          ctx.fill();

          ctx.shadowColor = "transparent";
          ctx.restore();
        }

        // Jet trail (drawn behind player, within world offset)
        drawJetTrail(ctx);

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
      ctx.fillRect(hudX - 4, hudY - 16, 200, 96);

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

      // Fuel counter
      const fuel = fuelRef.current;
      const fuelColor = fuel <= FUEL_LOW_THRESHOLD ? "#74b9ff" : "#aaa";
      ctx.fillStyle = fuelColor;
      ctx.fillText("FUEL", hudX, hudY + 66);
      const fuelBarW = 120;
      const fuelFill = (fuel / MAX_FUEL) * fuelBarW;
      ctx.fillStyle = "#333";
      ctx.fillRect(hudX + 50, hudY + 56, fuelBarW, 10);
      ctx.fillStyle = fuel <= FUEL_LOW_THRESHOLD ? "#74b9ff" : "#0984e3";
      ctx.fillRect(hudX + 50, hudY + 56, fuelFill, 10);
      ctx.fillStyle = fuelColor;
      ctx.font = "bold 11px monospace";
      ctx.fillText(`${Math.ceil(fuel)}`, hudX + 50 + fuelBarW + 6, hudY + 66);
      ctx.font = "bold 14px monospace";

      // Ammo box alert
      if (ammoBoxRef.current && ammoBoxAlertRef.current > 0) {
        const flash = Math.sin(performance.now() / 200) > 0;
        if (flash) {
          ctx.fillStyle = "#f0c830";
          ctx.fillText("▼ AMMO CRATE SPAWNED ▼", hudX, hudY + 86);
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
      ctx.fillText("CITY BARRIER", shipHudX - 180, hudY);
      for (let i = 0; i < SHIP_MAX_HP; i++) {
        const bx = shipHudX - 170 + i * 17;
        ctx.fillStyle = i < shipHPRef.current ? "#5a9" : "#444";
        ctx.fillRect(bx, hudY - 12, 13, 10);
      }

      // Score display
      ctx.fillStyle = "#f7d794";
      ctx.font = "bold 18px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`SCORE: ${scoreRef.current}`, cw / 2, 30);

      // Wave HUD
      drawWaveHUD(ctx, waveRef.current, cw);

      ctx.restore();

      // Wave transition overlay (drawn after HUD restore, in screen space)
      drawWaveTransition(ctx, waveRef.current, cw, ch);

      rafRef.current = requestAnimationFrame(loop);
    };

    // Store loop in ref so menu poll can restart it
    loopRef.current = loop;

    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("click", onMouseClick);
    canvas.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("click", onMouseClick);
      canvas.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafRef.current);
      loopRef.current = null;
    };
  }, [shake, getWorldMouse]);

  // Gamepad polling for menus (when game loop isn't running)
  useEffect(() => {
    let rafId = 0;
    const pollMenuGamepad = () => {
      const gp = pollGamepad();
      const faceAPressed = gp.faceA && !gpFaceAPrev.current;
      const startPressed = gp.start && !gpStartPrev.current;
      gpFaceAPrev.current = gp.faceA;
      gpStartPrev.current = gp.start;

      // Start screen: A or Start to begin
      if (!gameStartedRef.current && !gameOverRef.current && (faceAPressed || startPressed)) {
        gameStartedRef.current = true;
        setGameStarted(true);
        setShowHint(false);
        scoreRef.current = 0;
        waveRef.current = createWaveState();
        resetEnemies();
        resetPowerups();
        resetJetTrail();
        fuelRef.current = MAX_FUEL;
      }

      // Game over: A to restart
      if (gameOverRef.current && faceAPressed) {
        window.location.reload();
      }

      // Paused: handled in game loop above
      // But we need to keep polling when paused since game loop stops
      if (pausedRef.current && gp.connected) {
        const PAUSE_MENU_COUNT = 3;
        const dpadUpPressed = gp.dpadUp && !gpDpadUpPrev.current;
        const dpadDownPressed = gp.dpadDown && !gpDpadDownPrev.current;
        gpDpadUpPrev.current = gp.dpadUp;
        gpDpadDownPrev.current = gp.dpadDown;

        if (dpadUpPressed) {
          const newIdx = (pauseMenuIndexRef.current - 1 + PAUSE_MENU_COUNT) % PAUSE_MENU_COUNT;
          pauseMenuIndexRef.current = newIdx;
          setPauseMenuIndex(newIdx);
        }
        if (dpadDownPressed) {
          const newIdx = (pauseMenuIndexRef.current + 1) % PAUSE_MENU_COUNT;
          pauseMenuIndexRef.current = newIdx;
          setPauseMenuIndex(newIdx);
        }

        if (faceAPressed) {
          if (pauseMenuIndexRef.current === 0) {
            pausedRef.current = false;
            setPaused(false);
            if (loopRef.current) rafRef.current = requestAnimationFrame(loopRef.current);
          } else if (pauseMenuIndexRef.current === 1) {
            const newVal = !useRightStickRef.current;
            useRightStickRef.current = newVal;
            setUseRightStick(newVal);
          } else if (pauseMenuIndexRef.current === 2) {
            window.location.reload();
          }
        }

        if (startPressed) {
          pausedRef.current = false;
          setPaused(false);
          if (loopRef.current) rafRef.current = requestAnimationFrame(loopRef.current);
        }
      }

      rafId = requestAnimationFrame(pollMenuGamepad);
    };
    rafId = requestAnimationFrame(pollMenuGamepad);
    return () => cancelAnimationFrame(rafId);
  }, []);

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
            scoreRef.current = 0;
            waveRef.current = createWaveState();
            resetEnemies();
            resetPowerups();
            resetJetTrail();
            fuelRef.current = MAX_FUEL;
          }}
        >
          <div
            className="text-5xl font-bold tracking-widest uppercase mb-4"
            style={{ color: "#D93636", fontFamily: "var(--font-mono)" }}
          >
            M.E.R. MAIDS
          </div>
          <div
            className="text-sm tracking-wider uppercase mb-8 opacity-60"
            style={{ color: "#f7d794", fontFamily: "var(--font-mono)" }}
          >
            Protect your carrier. Survive the waves.
          </div>

          <div className="max-w-lg text-center mb-8" style={{ fontFamily: "var(--font-mono)" }}>
            {/* Objective */}
            <div className="mb-6 px-4 py-3 rounded" style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
              <div className="text-xs tracking-widest uppercase mb-2" style={{ color: "#f7d794" }}>OBJECTIVE</div>
              <p className="text-sm leading-relaxed" style={{ color: "#ccc" }}>
                Enemy bombers and fighters attack in waves. Shoot them down before they destroy your carrier.
                If the carrier is destroyed or you lose all lives, it's game over.
              </p>
            </div>

            {/* Mechanics */}
            <div className="mb-6 px-4 py-3 rounded" style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
              <div className="text-xs tracking-widest uppercase mb-2" style={{ color: "#74b9ff" }}>KEY MECHANICS</div>
              <div className="text-sm leading-relaxed space-y-1" style={{ color: "#ccc" }}>
                <p><span style={{ color: "#74b9ff" }}>FUEL</span> — Flying burns fuel. <span style={{ color: "#74b9ff" }}>Dive underwater</span> to refuel.</p>
                <p><span style={{ color: "#f0c830" }}>AMMO</span> — Limited ammo. Collect <span style={{ color: "#f0c830" }}>ammo crates</span> that drop during combat.</p>
                <p><span style={{ color: "#5a9" }}>BARREL ROLL</span> — Dodge enemy fire with a quick lateral roll.</p>
              </div>
            </div>

            {/* Controls in two columns */}
            <div className="flex gap-4 text-left text-xs" style={{ color: "#999" }}>
              <div className="flex-1 px-3 py-2 rounded" style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                <div className="tracking-widest uppercase mb-2" style={{ color: "#D93636", fontSize: "10px" }}>MOUSE / KEYBOARD</div>
                <p><span style={{ color: "#ccc" }}>Left Click</span> — Thrust</p>
                <p><span style={{ color: "#ccc" }}>Right Click</span> — Fire</p>
                <p><span style={{ color: "#ccc" }}>A / D</span> — Barrel Roll</p>
                <p><span style={{ color: "#ccc" }}>ESC</span> — Pause</p>
              </div>
              <div className="flex-1 px-3 py-2 rounded" style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                <div className="tracking-widest uppercase mb-2" style={{ color: "#D93636", fontSize: "10px" }}>GAMEPAD</div>
                <p><span style={{ color: "#ccc" }}>Stick</span> — Aim</p>
                <p><span style={{ color: "#ccc" }}>Y / LB / LT</span> — Thrust</p>
                <p><span style={{ color: "#ccc" }}>A / B / X / RB / RT</span> — Fire</p>
                <p><span style={{ color: "#ccc" }}>D-Pad ◄►</span> — Barrel Roll</p>
                <p><span style={{ color: "#ccc" }}>Start</span> — Pause</p>
              </div>
            </div>
          </div>

          <div
            className="text-sm tracking-widest uppercase animate-pulse"
            style={{ color: "#f7d794", fontFamily: "var(--font-mono)" }}
          >
            Click anywhere or press A to start
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
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        >
          <div
            className="text-4xl font-bold tracking-widest uppercase mb-8"
            style={{ color: "#f7d794", fontFamily: "var(--font-mono)" }}
          >
            PAUSED
          </div>
          <div className="flex flex-col items-center gap-4 mb-6">
            <button
              onClick={() => {
                pausedRef.current = false;
                setPaused(false);
                if (loopRef.current) rafRef.current = requestAnimationFrame(loopRef.current);
              }}
              className="px-6 py-3 text-sm tracking-widest uppercase border cursor-pointer"
              style={{
                color: pauseMenuIndex === 0 ? "#f7d794" : "#888",
                borderColor: pauseMenuIndex === 0 ? "#f7d794" : "#555",
                backgroundColor: pauseMenuIndex === 0 ? "rgba(247,215,148,0.1)" : "transparent",
                fontFamily: "var(--font-mono)",
                minWidth: "280px",
              }}
            >
              {pauseMenuIndex === 0 ? "► " : "  "}Resume
            </button>
            <button
              onClick={() => {
                const newVal = !useRightStick;
                useRightStickRef.current = newVal;
                setUseRightStick(newVal);
              }}
              className="px-6 py-3 text-sm tracking-widest uppercase border cursor-pointer"
              style={{
                color: pauseMenuIndex === 1 ? "#f7d794" : "#888",
                borderColor: pauseMenuIndex === 1 ? "#f7d794" : "#555",
                backgroundColor: pauseMenuIndex === 1 ? "rgba(247,215,148,0.1)" : "transparent",
                fontFamily: "var(--font-mono)",
                minWidth: "280px",
              }}
            >
              {pauseMenuIndex === 1 ? "► " : "  "}Stick: {useRightStick ? "RIGHT" : "LEFT"}
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 text-sm tracking-widest uppercase border cursor-pointer"
              style={{
                color: pauseMenuIndex === 2 ? "#D93636" : "#888",
                borderColor: pauseMenuIndex === 2 ? "#D93636" : "#555",
                backgroundColor: pauseMenuIndex === 2 ? "rgba(217,54,54,0.1)" : "transparent",
                fontFamily: "var(--font-mono)",
                minWidth: "280px",
              }}
            >
              {pauseMenuIndex === 2 ? "► " : "  "}Restart
            </button>
          </div>
          <div
            className="text-xs tracking-widest uppercase opacity-40"
            style={{ color: "#ccc", fontFamily: "var(--font-mono)" }}
          >
            ESC / START to resume · D-PAD to navigate · A to select
          </div>
        </div>
      )}
      {gameOver && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
        >
          <div
            className="text-4xl font-bold tracking-widest uppercase mb-4"
            style={{ color: "#D93636", fontFamily: "var(--font-mono)" }}
          >
            GAME OVER
          </div>
          <div
            className="text-lg tracking-wider uppercase mb-2 opacity-70"
            style={{ color: "#ccc", fontFamily: "var(--font-mono)" }}
          >
            {gameOverReason}
          </div>
          <div
            className="text-sm tracking-wider mb-2 opacity-50"
            style={{ color: "#aaa", fontFamily: "var(--font-mono)" }}
          >
            Survived to Wave {waveRef.current.wave}
          </div>
          <div
            className="text-2xl font-bold tracking-widest mb-8"
            style={{ color: "#f7d794", fontFamily: "var(--font-mono)" }}
          >
            SCORE: {scoreRef.current}
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
            Try Again (A)
          </button>
        </div>
      )}
    </div>
  );
};

export default Index;

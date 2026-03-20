import { useEffect, useRef, useState, useCallback } from "react";
import {
  getWaterSurfaceY,
  getWaveY,
  isSubmerged,
  spawnSplash,
  updateParticles,
  drawWater,
  WATER_SPEED_FACTOR,
} from "../game/water";
import { createCities, drawBoat, collideWithBoat, getBoatTopY, Boat } from "../game/boat";
import {
  updateEnemies,
  checkBulletCollisions,
  checkRamCollisions,
  checkChaserBulletHitsPlayer,
  checkMissileHitsPlayer,
  deflectMissiles,
  checkBombHitsShip,
  drawEnemies,
  spawnExplosion,
  resetEnemies,
  fleeAllEnemies,
  setBomberTargetCity,
  getBomberTargetCityIndex,
  getLastBomberSpawnTime,
} from "../game/enemies";
import {
  resetSubmarines,
  updateSubmarinesWithDamage,
  checkBulletHitsSubmarine,
  drawSubmarines,
  fleeSubmarines,
  getSubmarines,
} from "../game/submarine";
import {
  resetPickups,
  checkScoreRewards,
  checkPowerupPickup,
  updatePowerups,
  drawPickups,
  drawAmmoDepots,
  updateAmmoCrate,
  updateAmmoDrop,
  drawAmmoCrateAlert,
  getAmmoCrateAlert,
  collideWithDepot,
  MAX_AMMO,
  AMMO_LOW_THRESHOLD,
  AMMO_BOX_SIZE,
} from "../game/pickups";
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
import {
  resetGunboats,
  updateGunboats,
  checkBulletHitsGunboat,
  checkGunboatBulletHitsPlayer,
  checkRamGunboat,
  drawGunboats,
  fleeGunboats,
} from "../game/gunboat";
import {
  resetMinelayer,
  updateMinelayer,
  checkBulletHitsMine,
  checkMineHitsPlayer,
  checkRamMine,
  drawMinelayer,
  fleeMinelayers,
} from "../game/minelayer";

const SPEED = 7;
const TRI_SIZE = 20;
const GRAVITY = 0.09;
const THRUST_GRAVITY = 0.014;
const CLIMB_PENALTY = 0.18;
const DIVE_BOOST = 0.15;
const MAX_FALL_SPEED = 7;
const AIR_DRAG = 0.995;
const BUOYANCY = 0.07;
const PLAYER_MAX_HP = 3;
const SHIP_MAX_HP = 10;
const PLAYER_LIVES = 3;
const INVULN_DURATION = 1500;
const BULLET_SPEED = 8;
const BULLET_RADIUS = 5;
const ROLL_DISTANCE = 60;
const ROLL_FUEL_COST = 5;
const ROLL_DURATION = 300;
const WORLD_WIDTH = 9000; // 3x wider for 3 cities
const ZOOM = 1.4;
const MAX_FUEL = 50;
const FUEL_BURN_RATE = 8;
const FUEL_REFILL_RATE = 25;
const FUEL_LOW_THRESHOLD = 25;
const NUM_CITIES = 3;

interface Bullet {
  x: number;
  y: number;
  dx: number;
  dy: number;
  id: number;
}

// Per-city HP state
interface CityState {
  hp: number;
  maxHp: number;
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
  const citiesRef = useRef<Boat[]>([]);
  const cityHPRef = useRef<CityState[]>([]);
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
  const invulnRef = useRef(0);
  const gameOverRef = useRef(false);
  const pausedRef = useRef(false);
  const ammoRef = useRef(MAX_AMMO);
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
  const [musicVolume, setMusicVolume] = useState(0.4);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const gamepadAimingRef = useRef(false);
  const lastGamepadAngleRef = useRef(0);
  const loopRef = useRef<(() => void) | null>(null);
  const boostRef = useRef<{ active: boolean; lockedAngle: number }>({ active: false, lockedAngle: 0 });
  const showFpsRef = useRef(false);
  const fpsFramesRef = useRef(0);
  const fpsLastTimeRef = useRef(performance.now());
  const fpsDisplayRef = useRef(0);
  const lastFrameTimeRef = useRef(performance.now());

  // Bomber target city index (for HUD display)
  const bomberTargetRef = useRef(0);

  const getWorldMouse = useCallback(() => {
    const mouse = mouseRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return { x: mouse.x, y: mouse.y };
    const viewW = canvas.width / ZOOM;
    const camX = posRef.current.x - viewW / 2;
    return { x: mouse.x / ZOOM + camX, y: mouse.y / ZOOM };
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
        posRef.current = { x: WORLD_WIDTH / 2 - 420, y: surfaceY + 30 };
      }
      // Create 3 cities
      const cities = createCities(WORLD_WIDTH);
      citiesRef.current = cities;
      if (cityHPRef.current.length === 0) {
        cityHPRef.current = cities.map(() => ({ hp: SHIP_MAX_HP, maxHp: SHIP_MAX_HP }));
      }
      mouseRef.current = { x: canvas.width / 2, y: canvas.height / 2 };
    };
    resize();
    window.addEventListener("resize", resize);

    const audio = new Audio("/audio/background-music.mp3");
    audio.loop = true;
    audio.volume = 0.0;
    musicRef.current = audio;

    const onMouseMove = (e: MouseEvent) => {
      if (gamepadAimingRef.current) return;
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onMouseClick = () => {
      gamepadAimingRef.current = false;
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        setShowHint(false);
        keysRef.current.add("thrust");
      } else if (e.button === 2) {
        e.preventDefault();
        setShowHint(false);
        rightMouseRef.current = true;
        shootCooldownRef.current = 0;
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) keysRef.current.delete("thrust");
      if (e.button === 2) rightMouseRef.current = false;
    };
    const onContextMenu = (e: Event) => e.preventDefault();
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key;
      if (key === "End") {
        showFpsRef.current = !showFpsRef.current;
        return;
      }
      if (key === "F11") {
        e.preventDefault();
        if (!document.fullscreenElement) containerRef.current?.requestFullscreen().catch(() => {});
        else document.exitFullscreen().catch(() => {});
        return;
      }
      const lkey = key.toLowerCase();
      if (lkey === "escape" && gameStartedRef.current && !gameOverRef.current) {
        pausedRef.current = !pausedRef.current;
        setPaused(pausedRef.current);
        if (!pausedRef.current) rafRef.current = requestAnimationFrame(loop);
        return;
      }
      if (key === "w") {
        e.preventDefault();
        setShowHint(false);
        keysRef.current.add("w");
      }
      if (key === "a" || key === "d") {
        e.preventDefault();
        setShowHint(false);
        const roll = rollRef.current;
        const fuel = fuelRef.current;
        if (!roll.active && fuel >= ROLL_FUEL_COST) {
          fuelRef.current -= ROLL_FUEL_COST;
          const pos = posRef.current;
          const wm = getWorldMouse();
          const angle = Math.atan2(wm.y - pos.y, wm.x - pos.x);
          const dir = key === "a" ? -1 : 1;
          const scaleFactor = 3;
          const perpX = -Math.sin(angle) * dir * scaleFactor;
          const perpY = Math.cos(angle) * dir * scaleFactor;
          roll.active = true;
          roll.dir = dir as -1 | 1;
          roll.startTime = performance.now();
          roll.startX = pos.x;
          roll.startY = pos.y;
          roll.perpX = perpX;
          roll.perpY = perpY;
          roll.spinAngle = 0;
          deflectMissiles();
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

      fpsFramesRef.current++;
      const now = performance.now();
      if (now - fpsLastTimeRef.current >= 1000) {
        fpsDisplayRef.current = fpsFramesRef.current;
        fpsFramesRef.current = 0;
        fpsLastTimeRef.current = now;
      }
      const frameDelta = Math.min(now - lastFrameTimeRef.current, 50);
      lastFrameTimeRef.current = now;
      const dtScale = frameDelta / (1000 / 60);
      const { width: cw, height: ch } = canvas;
      const viewW = cw / ZOOM;
      const viewH = ch / ZOOM;
      const pos = posRef.current;

      const gp = pollGamepad();
      const camX = pos.x - viewW / 2;
      const wmx = mouseRef.current.x / ZOOM + camX;
      const wmy = mouseRef.current.y / ZOOM;

      const startPressed = gp.start && !gpStartPrev.current;
      const faceAPressed = gp.faceA && !gpFaceAPrev.current;
      gpStartPrev.current = gp.start;
      gpFaceAPrev.current = gp.faceA;

      if (startPressed && gameStartedRef.current && !gameOverRef.current) {
        pausedRef.current = !pausedRef.current;
        setPaused(pausedRef.current);
        if (pausedRef.current) {
          pauseMenuIndexRef.current = 0;
          setPauseMenuIndex(0);
        }
        if (!pausedRef.current) rafRef.current = requestAnimationFrame(loop);
        return;
      }

      const PAUSE_MENU_COUNT = 4;
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
          } else if (pauseMenuIndexRef.current === 3) {
            window.location.reload();
          }
        }
        return;
      } else {
        gpDpadUpPrev.current = gp.dpadUp;
        gpDpadDownPrev.current = gp.dpadDown;
      }

      const aimStickX = useRightStickRef.current ? gp.rightStickX : gp.stickX;
      const aimStickY = useRightStickRef.current ? gp.rightStickY : gp.stickY;
      const aimStickActive = useRightStickRef.current ? gp.rightStickActive : gp.stickActive;

      let angle: number;
      if (aimStickActive) {
        gamepadAimingRef.current = true;
        angle = Math.atan2(aimStickY, aimStickX);
        lastGamepadAngleRef.current = angle;
      } else if (gamepadAimingRef.current) {
        angle = lastGamepadAngleRef.current;
      } else {
        angle = Math.atan2(wmy - pos.y, wmx - pos.x);
      }

      const prevDpad = gpDpadPrev.current;
      if (gp.dpadLeft && !prevDpad.left && !rollRef.current.active && fuelRef.current >= ROLL_FUEL_COST) {
        fuelRef.current -= ROLL_FUEL_COST;
        const r = rollRef.current;
        r.active = true;
        r.dir = -1;
        r.startTime = performance.now();
        r.startX = pos.x;
        r.startY = pos.y;
        r.perpX = -Math.sin(angle) * -1;
        r.perpY = Math.cos(angle) * -1;
        r.spinAngle = 0;
        deflectMissiles();
      }
      if (gp.dpadRight && !prevDpad.right && !rollRef.current.active && fuelRef.current >= ROLL_FUEL_COST) {
        fuelRef.current -= ROLL_FUEL_COST;
        const r = rollRef.current;
        r.active = true;
        r.dir = 1;
        r.startTime = performance.now();
        r.startX = pos.x;
        r.startY = pos.y;
        r.perpX = -Math.sin(angle);
        r.perpY = Math.cos(angle);
        r.spinAngle = 0;
        deflectMissiles();
      }
      gpDpadPrev.current = { left: gp.dpadLeft, right: gp.dpadRight };

      const roll = rollRef.current;
      if (roll.active) {
        const elapsed = performance.now() - roll.startTime;
        const t = Math.min(elapsed / ROLL_DURATION, 1);
        const prevT = Math.max((elapsed - 16) / ROLL_DURATION, 0);
        const ease = (v: number) => 1 - (1 - v) * (1 - v);
        const dt2 = ease(t) - ease(prevT);
        pos.x += roll.perpX * ROLL_DISTANCE * dt2;
        pos.y += roll.perpY * ROLL_DISTANCE * dt2;
        roll.spinAngle = roll.dir * Math.PI * 2 * ease(t);
        if (t >= 1) roll.active = false;
      }

      const submerged = isSubmerged(pos.y, viewH);
      const wasSubmerged = wasSubmergedRef.current;
      const speedMult = submerged ? WATER_SPEED_FACTOR : 1;

      const crossingVy = pos.y - lastPosRef.current.y;
      const crossingSpeed = Math.abs(crossingVy) + Math.abs(pos.x - lastPosRef.current.x) * 0.3;
      if (submerged && !wasSubmerged && crossingSpeed > 0.5)
        spawnSplash(pos.x, getWaterSurfaceY(viewH), crossingVy, true);
      else if (!submerged && wasSubmerged && crossingSpeed > 0.5)
        spawnSplash(pos.x, getWaterSurfaceY(viewH), crossingVy, false);
      wasSubmergedRef.current = submerged;
      lastPosRef.current = { x: pos.x, y: pos.y };

      const dt = dtScale / 60;
      if (submerged) fuelRef.current = Math.min(fuelRef.current + FUEL_REFILL_RATE * dt, MAX_FUEL);

      if (gp.thrust || gp.fire) gamepadAimingRef.current = true;
      const isThrusting = keysRef.current.has("thrust") || gp.thrust;
      const isBoosting = keysRef.current.has("w");
      const isMoving = isThrusting || isBoosting;
      const hasFuel = fuelRef.current > 0;
      const vel = velRef.current;

      const boost = boostRef.current;
      if (isBoosting && hasFuel) {
        if (!boost.active) {
          boost.active = true;
          boost.lockedAngle = angle;
          deflectMissiles();
        }
        angle = boost.lockedAngle;
      } else {
        boost.active = false;
      }

      const BOOST_SPEED_MULT = 1.8;
      const BOOST_FUEL_MULT = 1.6;

      if (isMoving && hasFuel) {
        if (!submerged) {
          const fuelMult = isBoosting ? BOOST_FUEL_MULT : 1;
          fuelRef.current = Math.max(fuelRef.current - FUEL_BURN_RATE * fuelMult * dt, 0);
        }
        throttleRef.current = Math.min(throttleRef.current + 0.04 * dtScale, 1);
        const verticalComponent = Math.sin(angle);
        let gravityMod = 1.0;
        if (!submerged) {
          if (verticalComponent < 0) gravityMod = 1.0 - CLIMB_PENALTY * Math.abs(verticalComponent);
          else gravityMod = 1.0 + DIVE_BOOST * verticalComponent;
        }
        const boostMult = isBoosting ? BOOST_SPEED_MULT : 1;
        const power = SPEED * speedMult * throttleRef.current * gravityMod * boostMult;
        const dist = Math.hypot(wmx - pos.x, wmy - pos.y);
        if (dist > 5) {
          const targetVx = Math.cos(angle) * power;
          const targetVy = Math.sin(angle) * power;
          const lerpRate = isBoosting ? 0.25 : 0.05 + throttleRef.current * 0.15;
          const scaledLerp = 1 - Math.pow(1 - lerpRate, dtScale);
          vel.x += (targetVx - vel.x) * scaledLerp;
          vel.y += (targetVy - vel.y) * scaledLerp;
        }
        if (!submerged) vel.y += THRUST_GRAVITY * dtScale;
        if (isBoosting && !submerged) {
          pos.x += (Math.random() - 0.5) * 2.4 * dtScale;
          pos.y += (Math.random() - 0.5) * 2.4 * dtScale;
          const hasBlades = playerHPRef.current >= PLAYER_MAX_HP;
          if (hasBlades) {
            const ramScore = checkRamCollisions(pos.x, pos.y, TRI_SIZE);
            const gunboatRamScore = checkRamGunboat(pos.x, pos.y, TRI_SIZE, viewH);
            const mineRamScore = checkRamMine(pos.x, pos.y, TRI_SIZE);
            const totalRamScore = ramScore + gunboatRamScore + mineRamScore;
            if (totalRamScore > 0) {
              scoreRef.current += totalRamScore;
              shake(Math.cos(angle), Math.sin(angle));
            }
          }
        }
        pos.x += vel.x * dtScale;
        pos.y += vel.y * dtScale;
        const jetThrottle = isBoosting ? Math.min(throttleRef.current * 1.8, 1) : throttleRef.current;
        spawnJetParticles(pos.x, pos.y, angle, jetThrottle, submerged, fuelRef.current, MAX_FUEL);
        if (isBoosting && !submerged) {
          spawnJetParticles(pos.x, pos.y, angle, 1, submerged, fuelRef.current, MAX_FUEL);
          spawnJetParticles(pos.x, pos.y, angle, 1, submerged, fuelRef.current, MAX_FUEL);
          spawnJetParticles(pos.x, pos.y, angle, 0.8, submerged, fuelRef.current, MAX_FUEL);
        }
        wasMovingRef.current = true;
      } else {
        throttleRef.current = Math.max(throttleRef.current - 0.03 * dtScale, 0);
        vel.x *= Math.pow(AIR_DRAG, dtScale);
        vel.y *= Math.pow(AIR_DRAG, dtScale);
        if (!submerged) vel.y = Math.min(vel.y + GRAVITY * dtScale, MAX_FALL_SPEED);
        else {
          const surfaceY = getWaterSurfaceY(viewH);
          const depth = pos.y - surfaceY;
          vel.y -= BUOYANCY * Math.min(depth / 40, 1) * dtScale;
          vel.x *= Math.pow(0.97, dtScale);
          vel.y *= Math.pow(0.97, dtScale);
        }
        pos.x += vel.x * dtScale;
        pos.y += vel.y * dtScale;
        if (Math.abs(vel.x) < 0.01 && Math.abs(vel.y) < 0.01 && !submerged) wasMovingRef.current = false;
      }

      pos.x = ((pos.x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;

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

      const finalCamX = pos.x - viewW / 2;

      if ((rightMouseRef.current || gp.fire) && ammoRef.current > 0) {
        shootCooldownRef.current -= frameDelta;
        if (shootCooldownRef.current <= 0) {
          shootCooldownRef.current = SHOOT_INTERVAL;
          ammoRef.current -= 1;
          bulletsRef.current.push({
            x: pos.x + Math.cos(angle) * (TRI_SIZE + 4),
            y: pos.y + Math.sin(angle) * (TRI_SIZE + 4),
            dx: Math.cos(angle) * BULLET_SPEED,
            dy: Math.sin(angle) * BULLET_SPEED,
            id: bulletIdRef.current++,
          });
        }
      }

      bulletsRef.current = bulletsRef.current.filter((b) => {
        b.x += b.dx * dtScale;
        b.y += b.dy * dtScale;
        return b.y > -10 && b.y < viewH + 10 && Math.abs(b.x - pos.x) < viewW * 1.5;
      });

      const cities = citiesRef.current;
      const cityHPs = cityHPRef.current;

      if (gameStartedRef.current) {
        const wave = waveRef.current;
        const waveDiff = getWaveDifficulty(wave.wave);

        const waveResult = updateWave(wave, dt, scoreRef.current);
        if (waveResult.waveCompleted) {
          fleeAllEnemies();
          fleeSubmarines();
          fleeGunboats();
          fleeMinelayers();
        }
        if (waveResult.newLife) {
          playerLivesRef.current = Math.min(playerLivesRef.current + 1, PLAYER_LIVES + 5);
          playerHPRef.current = PLAYER_MAX_HP;
        }
        if (waveResult.startNextWave) {
          resetEnemies();
          resetSubmarines();
          resetGunboats();
          resetPickups(WORLD_WIDTH);
          // Pick new random bomber target city (avoid repeating the same one)
          const prev = bomberTargetRef.current;
          let newTarget = Math.floor(Math.random() * (NUM_CITIES - 1));
          if (newTarget >= prev) newTarget++;
          setBomberTargetCity(newTarget);
          bomberTargetRef.current = newTarget;
        }

        // Guard: cities not yet initialized
        if (cities.length < 3) return;

        // Update enemies — pass all cities
        const citySimpleList = cities.map((c) => ({ x: c.x, width: c.width }));
        const deflectScore = updateEnemies(
          dt,
          WORLD_WIDTH,
          viewH,
          citySimpleList,
          pos.x,
          pos.y,
          viewW / 2,
          waveDiff,
          wave.enemiesFleeing,
        );
        if (deflectScore > 0) scoreRef.current += deflectScore;

        const centerCity = cities[1];
        const subDmg = updateSubmarinesWithDamage(
          dt,
          viewH,
          centerCity.x,
          centerCity.width,
          pos.x,
          viewW / 2,
          waveDiff,
          wave.enemiesFleeing,
          performance.now() / 1000,
        );
        if (subDmg > 0) {
          shake(0, 1);
          cityHPs[1].hp = Math.max(cityHPs[1].hp - subDmg, 0);
          if (cityHPs[1].hp <= 0) {
            gameOverRef.current = true;
            setGameOver(true);
            setGameOverReason("HAVEN destroyed!");
          }
        }

        const gunboatPlatforms = [
          ...cities.map((c) => ({ x: c.x, halfW: c.width / 2 })),
          { x: WORLD_WIDTH - 80, halfW: 60 },
        ];
        updateGunboats(
          dt,
          WORLD_WIDTH,
          viewH,
          pos.x,
          pos.y,
          viewW / 2,
          waveDiff,
          wave.enemiesFleeing,
          gunboatPlatforms,
        );

        const waterY2 = getWaterSurfaceY(viewH);
        const minePlatforms = [
          ...cities.map((c) => {
            const ty = getBoatTopY(c, viewH);
            return { x: c.x, halfW: c.width / 2, topY: ty, bottomY: ty + 36 };
          }),
          {
            x: WORLD_WIDTH - 80,
            halfW: 60,
            topY: getWaveY(WORLD_WIDTH - 80, waterY2) - 22,
            bottomY: getWaveY(WORLD_WIDTH - 80, waterY2) + 18,
          },
        ];
        updateMinelayer(dt, WORLD_WIDTH, viewH, waveDiff, wave.enemiesFleeing, minePlatforms);

        const result = checkBulletCollisions(bulletsRef.current);
        bulletsRef.current = result.remaining;
        scoreRef.current += result.score;
        const subResult = checkBulletHitsSubmarine(bulletsRef.current);
        bulletsRef.current = subResult.remaining;
        scoreRef.current += subResult.score;
        const gunboatResult = checkBulletHitsGunboat(bulletsRef.current, viewH);
        bulletsRef.current = gunboatResult.remaining;
        scoreRef.current += gunboatResult.score;
        const mineResult = checkBulletHitsMine(bulletsRef.current);
        bulletsRef.current = mineResult.remaining;
        scoreRef.current += mineResult.score;

        // Check bomb hits on all cities
        for (let ci = 0; ci < cities.length; ci++) {
          const city = cities[ci];
          const cHp = cityHPs[ci];
          const barrierUp = cHp.hp > 3;
          const cityTopY = getBoatTopY(city, viewH);
          const bombHits = checkBombHitsShip(city.x, city.width, cityTopY, barrierUp);
          if (bombHits > 0) {
            shake(0, 1);
            cHp.hp = Math.max(cHp.hp - bombHits, 0);
            if (cHp.hp <= 0) {
              gameOverRef.current = true;
              setGameOver(true);
              setGameOverReason(`${city.name} destroyed!`);
            }
          }
        }
      }

      // Enemy projectile collisions
      if (gameStartedRef.current) {
        if (invulnRef.current > 0) invulnRef.current -= frameDelta;
        else {
          const isBoosting = boostRef.current.active;
          // While boosting, normal bullets pass through the player
          const playerHits = isBoosting ? 0 : checkChaserBulletHitsPlayer(pos.x, pos.y, TRI_SIZE);
          const missileHits = checkMissileHitsPlayer(pos.x, pos.y, TRI_SIZE);
          const gunboatHits = isBoosting ? 0 : checkGunboatBulletHitsPlayer(pos.x, pos.y, TRI_SIZE);
          const mineHits = checkMineHitsPlayer(pos.x, pos.y, TRI_SIZE);
          const totalHits = playerHits + gunboatHits + mineHits + missileHits * 2;
          if (totalHits > 0) {
            spawnExplosion(pos.x, pos.y, missileHits > 0 || mineHits > 0 ? 35 : 20);
            shake(missileHits > 0 || mineHits > 0 ? 1 : 0, 1);
            invulnRef.current = INVULN_DURATION;
            playerHPRef.current -= totalHits;
            if (playerHPRef.current <= 0) {
              playerLivesRef.current -= 1;
              if (playerLivesRef.current <= 0) {
                gameOverRef.current = true;
                setGameOver(true);
                setGameOverReason("All ships lost!");
              } else playerHPRef.current = PLAYER_MAX_HP;
            }
          }
        }

        // Boat collisions for all cities
        for (const city of cities) {
          const pushOut = collideWithBoat(pos.x, pos.y, TRI_SIZE, city, viewH);
          if (pushOut) {
            pos.x = pushOut.x;
            pos.y = pushOut.y;
            const hw = city.width / 2;
            const toLeft = pos.x - (city.x - hw);
            const toRight = city.x + hw - pos.x;
            const bounceDir = toLeft < toRight ? -1 : 1;
            if (pushOut.damaging) {
              velRef.current.x = bounceDir * 3.5;
              velRef.current.y = -2.5;
              if (invulnRef.current <= 0) {
                playerHPRef.current -= 1;
                invulnRef.current = INVULN_DURATION;
                spawnExplosion(pos.x, pos.y, 15);
                shake(bounceDir, -1);
                if (playerHPRef.current <= 0) {
                  playerLivesRef.current -= 1;
                  if (playerLivesRef.current <= 0) {
                    gameOverRef.current = true;
                    setGameOver(true);
                    setGameOverReason("All ships lost!");
                  } else playerHPRef.current = PLAYER_MAX_HP;
                }
              }
            } else {
              velRef.current.x *= 0.5;
              velRef.current.y = 2;
            }
          }
        }

        const depotPush = collideWithDepot(pos.x, pos.y, TRI_SIZE, viewH);
        if (depotPush) {
          pos.x = depotPush.x;
          pos.y = depotPush.y;
          if (depotPush.damaging) {
            velRef.current.x = (pos.x < WORLD_WIDTH / 2 ? -1 : 1) * 3.5;
            velRef.current.y = -2.5;
            if (invulnRef.current <= 0) {
              playerHPRef.current -= 1;
              invulnRef.current = INVULN_DURATION;
              spawnExplosion(pos.x, pos.y, 15);
              shake(pos.x < WORLD_WIDTH / 2 ? -1 : 1, -1);
              if (playerHPRef.current <= 0) {
                playerLivesRef.current -= 1;
                if (playerLivesRef.current <= 0) {
                  gameOverRef.current = true;
                  setGameOver(true);
                  setGameOverReason("Crashed into depot!");
                } else playerHPRef.current = PLAYER_MAX_HP;
              }
            }
          } else {
            velRef.current.x *= 0.5;
            velRef.current.y = 2;
          }
        }

        const waveElapsed = waveRef.current.waveTimer;
        if (waveElapsed > 30 && cities.length >= 2)
          checkScoreRewards(scoreRef.current, cities[1].x, cities[1].width, viewH);
        updatePowerups();
        const pickedUp = checkPowerupPickup(pos.x, pos.y, TRI_SIZE);
        if (pickedUp === "health") playerHPRef.current = Math.min(playerHPRef.current + 1, PLAYER_MAX_HP);
        else if (pickedUp === "repair") {
          // Repair the most damaged city
          let worstIdx = 0;
          let worstHp = cityHPs[0].hp;
          for (let i = 1; i < cityHPs.length; i++) {
            if (cityHPs[i].hp < worstHp) {
              worstHp = cityHPs[i].hp;
              worstIdx = i;
            }
          }
          cityHPs[worstIdx].hp = Math.min(cityHPs[worstIdx].hp + 1, SHIP_MAX_HP);
        }
      }

      if (gameStartedRef.current) {
        ammoRef.current = updateAmmoCrate(ammoRef.current, pos.x, pos.y, TRI_SIZE, WORLD_WIDTH, viewH, frameDelta);
        ammoRef.current = updateAmmoDrop(ammoRef.current, pos.x, pos.y, TRI_SIZE, WORLD_WIDTH, viewH, dt);
      }

      updateParticles(dt);
      updateJetTrail(dt);

      // === DRAWING ===
      ctx.clearRect(0, 0, cw, ch);
      ctx.save();
      ctx.scale(ZOOM, ZOOM);

      const skyGrad = ctx.createLinearGradient(0, 0, 0, viewH);
      skyGrad.addColorStop(0, "#05061a");
      skyGrad.addColorStop(0.12, "#0c1035");
      skyGrad.addColorStop(0.25, "#161545");
      skyGrad.addColorStop(0.38, "#2d1a5e");
      skyGrad.addColorStop(0.48, "#5a2868");
      skyGrad.addColorStop(0.56, "#8b3a62");
      skyGrad.addColorStop(0.63, "#c04e3e");
      skyGrad.addColorStop(0.7, "#e07830");
      skyGrad.addColorStop(0.76, "#f0a040");
      skyGrad.addColorStop(0.82, "#f7c864");
      skyGrad.addColorStop(0.88, "#fff0c0");
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, viewW, viewH);

      const camCenter = finalCamX + viewW / 2;
      const starSeed = 42;
      const starOffX = camCenter * 0.02;
      ctx.fillStyle = "#fff";
      for (let i = 0; i < 120; i++) {
        const baseX = (((i * 137 + starSeed) % 1000) / 1000) * viewW * 2;
        const sy = (((i * 211 + starSeed * 3) % 1000) / 1000) * viewH * 0.45;
        const sr = 0.4 + (((i * 73) % 100) / 100) * 1.2;
        const twinkle = 0.4 + Math.sin(performance.now() * 0.001 + i * 1.7) * 0.3;
        ctx.globalAlpha = twinkle;
        const sx2 = ((((baseX - starOffX) % (viewW * 2)) + viewW * 2) % (viewW * 2)) - viewW * 0.5;
        ctx.beginPath();
        ctx.arc(sx2, sy, sr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const cloudOffX = camCenter * 0.15;
      const cloudTime = performance.now() * 0.000005;
      ctx.globalAlpha = 0.12;
      for (let i = 0; i < 8; i++) {
        const seed = i * 347 + 13;
        const baseX = ((seed % 2000) / 2000) * viewW * 3;
        const cy = viewH * 0.25 + ((seed % 300) / 300) * viewH * 0.35;
        const cw2 = 80 + (seed % 120);
        const ch2 = 8 + (seed % 12);
        const cx =
          ((((baseX - cloudOffX + cloudTime * viewW * 20) % (viewW * 3)) + viewW * 3) % (viewW * 3)) - viewW * 0.5;
        ctx.fillStyle = i < 4 ? "rgba(200,150,180,0.3)" : "rgba(255,200,150,0.2)";
        ctx.beginPath();
        ctx.ellipse(cx, cy, cw2, ch2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const drawCamX = Math.round(finalCamX * ZOOM) / ZOOM;
      ctx.save();
      ctx.translate(-drawCamX, 0);

      for (const offset of [-WORLD_WIDTH, 0, WORLD_WIDTH]) {
        const worldStart = offset;
        const worldEnd = offset + WORLD_WIDTH;
        if (worldEnd < drawCamX - 100 || worldStart > drawCamX + viewW + 100) continue;
        ctx.save();
        ctx.translate(offset, 0);
        const localVisStart = drawCamX - offset;
        const localVisEnd = drawCamX + viewW - offset;
        drawWater(ctx, WORLD_WIDTH, viewH, localVisStart, localVisEnd);
        drawSubmarines(ctx);
        drawEnemies(ctx);
        drawGunboats(ctx, viewH);
        drawMinelayer(ctx, viewH);

        // Draw all 3 cities
        for (let ci = 0; ci < cities.length; ci++) {
          const city = cities[ci];
          const cHp = cityHPs[ci];
          if (!cHp) continue;
          const barrierUp = cHp.hp > 3;
          drawBoat(ctx, city, viewH, cHp.hp / SHIP_MAX_HP, barrierUp);
        }

        drawAmmoDepots(ctx, viewH);
        drawPickups(ctx);

        // Player bullets
        for (const b of bulletsRef.current) {
          const bAngle = Math.atan2(b.dy, b.dx);
          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.rotate(bAngle);
          ctx.beginPath();
          ctx.moveTo(14, 0);
          ctx.lineTo(-9, -4);
          ctx.lineTo(-9, 4);
          ctx.closePath();
          ctx.fillStyle = "rgba(0,230,200,0.3)";
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(10, 0);
          ctx.lineTo(-7, -2.5);
          ctx.lineTo(-7, 2.5);
          ctx.closePath();
          ctx.fillStyle = "#00e5cc";
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(7, 0);
          ctx.lineTo(-4, -1.2);
          ctx.lineTo(-4, 1.2);
          ctx.closePath();
          ctx.fillStyle = "#b2fff5";
          ctx.fill();
          ctx.restore();
        }

        // Player
        const isInvuln = invulnRef.current > 0;
        const showPlayer = !isInvuln || Math.floor(performance.now() / 80) % 2 === 0;
        if (showPlayer) {
          const pitchOffset = getShipPitch(
            throttleRef.current,
            keysRef.current.has("thrust") || keysRef.current.has("w"),
            velRef.current.y,
            isSubmerged(pos.y, viewH),
          );
          ctx.save();
          ctx.translate(pos.x, pos.y);
          ctx.rotate(angle + pitchOffset);
          if (roll.active) {
            const elapsed = performance.now() - roll.startTime;
            const t = Math.min(elapsed / ROLL_DURATION, 1);
            const rollAngle = roll.dir * Math.PI * 2 * t;
            ctx.scale(1, Math.cos(rollAngle));
          }
          const r = TRI_SIZE * 0.9;
          const bladesActive = playerHPRef.current >= PLAYER_MAX_HP;
          const glassTime = performance.now() * 0.003;
          ctx.beginPath();
          ctx.moveTo(r, 0);
          ctx.quadraticCurveTo(r * 0.7, -r * 0.55, -r * 0.5, -r * 0.45);
          ctx.lineTo(-r * 0.25, -r * 0.12);
          ctx.lineTo(-r * 0.25, r * 0.12);
          ctx.lineTo(-r * 0.5, r * 0.45);
          ctx.quadraticCurveTo(r * 0.7, r * 0.55, r, 0);
          ctx.closePath();
          const bodyGrad = ctx.createLinearGradient(-r, -r, r * 0.5, r);
          if (isInvuln) {
            bodyGrad.addColorStop(0, "rgba(180,240,255,0.95)");
            bodyGrad.addColorStop(0.4, "rgba(100,210,240,0.85)");
            bodyGrad.addColorStop(1, "rgba(60,180,220,0.75)");
          } else {
            bodyGrad.addColorStop(0, "rgba(80,230,200,0.95)");
            bodyGrad.addColorStop(0.3, "rgba(0,210,170,0.85)");
            bodyGrad.addColorStop(0.7, "rgba(0,160,130,0.80)");
            bodyGrad.addColorStop(1, "rgba(0,120,100,0.70)");
          }
          ctx.fillStyle = bodyGrad;
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(r * 0.75, -r * 0.1);
          ctx.quadraticCurveTo(r * 0.4, -r * 0.4, -r * 0.3, -r * 0.32);
          ctx.quadraticCurveTo(r * 0.3, -r * 0.28, r * 0.75, -r * 0.1);
          ctx.closePath();
          ctx.fillStyle = "rgba(255,255,255,0.25)";
          ctx.fill();
          if (bladesActive) {
            ctx.shadowColor = "rgba(100,255,235,0.8)";
            ctx.shadowBlur = 14;
            ctx.strokeStyle = "rgba(150,255,245,0.9)";
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.shadowColor = "transparent";
            ctx.shadowBlur = 0;
          } else {
            ctx.strokeStyle = isInvuln ? "rgba(140,220,255,0.6)" : "rgba(0,200,160,0.5)";
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
          ctx.beginPath();
          ctx.arc(r * 0.35, 0, r * 0.14, 0, Math.PI * 2);
          const visorGrad = ctx.createRadialGradient(r * 0.32, -r * 0.03, 0, r * 0.35, 0, r * 0.14);
          visorGrad.addColorStop(0, "rgba(200,255,250,0.95)");
          visorGrad.addColorStop(0.5, isInvuln ? "#88eeff" : "#40f0c8");
          visorGrad.addColorStop(1, isInvuln ? "#55ccdd" : "#00c896");
          ctx.fillStyle = visorGrad;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(r * 0.31, -r * 0.04, r * 0.05, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255,0.6)";
          ctx.fill();
          if (playerHPRef.current >= PLAYER_MAX_HP) {
            const bladeAlpha = 0.7 + Math.sin(glassTime) * 0.15;
            const drawWing = (sign: number) => {
              ctx.beginPath();
              ctx.moveTo(r * 0.3, sign * r * 0.18);
              ctx.lineTo(-r * 0.55, sign * r * 0.7);
              ctx.lineTo(-r * 0.45, sign * r * 0.55);
              ctx.lineTo(-r * 0.1, sign * r * 0.18);
              ctx.closePath();
              const wGrad = ctx.createLinearGradient(r * 0.3, sign * r * 0.18, -r * 0.55, sign * r * 0.7);
              wGrad.addColorStop(0, `rgba(160,255,240,${bladeAlpha})`);
              wGrad.addColorStop(0.6, `rgba(100,240,220,${bladeAlpha * 0.7})`);
              wGrad.addColorStop(1, `rgba(60,210,200,${bladeAlpha * 0.35})`);
              ctx.fillStyle = wGrad;
              ctx.fill();
              ctx.strokeStyle = "rgba(180,255,250,0.6)";
              ctx.lineWidth = 1;
              ctx.stroke();
            };
            drawWing(-1);
            drawWing(1);
          }
          ctx.shadowColor = "transparent";
          ctx.restore();
        }
        drawJetTrail(ctx);
        ctx.restore();
      }

      ctx.restore(); // camera
      ctx.restore(); // zoom

      // ===== HUD =====
      ctx.save();
      const hudNow = performance.now();
      const ammo = ammoRef.current;
      const fuel = fuelRef.current;
      const hudX = 12;
      const hudY = 12;
      const panelW = 280;
      const panelH = 140;

      const drawPanel = (x: number, y: number, w: number, h: number, cutTL = 12, cutBR = 12) => {
        ctx.beginPath();
        ctx.moveTo(x + cutTL, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w, y + h - cutBR);
        ctx.lineTo(x + w - cutBR, y + h);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x, y + cutTL);
        ctx.closePath();
      };

      const drawBar = (
        x: number,
        y: number,
        w: number,
        h: number,
        fill: number,
        color1: string,
        color2: string,
        low: boolean,
      ) => {
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(x, y, w, h);
        const barW = Math.max(0, fill * w);
        if (barW > 0) {
          const grad = ctx.createLinearGradient(x, y, x + barW, y);
          grad.addColorStop(0, color1);
          grad.addColorStop(1, color2);
          ctx.fillStyle = grad;
          ctx.fillRect(x, y, barW, h);
          ctx.fillStyle = "rgba(255,255,255,0.25)";
          ctx.fillRect(x, y, barW, h * 0.35);
        }
        ctx.strokeStyle = "rgba(255,255,255,0.1)";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, w, h);
        if (low) {
          ctx.fillStyle = `rgba(255,80,80,${0.15 + Math.sin(hudNow * 0.006) * 0.1})`;
          ctx.fillRect(x, y, w, h);
        }
      };

      // LEFT PANEL: Player status
      ctx.save();
      drawPanel(hudX, hudY, panelW, panelH);
      const panelGrad = ctx.createLinearGradient(hudX, hudY, hudX, hudY + panelH);
      panelGrad.addColorStop(0, "rgba(0,20,40,0.75)");
      panelGrad.addColorStop(0.5, "rgba(0,40,60,0.6)");
      panelGrad.addColorStop(1, "rgba(0,10,30,0.8)");
      ctx.fillStyle = panelGrad;
      ctx.fill();
      ctx.strokeStyle = "rgba(0,220,255,0.3)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(hudX + 14, hudY + 1);
      ctx.lineTo(hudX + panelW - 2, hudY + 1);
      ctx.strokeStyle = "rgba(0,220,255,0.15)";
      ctx.lineWidth = 1;
      ctx.stroke();

      const lx = hudX + 10;
      let ly = hudY + 20;
      const labelX = lx + 46;

      // Round indicator helper
      const drawRoundLight = (
        cx: number,
        cy: number,
        radius: number,
        powered: boolean,
        color: string,
        glowColor: string,
      ) => {
        ctx.beginPath();
        ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(60,70,80,0.9)";
        ctx.fill();
        ctx.strokeStyle = "rgba(120,130,140,0.5)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        if (powered) {
          const g = ctx.createRadialGradient(cx - radius * 0.2, cy - radius * 0.2, 0, cx, cy, radius);
          g.addColorStop(0, "rgba(255,255,255,0.95)");
          g.addColorStop(0.3, color);
          g.addColorStop(1, glowColor);
          ctx.fillStyle = g;
        } else ctx.fillStyle = "rgba(30,33,38,0.9)";
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx - radius * 0.2, cy - radius * 0.3, radius * 0.45, radius * 0.25, -0.3, 0, Math.PI * 2);
        ctx.fillStyle = powered ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.05)";
        ctx.fill();
      };

      // Diamond indicator helper
      const drawDiamondLight = (
        cx: number,
        cy: number,
        size: number,
        powered: boolean,
        color: string,
        glowColor: string,
      ) => {
        const s = size;
        ctx.beginPath();
        ctx.moveTo(cx, cy - s - 2);
        ctx.lineTo(cx + s + 2, cy);
        ctx.lineTo(cx, cy + s + 2);
        ctx.lineTo(cx - s - 2, cy);
        ctx.closePath();
        ctx.fillStyle = "rgba(60,70,80,0.9)";
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx, cy - s);
        ctx.lineTo(cx + s, cy);
        ctx.lineTo(cx, cy + s);
        ctx.lineTo(cx - s, cy);
        ctx.closePath();
        if (powered) {
          const g = ctx.createRadialGradient(cx - s * 0.15, cy - s * 0.15, 0, cx, cy, s);
          g.addColorStop(0, "rgba(255,255,255,0.9)");
          g.addColorStop(0.35, color);
          g.addColorStop(1, glowColor);
          ctx.fillStyle = g;
        } else ctx.fillStyle = "rgba(30,33,38,0.9)";
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.3, cy - s * 0.6);
        ctx.lineTo(cx + s * 0.2, cy - s * 0.15);
        ctx.lineTo(cx - s * 0.1, cy - s * 0.1);
        ctx.closePath();
        ctx.fillStyle = powered ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.04)";
        ctx.fill();
      };

      // Strip segment helper
      const drawStripSegment = (
        x: number,
        y: number,
        w: number,
        h: number,
        powered: boolean,
        color: string,
        glowColor: string,
        isFirst: boolean,
        isLast: boolean,
      ) => {
        const r = 2;
        ctx.beginPath();
        if (isFirst) {
          ctx.moveTo(x + r, y);
          ctx.lineTo(x + w, y);
          ctx.lineTo(x + w, y + h);
          ctx.lineTo(x + r, y + h);
          ctx.arcTo(x, y + h, x, y + h - r, r);
          ctx.lineTo(x, y + r);
          ctx.arcTo(x, y, x + r, y, r);
        } else if (isLast) {
          ctx.moveTo(x, y);
          ctx.lineTo(x + w - r, y);
          ctx.arcTo(x + w, y, x + w, y + r, r);
          ctx.lineTo(x + w, y + h - r);
          ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
          ctx.lineTo(x, y + h);
        } else ctx.rect(x, y, w, h);
        ctx.closePath();
        ctx.fillStyle = "rgba(40,44,50,0.95)";
        ctx.fill();
        ctx.strokeStyle = "rgba(80,85,90,0.4)";
        ctx.lineWidth = 0.5;
        ctx.stroke();
        if (powered) {
          ctx.save();
          const g = ctx.createLinearGradient(x, y, x, y + h);
          g.addColorStop(0, color);
          g.addColorStop(0.5, glowColor);
          g.addColorStop(1, color);
          ctx.fillStyle = g;
          ctx.globalAlpha = 0.85;
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.rect(x + 1, y + 1, w - 2, h * 0.35);
          ctx.fillStyle = "rgba(255,255,255,0.3)";
          ctx.fill();
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.rect(x + 1, y + 1, w - 2, h - 2);
          ctx.fillStyle = "rgba(20,22,26,0.7)";
          ctx.fill();
        }
      };

      // LIVES
      ctx.font = "bold 10px monospace";
      ctx.fillStyle = "rgba(100,255,150,0.7)";
      ctx.textAlign = "right";
      ctx.fillText("LIVES", labelX - 4, ly);
      ctx.textAlign = "left";
      for (let i = 0; i < PLAYER_LIVES; i++)
        drawRoundLight(labelX + 8 + i * 24, ly - 4, 7, i < playerLivesRef.current, "#50ff90", "#1a8040");

      // HP
      ly += 24;
      ctx.font = "bold 10px monospace";
      ctx.fillStyle = "rgba(255,180,60,0.7)";
      ctx.textAlign = "right";
      ctx.fillText("HP", labelX - 4, ly);
      ctx.textAlign = "left";
      for (let i = 0; i < PLAYER_MAX_HP; i++)
        drawDiamondLight(labelX + 8 + i * 26, ly - 3, 7, i < playerHPRef.current, "#ffb830", "#996600");

      // AMMO
      ly += 24;
      ctx.font = "bold 10px monospace";
      const ammoLow = ammo <= AMMO_LOW_THRESHOLD;
      ctx.fillStyle = ammoLow ? "#ffcc00" : "rgba(180,190,200,0.7)";
      ctx.textAlign = "right";
      ctx.fillText("AMMO", labelX - 4, ly);
      ctx.textAlign = "left";
      const ammoLights = 12;
      const ammoFrac = ammo / MAX_AMMO;
      const litAmmo = Math.round(ammoFrac * ammoLights);
      const stripX = labelX + 6;
      const stripY = ly - 10;
      const segW = 12;
      const segH = 12;
      const segGap = 1.5;
      ctx.beginPath();
      ctx.roundRect(stripX - 2, stripY - 2, ammoLights * (segW + segGap) - segGap + 4, segH + 4, 3);
      ctx.fillStyle = "rgba(50,55,60,0.8)";
      ctx.fill();
      for (let i = 0; i < ammoLights; i++) {
        const sx = stripX + i * (segW + segGap);
        drawStripSegment(
          sx,
          stripY,
          segW,
          segH,
          i < litAmmo,
          ammoLow ? "#ffcc00" : "#c0c8d0",
          ammoLow ? "#ff9900" : "#8890a0",
          i === 0,
          i === ammoLights - 1,
        );
      }

      // FUEL
      ly += 36;
      ctx.font = "bold 10px monospace";
      const fuelLow = fuel <= FUEL_LOW_THRESHOLD;
      ctx.fillStyle = fuelLow ? "#ff6060" : "rgba(0,180,255,0.7)";
      ctx.textAlign = "right";
      ctx.fillText("FUEL", labelX - 4, ly);
      ctx.textAlign = "left";
      const tubeCount = 5;
      const tubeW = 14;
      const tubeH = 28;
      const tubeGap = 6;
      const tubeStartX = labelX + 6;
      const tubeStartY = ly - 22;
      const fuelFrac = fuel / MAX_FUEL;
      const fuelPerTube = 1 / tubeCount;
      const tAnim = performance.now() * 0.002;
      for (let i = 0; i < tubeCount; i++) {
        const tx = tubeStartX + i * (tubeW + tubeGap);
        const ty = tubeStartY;
        ctx.fillStyle = "rgba(80,85,95,0.95)";
        ctx.fillRect(tx - 1, ty - 3, tubeW + 2, 5);
        ctx.strokeStyle = "rgba(140,145,155,0.4)";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(tx - 1, ty - 3, tubeW + 2, 5);
        ctx.fillStyle = "rgba(80,85,95,0.95)";
        ctx.fillRect(tx - 1, ty + tubeH - 2, tubeW + 2, 5);
        ctx.strokeRect(tx - 1, ty + tubeH - 2, tubeW + 2, 5);
        ctx.beginPath();
        ctx.roundRect(tx, ty + 1, tubeW, tubeH - 2, 3);
        ctx.fillStyle = "rgba(15,20,30,0.85)";
        ctx.fill();
        ctx.strokeStyle = "rgba(100,120,140,0.3)";
        ctx.lineWidth = 1;
        ctx.stroke();
        const tubeMin = i * fuelPerTube;
        const tubeMax = (i + 1) * fuelPerTube;
        let tubeFill = 0;
        if (fuelFrac >= tubeMax) tubeFill = 1;
        else if (fuelFrac > tubeMin) tubeFill = (fuelFrac - tubeMin) / fuelPerTube;
        if (tubeFill > 0) {
          const fillH = (tubeH - 4) * tubeFill;
          const fillY = ty + tubeH - 2 - fillH;
          const liqGrad = ctx.createLinearGradient(tx, fillY, tx + tubeW, fillY + fillH);
          if (fuelLow) {
            liqGrad.addColorStop(0, "rgba(255,80,50,0.8)");
            liqGrad.addColorStop(0.5, "rgba(255,120,40,0.9)");
            liqGrad.addColorStop(1, "rgba(200,50,30,0.8)");
          } else {
            liqGrad.addColorStop(0, "rgba(0,140,220,0.4)");
            liqGrad.addColorStop(0.5, "rgba(0,200,255,0.5)");
            liqGrad.addColorStop(1, "rgba(0,100,180,0.4)");
          }
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(tx + 1, ty + 2, tubeW - 2, tubeH - 4, 2);
          ctx.clip();
          ctx.fillStyle = liqGrad;
          ctx.fillRect(tx + 1, fillY, tubeW - 2, fillH);
          if (tubeFill < 1 && tubeFill > 0.02) {
            const wave1 = Math.sin(tAnim + i * 1.5) * 1.5;
            const wave2 = Math.sin(tAnim * 1.3 + i * 2) * 0.8;
            ctx.beginPath();
            ctx.moveTo(tx + 1, fillY);
            ctx.quadraticCurveTo(tx + tubeW * 0.3, fillY + wave1, tx + tubeW * 0.5, fillY + wave2);
            ctx.quadraticCurveTo(tx + tubeW * 0.7, fillY - wave1 * 0.5, tx + tubeW - 1, fillY);
            ctx.lineTo(tx + tubeW - 1, fillY + 4);
            ctx.lineTo(tx + 1, fillY + 4);
            ctx.closePath();
            ctx.fillStyle = fuelLow ? "rgba(255,160,80,0.4)" : "rgba(100,220,255,0.35)";
            ctx.fill();
          }
          ctx.restore();
        }
        ctx.beginPath();
        ctx.roundRect(tx + 2, ty + 3, 3, tubeH - 6, 1);
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.fill();
      }

      ctx.strokeStyle = "rgba(0,220,255,0.2)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hudX + 2, hudY + 20);
      ctx.lineTo(hudX + 2, hudY + 14);
      ctx.lineTo(hudX + 14, hudY + 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(hudX + panelW - 2, hudY + panelH - 20);
      ctx.lineTo(hudX + panelW - 2, hudY + panelH - 14);
      ctx.lineTo(hudX + panelW - 14, hudY + panelH - 2);
      ctx.stroke();
      ctx.restore();

      drawAmmoCrateAlert(ctx, hudX + 10, hudY + panelH + 8);

      // ---- CITY STATUS PANELS (right side, stacked) ----
      const cityPanelW = 220;
      const cityPanelH = 52;
      const cityPanelGap = 6;
      const cityPanelX = cw - cityPanelW - 12;
      let cityPanelY = hudY;

      const bomberTarget = bomberTargetRef.current;
      const cityColors = ["#ff7f50", "#00dcff", "#a0ff80"]; // distinct color per city

      // Sub detection near Haven (index 1)
      const HAVEN_INDEX = 1;
      const activeSubs = getSubmarines().filter((s) => s.alive);
      const havenCity = cities[HAVEN_INDEX];
      const subNearHaven = havenCity
        ? activeSubs.some((s) => Math.abs(s.x - havenCity.x) < havenCity.width * 1.5)
        : false;

      // Bomber spawn flash: bright fast blink for 3s after a bomber spawns, then off
      const msSinceSpawn = hudNow - getLastBomberSpawnTime();
      const spawnFlashActive = msSinceSpawn < 3000;
      const spawnFlash = spawnFlashActive && Math.sin(hudNow * 0.012) > 0;

      // Sub warning: slow blink (~2s period)
      const subBlink = Math.sin(hudNow * 0.0025) > -0.5;

      for (let ci = 0; ci < cities.length; ci++) {
        const city = cities[ci];
        const cHp = cityHPs[ci];
        if (!cHp) continue;
        const isTarget = ci === bomberTarget;
        const isHaven = ci === HAVEN_INDEX;
        const hasSub = isHaven && subNearHaven;
        const barrierUp = cHp.hp > 3;
        const py2 = cityPanelY;

        ctx.save();
        // Panel background
        drawPanel(cityPanelX, py2, cityPanelW, cityPanelH, 0, 10);
        const rGrad = ctx.createLinearGradient(cityPanelX, py2, cityPanelX, py2 + cityPanelH);
        rGrad.addColorStop(0, "rgba(0,20,40,0.80)");
        rGrad.addColorStop(1, "rgba(0,10,30,0.85)");
        ctx.fillStyle = rGrad;
        ctx.fill();

        // Border color
        const borderPulse = 0.4 + Math.sin(hudNow * 0.004) * 0.2;
        if (isTarget && hasSub) {
          // Both threats: alternate between red and yellow
          const alt = Math.sin(hudNow * 0.004) > 0;
          ctx.strokeStyle = alt ? `rgba(255,80,40,${borderPulse})` : `rgba(255,210,40,${borderPulse})`;
          ctx.lineWidth = 2;
        } else if (isTarget) {
          ctx.strokeStyle = `rgba(255,80,40,${borderPulse})`;
          ctx.lineWidth = 2;
        } else if (hasSub) {
          ctx.strokeStyle = `rgba(255,210,40,${borderPulse})`;
          ctx.lineWidth = 2;
        } else {
          const cityBorderColors = ["255,127,80", "0,220,255", "160,255,128"];
          ctx.strokeStyle = `rgba(${cityBorderColors[ci] ?? "255,255,255"},0.3)`;
          ctx.lineWidth = 1;
        }
        ctx.stroke();

        // City name
        ctx.font = "bold 10px monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = cityColors[ci];
        ctx.fillText(city.name, cityPanelX + 8, py2 + 16);

        // Threat indicators
        let indicatorX = cityPanelX + 90;

        // Bomber indicator: solid steady glow when this city is targeted;
        // flashes brightly for 3s after a new bomber spawns
        if (isTarget) {
          if (spawnFlashActive) {
            // Bright flash on spawn
            ctx.fillStyle = spawnFlash ? "rgba(255,100,50,1.0)" : "rgba(255,80,40,0.35)";
          } else {
            // Steady dim glow when no recent spawn
            const steadyGlow = 0.55 + Math.sin(hudNow * 0.003) * 0.1;
            ctx.fillStyle = `rgba(255,80,40,${steadyGlow})`;
          }
          ctx.font = "bold 9px monospace";
          ctx.fillText("▼ BOMBERS", indicatorX, py2 + 16);
          indicatorX += 68;
        }

        // Sub indicator: slow blink when sub is near Haven
        if (hasSub && subBlink) {
          ctx.fillStyle = "rgba(255,210,40,0.85)";
          ctx.font = "bold 9px monospace";
          ctx.fillText("▼ SUB", indicatorX, py2 + 16);
        }

        // HP pips
        const pipLabel = barrierUp ? "BARRIER" : "CITY HP";
        ctx.font = "bold 9px monospace";
        ctx.fillStyle = barrierUp ? "rgba(0,220,255,0.6)" : "#ff6666";
        ctx.fillText(pipLabel, cityPanelX + 8, py2 + 32);

        const pipSpacing = 14;
        const pipStartX = cityPanelX + 75;
        for (let i = 0; i < SHIP_MAX_HP; i++) {
          const bx = pipStartX + i * pipSpacing;
          const isBarrierSeg = i >= 3;
          const active = i < cHp.hp;
          if (active) ctx.fillStyle = isBarrierSeg ? "#00cc88" : "#ff5555";
          else ctx.fillStyle = "rgba(255,255,255,0.08)";
          ctx.fillRect(bx, py2 + 23, 10, 8);
          if (active) {
            ctx.fillStyle = "rgba(255,255,255,0.3)";
            ctx.fillRect(bx, py2 + 23, 10, 3);
          }
        }

        // HP fraction text
        ctx.font = "bold 9px monospace";
        ctx.fillStyle = "rgba(200,200,200,0.5)";
        ctx.textAlign = "right";
        ctx.fillText(`${cHp.hp}/${SHIP_MAX_HP}`, cityPanelX + cityPanelW - 6, py2 + 46);

        ctx.restore();
        cityPanelY += cityPanelH + cityPanelGap;
      }

      // Bomber target indicator below city panels — steady glow, flashes on spawn
      ctx.save();
      const targetIndicatorY = cityPanelY + 4;
      ctx.font = "bold 9px monospace";
      ctx.textAlign = "center";
      if (spawnFlashActive) {
        ctx.fillStyle = spawnFlash ? "rgba(255,120,40,1.0)" : "rgba(255,120,40,0.3)";
      } else {
        const steadyGlow = 0.5 + Math.sin(hudNow * 0.003) * 0.1;
        ctx.fillStyle = `rgba(255,120,40,${steadyGlow})`;
      }
      ctx.fillText(`BOMBERS → ${cities[bomberTarget]?.name ?? ""}`, cityPanelX + cityPanelW / 2, targetIndicatorY);
      ctx.restore();

      // CENTER: Score + Wave
      ctx.save();
      ctx.textAlign = "center";
      ctx.shadowColor = "#00e0ff";
      ctx.shadowBlur = 8;
      ctx.fillStyle = "#00e0ff";
      ctx.font = "bold 20px monospace";
      ctx.fillText(`${scoreRef.current}`, cw / 2, 30);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(0,220,255,0.4)";
      ctx.font = "bold 9px monospace";
      ctx.fillText("SCORE", cw / 2, 14);
      ctx.restore();

      drawWaveHUD(ctx, waveRef.current, cw);
      // ---- NAVIGATION COMPASS HUD (center-top, below wave indicator) ----
      {
        const NAV_W = 260;
        const NAV_H = 28;
        const navX = cw / 2 - NAV_W / 2;
        const navY = 56;
        const depotWorldX = WORLD_WIDTH - 80;
        const cityColors = ["#ff7f50", "#00dcff", "#a0ff80"];
        const bomberTarget = bomberTargetRef.current;

        ctx.save();

        // Panel background
        ctx.beginPath();
        ctx.roundRect(navX, navY, NAV_W, NAV_H, 6);
        ctx.fillStyle = "rgba(0,20,40,0.65)";
        ctx.fill();
        ctx.strokeStyle = "rgba(0,220,255,0.18)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Horizontal track line
        const lineY = navY + NAV_H / 2;
        const lineX0 = navX + 14;
        const lineX1 = navX + NAV_W - 14;
        const lineW = lineX1 - lineX0;

        ctx.beginPath();
        ctx.moveTo(lineX0, lineY);
        ctx.lineTo(lineX1, lineY);
        ctx.strokeStyle = "rgba(0,180,220,0.35)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Map world X → nav track X. Player at center, world wraps, result clamped.
        const EDGE_PAD = 5;
        const halfWorld = WORLD_WIDTH / 2;
        const navScale = lineW / WORLD_WIDTH;

        const getNavX = (worldX: number): { x: number; clamped: boolean } => {
          let delta = worldX - pos.x;
          if (delta > halfWorld) delta -= WORLD_WIDTH;
          if (delta < -halfWorld) delta += WORLD_WIDTH;
          const raw = lineX0 + lineW / 2 + delta * navScale;
          const clamped = raw < lineX0 + EDGE_PAD || raw > lineX1 - EDGE_PAD;
          return {
            x: Math.max(lineX0 + EDGE_PAD, Math.min(lineX1 - EDGE_PAD, raw)),
            clamped,
          };
        };

        // Player dot (always at center)
        ctx.beginPath();
        ctx.arc(lineX0 + lineW / 2, lineY, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = "#00e5cc";
        ctx.fill();
        ctx.strokeStyle = "rgba(0,220,200,0.5)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Draw city tick markers
        const cities = citiesRef.current;
        for (let ci = 0; ci < cities.length; ci++) {
          const city = cities[ci];
          const color = cityColors[ci] ?? "#ffffff";
          const isTarget = ci === bomberTarget;
          const { x: cx, clamped } = getNavX(city.x);

          // Vertical tick — taller and brighter for the targeted city
          const tickH = isTarget ? 9 : 6;
          ctx.beginPath();
          ctx.moveTo(cx, lineY - tickH);
          ctx.lineTo(cx, lineY + tickH);
          ctx.strokeStyle = color;
          ctx.lineWidth = isTarget ? 2.5 : 1.5;
          ctx.globalAlpha = clamped ? 0.7 : 1;
          ctx.stroke();
          ctx.globalAlpha = 1;

          // Pulsing ring on targeted city
          if (isTarget) {
            const pulse = 0.5 + Math.sin(hudNow * 0.008) * 0.35;
            ctx.beginPath();
            ctx.arc(cx, lineY, 5 + pulse * 2, 0, Math.PI * 2);
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.globalAlpha = pulse * 0.7;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }

          // Arrow cap when clamped to show it's off the edge
          if (clamped) {
            const dir = cx <= lineX0 + EDGE_PAD ? -1 : 1;
            ctx.beginPath();
            ctx.moveTo(cx + dir * 4, lineY - 3);
            ctx.lineTo(cx + dir * 7, lineY);
            ctx.lineTo(cx + dir * 4, lineY + 3);
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.7;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }

          // City name label above the line
          ctx.font = `bold 7px monospace`;
          ctx.textAlign = "center";
          ctx.fillStyle = color;
          ctx.globalAlpha = clamped ? 0.6 : 1;
          ctx.fillText(city.name.split(" ")[0], cx, navY + 8); // first word only to keep it short
          ctx.globalAlpha = 1;
        }

        // Depot X marker
        {
          const { x: cx, clamped } = getNavX(depotWorldX);
          const xs = 4;
          ctx.beginPath();
          ctx.moveTo(cx - xs, lineY - xs);
          ctx.lineTo(cx + xs, lineY + xs);
          ctx.moveTo(cx + xs, lineY - xs);
          ctx.lineTo(cx - xs, lineY + xs);
          ctx.strokeStyle = "#f0c830";
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = clamped ? 0.7 : 1;
          ctx.stroke();
          ctx.globalAlpha = 1;

          if (clamped) {
            const dir = cx <= lineX0 + EDGE_PAD ? -1 : 1;
            ctx.beginPath();
            ctx.moveTo(cx + dir * 5, lineY - 3);
            ctx.lineTo(cx + dir * 8, lineY);
            ctx.lineTo(cx + dir * 5, lineY + 3);
            ctx.strokeStyle = "#f0c830";
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.7;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }

          ctx.font = "bold 7px monospace";
          ctx.textAlign = "center";
          ctx.fillStyle = "#f0c830";
          ctx.globalAlpha = clamped ? 0.6 : 1;
          ctx.fillText("DEPOT", cx, navY + NAV_H - 3);
          ctx.globalAlpha = 1;
        }

        ctx.restore();
      }

      if (showFpsRef.current) {
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(cw - 80, ch - 30, 76, 24);
        ctx.fillStyle = "#0f0";
        ctx.font = "bold 14px monospace";
        ctx.textAlign = "right";
        ctx.fillText(`FPS: ${fpsDisplayRef.current}`, cw - 8, ch - 12);
      }

      ctx.restore();
      drawWaveTransition(ctx, waveRef.current, cw, ch);
      rafRef.current = requestAnimationFrame(loop);
    };

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

  // Gamepad polling for menus
  useEffect(() => {
    let rafId = 0;
    const pollMenuGamepad = () => {
      const gp = pollGamepad();
      const faceAPressed = gp.faceA && !gpFaceAPrev.current;
      const startPressed = gp.start && !gpStartPrev.current;
      gpFaceAPrev.current = gp.faceA;
      gpStartPrev.current = gp.start;

      if (!gameStartedRef.current && !gameOverRef.current && (faceAPressed || startPressed)) {
        gameStartedRef.current = true;
        setGameStarted(true);
        setShowHint(false);
        scoreRef.current = 0;
        waveRef.current = createWaveState();
        cityHPRef.current = citiesRef.current.map(() => ({ hp: SHIP_MAX_HP, maxHp: SHIP_MAX_HP }));
        resetEnemies();
        resetSubmarines();
        resetMinelayer();
        resetPickups(WORLD_WIDTH);
        resetJetTrail();
        fuelRef.current = MAX_FUEL;
        // Set initial bomber target randomly
        const initialTarget = Math.floor(Math.random() * NUM_CITIES);
        setBomberTargetCity(initialTarget);
        bomberTargetRef.current = initialTarget;
        if (musicRef.current) {
          musicRef.current.currentTime = 0;
          musicRef.current.play().catch(() => {});
        }
      }

      if (gameOverRef.current && faceAPressed) window.location.reload();

      if (pausedRef.current && gp.connected) {
        const PAUSE_MENU_COUNT = 4;
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
          } else if (pauseMenuIndexRef.current === 3) window.location.reload();
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
      style={{ transition: "transform 150ms cubic-bezier(0.22, 1, 0.36, 1)", cursor: "crosshair" }}
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
            cityHPRef.current = citiesRef.current.map(() => ({ hp: SHIP_MAX_HP, maxHp: SHIP_MAX_HP }));
            resetEnemies();
            resetSubmarines();
            resetMinelayer();
            resetPickups(WORLD_WIDTH);
            resetJetTrail();
            fuelRef.current = MAX_FUEL;
            const initialTarget = Math.floor(Math.random() * NUM_CITIES);
            setBomberTargetCity(initialTarget);
            bomberTargetRef.current = initialTarget;
            if (musicRef.current) {
              musicRef.current.currentTime = 0;
              musicRef.current.play().catch(() => {});
            }
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
            Marine Emergency Response unit. Defend the three floating cities.
          </div>
          <div className="max-w-2xl text-center mb-8" style={{ fontFamily: "var(--font-mono)" }}>
            <div className="mb-4 px-4 py-3 rounded" style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
              <div className="text-xs tracking-widest uppercase mb-2" style={{ color: "#f7d794" }}>
                OBJECTIVE
              </div>
              <p className="text-sm leading-relaxed" style={{ color: "#ccc" }}>
                Protect three floating cities: <span style={{ color: "#ff7f50" }}>PORT ASTRA</span>,{" "}
                <span style={{ color: "#00dcff" }}>HAVEN</span>, and <span style={{ color: "#a0ff80" }}>NOVA MARE</span>
                . Each wave, enemy bombers will focus on a single city — watch the HUD to know which is under attack!
                Lose any city and the mission fails.
              </p>
            </div>
            <div className="mb-4 px-4 py-3 rounded" style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
              <div className="text-xs tracking-widest uppercase mb-2" style={{ color: "#74b9ff" }}>
                KEY MECHANICS
              </div>
              <div className="text-sm leading-relaxed space-y-1" style={{ color: "#ccc" }}>
                <p>
                  <span style={{ color: "#74b9ff" }}>FUEL</span> — Flying uses water. Dive underwater to refuel.
                </p>
                <p>
                  <span style={{ color: "#f0c830" }}>AMMO</span> — Limited ammo. Collect ammo crates that drop during
                  combat.
                </p>
                <p>
                  <span style={{ color: "#5a9" }}>BARREL ROLL</span> — Dodge enemy fire with a quick lateral roll.
                </p>
                <p>
                  <span style={{ color: "#ff7675" }}>BOOST</span> — Hold <span style={{ color: "#ff7675" }}>W</span> for
                  high-speed boost. Uses more fuel, locks steering, deflects missiles.
                </p>
                <p>
                  <span style={{ color: "#64ffeb" }}>RAM BLADES</span> — At full HP, blades extend. Boost into enemies
                  to destroy them instantly!
                </p>
                <p>
                  <span style={{ color: "#ffb830" }}>CITY REPAIR</span> — Repair pickups heal the most damaged city
                  automatically.
                </p>
              </div>
            </div>
            <div className="flex gap-4 text-left text-xs" style={{ color: "#999" }}>
              <div className="flex-1 px-3 py-2 rounded" style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                <div className="tracking-widest uppercase mb-2" style={{ color: "#D93636", fontSize: "10px" }}>
                  MOUSE / KEYBOARD
                </div>
                <p>
                  <span style={{ color: "#ccc" }}>Left Click</span> — Thrust
                </p>
                <p>
                  <span style={{ color: "#ccc" }}>Right Click</span> — Fire
                </p>
                <p>
                  <span style={{ color: "#ccc" }}>A / D</span> — Barrel Roll
                </p>
                <p>
                  <span style={{ color: "#ccc" }}>W</span> — Boost
                </p>
                <p>
                  <span style={{ color: "#ccc" }}>ESC</span> — Pause
                </p>
              </div>
              <div className="flex-1 px-3 py-2 rounded" style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                <div className="tracking-widest uppercase mb-2" style={{ color: "#D93636", fontSize: "10px" }}>
                  GAMEPAD
                </div>
                <p>
                  <span style={{ color: "#ccc" }}>Stick</span> — Aim
                </p>
                <p>
                  <span style={{ color: "#ccc" }}>Y / LB / LT</span> — Thrust
                </p>
                <p>
                  <span style={{ color: "#ccc" }}>A / B / X / RB / RT</span> — Fire
                </p>
                <p>
                  <span style={{ color: "#ccc" }}>D-Pad ◄►</span> — Barrel Roll
                </p>
                <p>
                  <span style={{ color: "#ccc" }}>Start</span> — Pause
                </p>
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
            {[
              { label: "Resume", color: "#f7d794" },
              { label: `Stick: ${useRightStick ? "RIGHT" : "LEFT"}`, color: "#f7d794" },
              { label: "Music", color: "#f7d794", isSlider: true },
              { label: "Restart", color: "#D93636" },
            ].map((item, idx) => (
              <button
                key={idx}
                onClick={() => {
                  if (idx === 0) {
                    pausedRef.current = false;
                    setPaused(false);
                    if (loopRef.current) rafRef.current = requestAnimationFrame(loopRef.current);
                  } else if (idx === 1) {
                    const nv = !useRightStick;
                    useRightStickRef.current = nv;
                    setUseRightStick(nv);
                  } else if (idx === 3) window.location.reload();
                }}
                className="px-6 py-3 text-sm tracking-widest uppercase border cursor-pointer"
                style={{
                  color: pauseMenuIndex === idx ? item.color : "#888",
                  borderColor: pauseMenuIndex === idx ? item.color : "#555",
                  backgroundColor:
                    pauseMenuIndex === idx
                      ? `rgba(${item.color === "#D93636" ? "217,54,54" : "247,215,148"},0.1)`
                      : "transparent",
                  fontFamily: "var(--font-mono)",
                  minWidth: "280px",
                }}
              >
                {pauseMenuIndex === idx ? "► " : "  "}
                {(item as any).isSlider ? (
                  <span className="inline-flex items-center gap-3">
                    Music
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={musicVolume}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setMusicVolume(v);
                        if (musicRef.current) musicRef.current.volume = v;
                      }}
                      className="flex-1 accent-[#f7d794] cursor-pointer"
                      style={{ height: "4px" }}
                    />
                    <span style={{ fontSize: "10px" }}>{Math.round(musicVolume * 100)}%</span>
                  </span>
                ) : (
                  item.label
                )}
              </button>
            ))}
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

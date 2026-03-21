# M.E.R. MAIDS — Developer Guide

## What is this project?

**M.E.R. MAIDS** (Marine Emergency Response unit) is a 2D arcade shooter built entirely in the browser. You pilot a water-powered mech defending a floating city from waves of enemy aircraft and submarines.

---

## Technology Stack

| Technology | What it does | Learn more |
|---|---|---|
| **TypeScript** | Typed JavaScript — catches bugs at compile time | [typescriptlang.org](https://www.typescriptlang.org/docs/) |
| **React 18** | UI framework — manages the game's menu screens and overlays | [react.dev](https://react.dev/) |
| **Vite** | Build tool — instant dev server, fast builds | [vitejs.dev](https://vitejs.dev/) |
| **HTML Canvas API** | The actual game rendering — all graphics are drawn with `ctx.fillRect()`, `ctx.arc()`, etc. | [MDN Canvas Tutorial](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial) |
| **Tailwind CSS** | Utility-first CSS framework — used for menu/overlay styling | [tailwindcss.com](https://tailwindcss.com/docs) |
| **shadcn/ui** | Pre-built UI components (not heavily used in-game) | [ui.shadcn.com](https://ui.shadcn.com/) |

### Key concepts to learn

1. **HTML Canvas 2D** — This is the core of the game. All rendering uses `CanvasRenderingContext2D`. Start here: [MDN Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
2. **requestAnimationFrame** — The game loop runs at ~60fps using `requestAnimationFrame()`. [MDN docs](https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame)
3. **TypeScript interfaces** — Each game entity (enemy, bullet, submarine) is defined as a TypeScript `interface`. [TS Handbook](https://www.typescriptlang.org/docs/handbook/2/objects.html)
4. **React useRef** — Game state lives in `useRef()` instead of `useState()` to avoid re-renders during the 60fps loop. [React docs](https://react.dev/reference/react/useRef)
5. **Gamepad API** — Controller support uses the browser's built-in Gamepad API. [MDN docs](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API)

---

## Project Structure

```
src/
├── pages/
│   └── Index.tsx          # Main game component — game loop, player logic, HUD, menus
├── game/
│   ├── water.ts           # Water rendering, wave math, splash/ripple particles
│   ├── boat.ts            # Floating city — platform, buildings, dome barrier
│   ├── effects.ts          # Shared visual effects — explosions, score popups
│   ├── enemies.ts         # Air enemies — bombers, chasers, missiles, bombs
│   ├── gunboat.ts         # Armored surface enemy — barrier dome, underwater-only vulnerability
│   ├── submarine.ts       # Underwater enemies — submarines that attack the city
│   ├── pickups.ts         # All collectibles — health kits, repair kits, ammo crates
│   ├── waves.ts           # Wave progression system — difficulty scaling
│   ├── jettrail.ts        # Water-jet propulsion particle effects
│   └── gamepad.ts         # Gamepad/controller input polling
├── App.tsx                # React app shell — routing setup
├── main.tsx               # Entry point — mounts React app
└── index.css              # Global styles and CSS variables
```

---

## Architecture Overview

### Game Loop Pattern

The game uses a **single `requestAnimationFrame` loop** inside `Index.tsx`:

```
loop() {
  1. Poll input (keyboard, mouse, gamepad)
  2. Update physics (position, velocity, gravity, buoyancy)
  3. Update game systems (enemies, submarines, powerups, waves)
  4. Check collisions (bullets↔enemies, bombs↔city, player↔projectiles)
  5. Draw everything (sky → water → entities → player → HUD)
  6. Request next frame
}
```

### State Management

- **Game state** is stored in `useRef()` objects (not `useState`) because React re-renders are too slow for 60fps updates.
- **UI state** (menus, pause screen, game over) uses `useState` since those only change occasionally.
- **Entity lists** (enemies, bullets, submarines) are module-level arrays in their respective files, mutated directly for performance.

### Coordinate System

- **World space**: The game world is `WORLD_WIDTH` (9000) pixels wide and wraps horizontally. Three named cities are spread across the world.
- **View space**: The camera follows the player. `viewW = canvas.width / ZOOM`, `viewH = canvas.height / ZOOM`.
- **Screen space**: Raw pixel coordinates on the canvas (used for HUD drawing).
- The camera offset is `camX = playerX - viewW / 2`.

### World Wrapping

The world wraps seamlessly — when the player crosses `x=9000`, they appear at `x=0`. The renderer draws 3 copies of the world (offset by `±WORLD_WIDTH`) to handle the seam.

### Multiple Cities

The game features three named floating cities spread across the 9000-wide world:
- **Port Zenith** (left)
- **Haven** (center)
- **New Bastion** (right)

Each city has unique building layouts. Bombers rotate targets between waves so the same city is never attacked twice in a row. Submarines always target a different city than the bombers. Score-based powerup drops spawn at whichever city is nearest to the player.

---

## File-by-File Guide

### `src/pages/Index.tsx` — Main Game Component (~2200 lines)

This is the heart of the game. It contains:

- **Constants** (lines 81-110): Tuning values for speed, gravity, ammo, fuel, etc.
- **Refs** (lines 110-180): All mutable game state stored in React refs.
- **Input handling** (lines 200-270): Mouse, keyboard, and gamepad event listeners.
- **Game loop** (lines 280-1300): The main `requestAnimationFrame` loop containing:
  - Input processing and aim calculation
  - Barrel roll mechanics
  - Physics (thrust, gravity, buoyancy, air drag)
  - Buoyancy suppression while thrusting or firing (player stays submerged)
  - Fuel and ammo management
  - Multi-city enemy/submarine/powerup updates
  - Nearest-city powerup drop targeting
  - Bullet-platform collision blocking
  - Collision detection (with boost damage immunity for normal bullets)
  - Canvas rendering (sky → water → entities → player → HUD)
- **Player rendering** (~lines 1100-1250): Frutiger Aero mech with swept-back fighter jet ram wings.
- **HUD rendering** (~lines 1250-1700): Analog instrument panel with unique indicator styles per stat:
  - **Lives**: Green round bulb lights with metal bezels
  - **HP**: Amber diamond/gem-shaped indicator lights
  - **Ammo**: Silver light strip with colored glass panel segments
  - **Fuel**: Vertical glass tubes with animated liquid fill, wobbling meniscus, tick marks, and glass reflections
- **Menus** (lines 1750+): React JSX for start screen, pause menu, and game over screen.

### `src/game/water.ts` — Water System

- `getWaterSurfaceY()`: Returns the Y coordinate of the water surface.
- `getWaveY()`: Calculates wave height at any X position using layered sine waves.
- `isSubmerged()`: Checks if a Y position is below water.
- `spawnSplash()`: Creates splash particle effects when entering/exiting water.
- `updateParticles()`: Advances wave time and updates splash/ripple physics.
- `drawWater()`: Renders the ocean with gradient, caustic lights, wave highlights, foam caps, ripples, and splashes.

### `src/game/boat.ts` — Floating Cities

- `createCities()`: Creates all three cities (Port Zenith, Haven, New Bastion) with unique building layouts.
- `createBoat()`: Initializes a single city platform (used internally).
- `getBoatTopY()`: Returns the top Y of a platform (follows waves).
- `drawBoat()`: Renders the full city — platform base, buildings with lights, dome barrier with cracks, smoke/fire effects when damaged.
- `collideWithBoat()`: Pushes the player away from the city platform. Also blocks bullets from passing through platforms.

### `src/game/effects.ts` — Shared Visual Effects

- **Explosions**: Expanding orange/white circles that fade out. Spawned by enemies, submarines, and missiles on destruction.
- **Score Popups**: Floating "+N" text that drifts upward. Appears at destroyed enemy locations.
- `spawnExplosion()`: Creates an explosion (and optional score popup). Called from `enemies.ts` and `submarine.ts`.
- `updateEffects()`: Ages explosions and popups, removes expired ones.
- `drawEffects()`: Renders all active effects in world space.

### `src/game/enemies.ts` — Air Enemies

- **Bombers**: Fly across the screen, drop dark hexagonal tumbling bombs with pulsing toxic green cores on a targeted city. Target city rotates each wave (never the same city twice in a row).
- **Chasers**: Aggressive fighters that pursue the player and fire bullets + homing missiles. Spawn at 3x the normal rate but fire missiles at 1/3rd rate and bullets at 1/2 rate.
- **Homing Missiles**: Track the player with turn rate limiting. Can be deflected by barrel rolls into an erratic lethal swerve that can destroy any enemy, mine, or minelayer. Explode on contact with the water surface.
- `updateEnemies()`: Spawns and updates all air enemies based on wave difficulty. Also calls `updateEffects()`.
- `checkBulletCollisions()`: Tests player bullets against all enemy types.
- `drawEnemies()`: Renders all air enemy types, their projectiles, and calls `drawEffects()`.
- `setBomberTargetCity()` / `getBomberTargetCityIndex()`: Controls which city bombers attack each wave.
- Enemies use a **dark industrial robotic** aesthetic — metal paneling, mechanical details, pulsing red/green sensor eyes.

### `src/game/gunboat.ts` — Gunboat (Armored Surface Enemy)

- Rare, heavily armored surface vessel that floats on the water surface following wave motion.
- Protected by an **impenetrable red barrier dome** on top — player bullets from above are blocked (with visual flash feedback).
- Can **only be destroyed by attacking from below** (underwater shots or rams).
- Fires bullets rapidly (0.35s interval) at the player within a **180° upper hemisphere** arc (far left to far right, but never into the water).
- **Will not fire** when the player is submerged — diving underwater is both the attack strategy and a way to avoid its fire.
- **Reverses direction** when approaching any city platform or ammo depot, maintaining safe distance.
- First spawns after 30 seconds, then every 45–60 seconds. Max 1–3 active depending on wave difficulty.
- Awards 300 points on destruction.
- `updateGunboats()`: Handles spawning, movement, platform avoidance, firing AI, and bullet updates.
- `checkBulletHitsGunboat()`: Tests player bullets — blocks above-water hits, damages below-water hits.
- `checkRamGunboat()`: Allows ramming from underwater only.
- `checkGunboatBulletHitsPlayer()`: Tests gunboat bullets against the player.
- `drawGunboats()`: Renders hull, turret, engine glow, barrier dome with hex pattern, and health pips.

### `src/game/submarine.ts` — Underwater Enemies

- Submarines approach the city from underwater, charge up, then detonate to damage it.
- The player must dive underwater to intercept them.
- `updateSubmarinesWithDamage()`: Handles spawning, movement, attack charging, and returns damage dealt.
- `drawSubmarines()`: Renders menacing dark hull with crimson accents, pulsing red eye, and attack warning effects.

### `src/game/minelayer.ts` — Mine-Layer Plane & Floating Mines

- A fast plane that flies edge-to-edge dropping naval mines.
- **Mines** have buoyancy — they sink initially then float on the water surface. Never despawn naturally.
- Players can shoot mines (explosion + score) but touching one deals 1 damage.
- Mines use a **dark industrial aesthetic** — rust-toned orbs with slow rotation, red danger glow, energy spikes with glowing tips, and a central robotic eye.
- `updateMinelayer()`: Handles plane spawning, mine dropping, and mine physics.
- `checkBulletHitsMines()`: Tests player bullets against floating mines.
- `checkPlayerHitsMine()`: Tests player collision with mines.
- `drawMinelayer()`: Renders the plane and all active mines.

### `src/game/pickups.ts` — Collectible Pickups

All collectible items in one place:
- **Health Kit** ("HP"): Restores 1 player HP. Spawns every 1500 points. Sinks underwater from city waterline.
- **Barrier Repair** ("Barrier"): Restores 3 city HP. Spawns every 1200 points. Sinks underwater from city waterline.
- **Ammo Crate** (gold): Fully restores ammo. Spawns at world edges when ammo drops below threshold.
- **Rare Ammo Drop** (blue, "+20"): Grants 20 ammo. Spawns periodically every 40–80 seconds, despawns after 20s.
- Underwater pickups bob gently when settled and blink before despawning (18 seconds).
- Only one of each type can exist at a time.

### `src/game/waves.ts` — Wave System

- Each wave has a score threshold and time limit.
- When a wave is completed, enemies flee the screen before the next wave begins.
- Difficulty multiplier increases each wave (affects spawn rates and enemy counts).
- Extra life awarded every 3 waves.

### `src/game/jettrail.ts` — Jet Propulsion Effects

- Four particle types: `core` (tight beam), `spray` (fan droplets), `mist` (cloud), `drip` (falling drops).
- Sputters when fuel is low.
- `getShipPitch()`: Calculates nose tilt based on thrust state for visual feedback.

### `src/game/gamepad.ts` — Controller Input

- Polls the browser's Gamepad API each frame.
- Maps standard gamepad buttons to game actions (thrust, fire, roll, pause).
- Supports both left and right stick aiming (togglable in pause menu).
- Includes deadzone filtering for analog sticks.

---

## How to Run Locally

```bash
# 1. Clone the repo
git clone <YOUR_GIT_URL>
cd <PROJECT_NAME>

# 2. Install dependencies
npm install

# 3. Start dev server (hot-reload)
npm run dev

# 4. Build for production
npm run build

# 5. Run tests
npm test
```

---

## How to Modify the Game

### Changing game balance
Edit the constants at the top of `src/pages/Index.tsx`:
- `SPEED` — Player thrust power
- `GRAVITY` / `BUOYANCY` — Flight feel
- `MAX_FUEL` — Fuel limit
- `BULLET_SPEED` / `SHOOT_INTERVAL` — Weapon stats

Ammo/pickup constants are in `src/game/pickups.ts`:
- `MAX_AMMO` / `AMMO_LOW_THRESHOLD` — Ammo capacity and emergency crate trigger

### Adding a new enemy type
1. Define an interface in `src/game/enemies.ts`
2. Add a module-level array and spawn logic in `updateEnemies()`
3. Add collision checking in `checkBulletCollisions()`
4. Add rendering in `drawEnemies()`
5. Clean up dead entities in the filter step

### Adding a new power-up type
1. Add to the `PowerupType` union in `src/game/pickups.ts`
2. Add spawn logic in `checkScoreRewards()` (for score-based) or create a new update function (for timer-based)
3. Add pickup effect in `Index.tsx` where `checkPowerupPickup()` is called
4. Add visual rendering in `drawPickups()`

---

## Canvas Drawing Cheatsheet

```typescript
// Rectangle
ctx.fillStyle = "#ff0000";
ctx.fillRect(x, y, width, height);

// Circle
ctx.beginPath();
ctx.arc(x, y, radius, 0, Math.PI * 2);
ctx.fill();

// Custom shape
ctx.beginPath();
ctx.moveTo(x1, y1);
ctx.lineTo(x2, y2);
ctx.lineTo(x3, y3);
ctx.closePath();
ctx.fill();

// Glow effect
ctx.shadowColor = "rgba(255, 0, 0, 0.5)";
ctx.shadowBlur = 15;
// ...draw something...
ctx.shadowColor = "transparent"; // reset

// Rotation
ctx.save();
ctx.translate(centerX, centerY);
ctx.rotate(angleInRadians);
// ...draw at origin...
ctx.restore();

// Transparency
ctx.globalAlpha = 0.5;
// ...draw...
ctx.globalAlpha = 1; // reset
```

---

## Tips

- **Performance**: The game draws every frame. Avoid creating objects in the render loop — reuse arrays and objects.
- **Debugging**: Add `console.log` in the game loop sparingly (it runs 60x/sec). Use conditional logging: `if (frameCount % 60 === 0) console.log(...)`.
- **Canvas state**: Always pair `ctx.save()` with `ctx.restore()` to avoid leaking transforms/styles.
- **Module state**: Enemy/submarine/pickup arrays are module-level (not React state). Reset them in their `reset*()` functions when starting a new game.

/**
 * gamepad.ts — Gamepad/Controller Input System
 * 
 * Polls the browser's Gamepad API each frame and maps physical
 * controller inputs to game actions.
 * 
 * Supports standard gamepads (Xbox, PlayStation, etc.):
 * - Left stick: Aim direction (or movement)
 * - Right stick: Alternative aim direction (togglable in pause menu)
 * - D-pad left/right: Barrel roll
 * - D-pad up/down: Menu navigation
 * - A/B/X/RB/RT: Fire weapon
 * - Y/LB/LT: Thrust
 * - Start: Pause/resume
 * - A (face button): Menu select
 * 
 * Uses the browser's standard Gamepad API:
 * https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API
 * 
 * The gamepad is polled (not event-driven), so pollGamepad() must be
 * called every frame from the game loop.
 */

// ==================== INTERFACE ====================

/** Processed gamepad state — all inputs mapped to game actions */
export interface GamepadState {
  // Left stick direction (normalized, with deadzone applied)
  stickX: number;        // -1.0 to 1.0
  stickY: number;        // -1.0 to 1.0
  stickActive: boolean;  // true if stick is outside deadzone

  // Right stick direction (normalized, with deadzone applied)
  rightStickX: number;
  rightStickY: number;
  rightStickActive: boolean;

  // D-pad buttons (digital, on/off)
  dpadLeft: boolean;
  dpadRight: boolean;
  dpadUp: boolean;
  dpadDown: boolean;

  // Action buttons (mapped to game actions)
  fire: boolean;    // A, X, RB, or RT pressed
  thrust: boolean;  // Y, LB, or LT pressed
  boost: boolean;   // B button (high-speed boost)
  start: boolean;   // Start/Options button
  faceA: boolean;   // A button specifically (for menu selection)

  // Connection status
  connected: boolean;
}

// ==================== CONSTANTS ====================

/** 
 * Analog stick deadzone — inputs below this magnitude are ignored.
 * Prevents drift from slightly off-center resting sticks.
 */
const DEADZONE = 0.15;

// ==================== MODULE STATE ====================

/** Cached last gamepad state (returned when no gamepad is connected) */
let lastState: GamepadState = {
  stickX: 0,
  stickY: 0,
  stickActive: false,
  rightStickX: 0,
  rightStickY: 0,
  rightStickActive: false,
  dpadLeft: false,
  dpadRight: false,
  dpadUp: false,
  dpadDown: false,
  fire: false,
  thrust: false,
  boost: false,
  start: false,
  faceA: false,
  connected: false,
};

// ==================== POLLING ====================

/**
 * Poll the gamepad and return the current state.
 * Must be called every frame — the Gamepad API doesn't use events,
 * it provides a snapshot of the current state.
 * 
 * If multiple gamepads are connected, uses the first one found.
 * 
 * @returns The current gamepad state with all inputs mapped
 */
export function pollGamepad(): GamepadState {
  const gamepads = navigator.getGamepads();
  let gp: Gamepad | null = null;

  // Find the first connected gamepad
  for (const pad of gamepads) {
    if (pad && pad.connected) {
      gp = pad;
      break;
    }
  }

  // No gamepad connected — return default (all released) state
  if (!gp) {
    lastState = {
      ...lastState,
      connected: false,
      stickActive: false,
      rightStickActive: false,
      fire: false,
      thrust: false,
      boost: false,
      start: false,
      faceA: false,
      dpadLeft: false,
      dpadRight: false,
      dpadUp: false,
      dpadDown: false,
    };
    return lastState;
  }

  // ---- LEFT STICK (axes 0 & 1) ----
  let sx = gp.axes[0] ?? 0;  // Horizontal: -1 left, +1 right
  let sy = gp.axes[1] ?? 0;  // Vertical: -1 up, +1 down
  const mag = Math.hypot(sx, sy);
  const stickActive = mag > DEADZONE;
  if (!stickActive) {
    sx = 0;
    sy = 0;
  }

  // ---- RIGHT STICK (axes 2 & 3) ----
  let rsx = gp.axes[2] ?? 0;
  let rsy = gp.axes[3] ?? 0;
  const rmag = Math.hypot(rsx, rsy);
  const rightStickActive = rmag > DEADZONE;
  if (!rightStickActive) {
    rsx = 0;
    rsy = 0;
  }

  // ---- D-PAD (buttons 12-15 in standard mapping) ----
  const dpadUp = gp.buttons[12]?.pressed ?? false;
  const dpadDown = gp.buttons[13]?.pressed ?? false;
  const dpadLeft = gp.buttons[14]?.pressed ?? false;
  const dpadRight = gp.buttons[15]?.pressed ?? false;

  // ---- FIRE: A(0), X(2), RB(5), RT(7) ----
  const fire =
    (gp.buttons[0]?.pressed ?? false) ||
    (gp.buttons[2]?.pressed ?? false) ||
    (gp.buttons[5]?.pressed ?? false) ||  // Right bumper
    (gp.buttons[7]?.pressed ?? false) ||  // Right trigger (digital)
    (gp.buttons[7]?.value ?? 0) > 0.15;  // Right trigger (analog)

  // ---- BOOST: B/Circle(1) ----
  const boost = gp.buttons[1]?.pressed ?? false;

  // ---- THRUST: Y/Triangle(3), LB(4), LT(6) ----
  const thrust =
    (gp.buttons[3]?.pressed ?? false) ||
    (gp.buttons[4]?.pressed ?? false) ||  // Left bumper
    (gp.buttons[6]?.pressed ?? false) ||  // Left trigger (digital)
    (gp.buttons[6]?.value ?? 0) > 0.15;  // Left trigger (analog)

  // ---- MENU BUTTONS ----
  const start = gp.buttons[9]?.pressed ?? false;  // Start/Options
  const faceA = gp.buttons[0]?.pressed ?? false;   // A button (menu select)

  // Cache and return
  lastState = {
    stickX: sx,
    stickY: sy,
    stickActive,
    rightStickX: rsx,
    rightStickY: rsy,
    rightStickActive,
    dpadLeft,
    dpadRight,
    dpadUp,
    dpadDown,
    fire,
    thrust,
    boost,
    start,
    faceA,
    connected: true,
  };

  return lastState;
}

/**
 * Get the last polled gamepad state without re-polling.
 * Useful for reading state from multiple places in the same frame.
 */
export function getGamepadState(): GamepadState {
  return lastState;
}

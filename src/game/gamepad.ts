// Gamepad input handler — maps joystick, d-pad, and buttons to game controls

export interface GamepadState {
  // Left stick direction (normalized)
  stickX: number;
  stickY: number;
  stickActive: boolean;

  // Right stick direction (normalized)
  rightStickX: number;
  rightStickY: number;
  rightStickActive: boolean;

  // D-pad
  dpadLeft: boolean;
  dpadRight: boolean;
  dpadUp: boolean;
  dpadDown: boolean;

  // Fire button
  fire: boolean;

  // Thrust (LT, LB, or Y/Triangle)
  thrust: boolean;

  // Menu buttons
  start: boolean;
  faceA: boolean;

  // Connected
  connected: boolean;
}

const DEADZONE = 0.15;

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
  start: false,
  faceA: false,
  connected: false,
};

export function pollGamepad(): GamepadState {
  const gamepads = navigator.getGamepads();
  let gp: Gamepad | null = null;

  for (const pad of gamepads) {
    if (pad && pad.connected) {
      gp = pad;
      break;
    }
  }

  if (!gp) {
    lastState = {
      ...lastState,
      connected: false,
      stickActive: false,
      rightStickActive: false,
      fire: false,
      thrust: false,
      start: false,
      faceA: false,
      dpadLeft: false,
      dpadRight: false,
      dpadUp: false,
      dpadDown: false,
    };
    return lastState;
  }

  // Left stick (axes 0 & 1)
  let sx = gp.axes[0] ?? 0;
  let sy = gp.axes[1] ?? 0;
  const mag = Math.hypot(sx, sy);
  const stickActive = mag > DEADZONE;
  if (!stickActive) {
    sx = 0;
    sy = 0;
  }

  // Right stick (axes 2 & 3)
  let rsx = gp.axes[2] ?? 0;
  let rsy = gp.axes[3] ?? 0;
  const rmag = Math.hypot(rsx, rsy);
  const rightStickActive = rmag > DEADZONE;
  if (!rightStickActive) {
    rsx = 0;
    rsy = 0;
  }

  // D-pad: standard mapping buttons 12-15
  const dpadUp = gp.buttons[12]?.pressed ?? false;
  const dpadDown = gp.buttons[13]?.pressed ?? false;
  const dpadLeft = gp.buttons[14]?.pressed ?? false;
  const dpadRight = gp.buttons[15]?.pressed ?? false;

  // Fire: any face button (A=0, B=1, X=2, Y=3), R1 (5), or RT (7, analog)
  const fire =
    (gp.buttons[0]?.pressed ?? false) ||
    (gp.buttons[1]?.pressed ?? false) ||
    (gp.buttons[2]?.pressed ?? false) ||
    (gp.buttons[3]?.pressed ?? false) ||
    (gp.buttons[5]?.pressed ?? false) ||
    (gp.buttons[7]?.pressed ?? false) ||
    (gp.buttons[7]?.value ?? 0) > 0.15; // RT analog

  // Left trigger: LT only (button 6, analog trigger)
  const leftShoulder =
    (gp.buttons[6]?.pressed ?? false) ||
    (gp.buttons[6]?.value ?? 0) > 0.15; // LT analog

  // Start/Options button (9)
  const start = gp.buttons[9]?.pressed ?? false;

  // Face A (0) — separate from fire for menu use
  const faceA = gp.buttons[0]?.pressed ?? false;

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
    leftShoulder,
    start,
    faceA,
    connected: true,
  };

  return lastState;
}

export function getGamepadState(): GamepadState {
  return lastState;
}

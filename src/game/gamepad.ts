// Gamepad input handler — maps joystick, d-pad, and buttons to game controls

export interface GamepadState {
  // Left stick direction (normalized)
  stickX: number;
  stickY: number;
  stickActive: boolean; // stick deflected past deadzone

  // D-pad
  dpadLeft: boolean;
  dpadRight: boolean;

  // Fire button (any face button)
  fire: boolean;

  // Connected
  connected: boolean;
}

const DEADZONE = 0.15;

let lastState: GamepadState = {
  stickX: 0,
  stickY: 0,
  stickActive: false,
  dpadLeft: false,
  dpadRight: false,
  fire: false,
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
    lastState = { ...lastState, connected: false, stickActive: false, fire: false, dpadLeft: false, dpadRight: false };
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

  // D-pad: standard mapping buttons 14 (left) and 15 (right)
  const dpadLeft = gp.buttons[14]?.pressed ?? false;
  const dpadRight = gp.buttons[15]?.pressed ?? false;

  // Fire: any face button (A=0, B=1, X=2, Y=3) or right shoulder (R1=5, R2=7)
  const fire =
    (gp.buttons[0]?.pressed ?? false) ||
    (gp.buttons[1]?.pressed ?? false) ||
    (gp.buttons[2]?.pressed ?? false) ||
    (gp.buttons[3]?.pressed ?? false) ||
    (gp.buttons[5]?.pressed ?? false) ||
    (gp.buttons[7]?.pressed ?? false);

  lastState = {
    stickX: sx,
    stickY: sy,
    stickActive,
    dpadLeft,
    dpadRight,
    fire,
    connected: true,
  };

  return lastState;
}

export function getGamepadState(): GamepadState {
  return lastState;
}

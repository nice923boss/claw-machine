// All tuning knobs live here. Units: 1 unit = 10 cm, seconds, radians.
// The machine front faces +Z; the player stands on the +Z side.

export const MACHINE = {
  floorY: 8, // play floor height (top of the cabinet base)
  half: 4.5, // interior half size: x and z in [-half, half]
  wallTop: 17, // top of the glass walls
  chute: { x0: -4.5, x1: -1.5, z0: 1.5, z1: 4.5 }, // prize hole, front-left corner
  barrierH: 1.5, // height of the clear guards around the hole
  shaftBottomY: 4.5, // bottom of the drop shaft under the hole
  baseHalf: 5.3, // outer half size of the cabinet
  edge: { w: 0.9, h: 0.4 }, // raised strip along the walls rolls plush back within the claw's reach
};

export const CONFIG = {
  physics: {
    step: 1 / 60,
    maxSubSteps: 4,
    gravity: -50,
    iterations: 12,
    sleepSpeedLimit: 0.3,
    sleepTimeLimit: 0.5,
    linearDamping: 0.15,
    angularDamping: 0.55,
    maxSpeed: 30, // plush velocity clamp, keeps squeezed bodies from exploding
    maxSpin: 20,
    // cannon-es caps friction per contact at mu * |g| * mass whatever the normal force, so plush touching
    // with two or three spheres hold far more than mu suggests. Glass, slopes and guards stay slick for that.
    friction: { plushPlush: 0.45, plushFloor: 0.4, plushGlass: 0.02, plushClaw: 0.3 },
  },

  claw: {
    range: 3.0, // hub centre may travel within [-range, range] on x and z
    home: { x: -3.0, z: 3.0 }, // above the prize hole
    topY: 15.2, // hub bottom height while travelling
    moveSpeed: 3.0, // per axis, like two independent motors
    moveAccel: 14,
    returnSpeed: 4.2, // trolley speed back to the hole (vector)
    returnAccel: 6,
    descendSpeed: 3.2,
    ascendSpeed: 2.6,
    stopGap: 0.08, // stop descending when the hub bottom is this close to a plush
    tipClear: 0.06, // finger tips never go lower than floor + this
    hingeRadius: 0.36,
    openAngle: 0.7,
    closedAngle: 0.04, // empty claw: the three tips meet near the axis
    squish: 0.12, // closing fingers push plush beside the target aside, stopping on one only once it is jammed this deep
    closeTime: 0.75,
    openTime: 0.45,
    holdPause: 0.25, // closed claw waits this long before lifting
    topPause: 0.35,
    settleTime: 1.3,
    // The claw hangs from the trolley like a pendulum. Tuned exaggerated: a light push swings it a lot.
    swing: {
      gravity: 50, // pendulum gravity, matches the physics world
      accelK: 1.5, // how strongly trolley acceleration swings the claw (1 = a real pendulum)
      damping: 0.55, // per second while hanging
      lowerDamping: 1.0, // while the cable pays out or reels in, or the claw waits over the hole
      contactDamp: 6, // extra damping while the claw rubs against plush
      maxAngle: 0.45,
      wallBounce: 0.35, // swing speed kept after bumping the glass or a guard
      comDrop: 0.4, // claw centre of mass below the hub bottom
      slipK: 0.25, // a held plush slips more easily per unit of swing speed
      releaseAmp: 0.15, // over the hole the claw opens once the swing is this small,
      releaseWait: 1.0, // or after this long
      settle: 0.04, // swing amplitude the auto test waits for before dropping
    },
  },

  // Grab model: geometry decides whether a grip is possible, the round's claw power
  // decides how likely it holds. Target overall win rate: about 20% to 35% per round.
  grab: {
    powerMin: 0.3, // claw power is rolled per round, like a real machine
    powerMax: 1.0,
    reach: 0.8, // plush centre must be this close to the claw axis (horizontal)
    idealRadius: 0.5, // plush this size or smaller is easiest
    maxRadius: 0.75,
    gripBase: 1.0,
    gripPowerExp: 0.5,
    gripOffsetK: 0.45, // off-centre grabs grip less often
    gripSizeK: 0.25, // big plush grip less often
    slipBase: 0.065, // slip hazard per second at power 0, centred, ideal size
    slipOffsetK: 2.0,
    slipSizeK: 0.8,
    joltSlip: 0.13, // extra one-off slip chance when the claw stops at the top
    weakSlipMax: 0.6, // a weak grip lifts the plush at most this long, then drops it
  },

  // Tag rings: a finger point passing through the ring hangs the plush on that finger.
  hook: { chance: 0.3, ringR: 0.2, tube: 0.03, cord: 0.06, catchR: 0.18, slipBase: 0.05, slipSwingK: 0.12, maxStretch: 0.4, forceK: 5 },

  round: { seconds: 30 },
  wallet: { start: 20, exchange: 10, maxCredits: 99 },

  restock: {
    minSec: 40,
    maxSec: 120,
    debugMinSec: 8,
    debugMaxSec: 15,
    lowCount: 8, // restock at once when fewer remain
    batchMin: 3,
    batchMax: 6,
    cap: 30,
    initial: 20,
  },

  rarity: [
    { id: "common", label: "普通", weight: 70 },
    { id: "rare", label: "稀有", weight: 25 },
    { id: "limited", label: "限定", weight: 5 },
  ],
};

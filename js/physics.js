// Physics world, machine colliders and kinematic helpers shared by the game and the dev spike.
import * as CANNON from "cannon-es";
import { CONFIG, MACHINE } from "./config.js";
import { clamp } from "./util.js";

export { CANNON };

export const GROUP = { STATIC: 1, PLUSH: 2, CLAW: 4, HELD: 8 };
export const MASK = {
  STATIC: GROUP.PLUSH | GROUP.HELD,
  PLUSH: GROUP.STATIC | GROUP.PLUSH | GROUP.CLAW | GROUP.HELD,
  CLAW: GROUP.PLUSH,
  HELD: GROUP.PLUSH, // held plush: pushes other plush, ignores walls and the claw
  LOOSE: GROUP.STATIC | GROUP.PLUSH, // just dropped by the claw: everything except the claw
};

export const V = (x = 0, y = 0, z = 0) => new CANNON.Vec3(x, y, z);

export function createWorld() {
  const P = CONFIG.physics;
  const world = new CANNON.World({ gravity: V(0, P.gravity, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.broadphase.useBoundingBoxes = true; // long wall boxes have huge bounding spheres
  world.solver.iterations = P.iterations;
  world.allowSleep = true;

  const mats = {
    plush: new CANNON.Material("plush"),
    floor: new CANNON.Material("floor"),
    glass: new CANNON.Material("glass"),
    claw: new CANNON.Material("claw"),
  };
  const F = P.friction;
  const pair = (a, b, friction) =>
    world.addContactMaterial(new CANNON.ContactMaterial(a, b, { friction, restitution: 0.02 }));
  pair(mats.plush, mats.plush, F.plushPlush);
  pair(mats.plush, mats.floor, F.plushFloor);
  pair(mats.plush, mats.glass, F.plushGlass);
  pair(mats.plush, mats.claw, F.plushClaw);
  return { world, mats };
}

// Static boxes of the cabinet. Each entry: centre c, half size h, optional tilt about x (rotX) or z (rotZ).
// Shared by the physics world and the debug view so both always match.
export function machineColliders() {
  const { floorY, half, chute, barrierH, baseHalf } = MACHINE;
  const T = 0.5; // wall half thickness
  const bottom = 1;
  const out = [];
  const box = (name, x0, x1, y0, y1, z0, z1) =>
    out.push({
      name,
      c: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
      h: [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2],
      rotX: 0,
    });

  // Play floor with the prize hole cut out of the front-left corner.
  box("floorA", chute.x1, half, bottom, floorY, -half, half);
  box("floorB", -half, chute.x1, bottom, floorY, -half, chute.z0);
  // Walls and ceiling.
  const top = 20;
  box("wallL", -half - 2 * T, -half, bottom, top, -half - 2 * T, half + 2 * T);
  box("wallR", half, half + 2 * T, bottom, top, -half - 2 * T, half + 2 * T);
  box("wallB", -half - 2 * T, half + 2 * T, bottom, top, -half - 2 * T, -half);
  box("wallF", -half - 2 * T, half + 2 * T, floorY, top, half, half + 2 * T);
  box("ceiling", -half - 2 * T, half + 2 * T, MACHINE.wallTop + 0.2, MACHINE.wallTop + 1.2, -half - 2 * T, half + 2 * T);
  // Drop shaft under the hole: front lip, side wall next to the ramp, door at the pickup window.
  box("chuteFront", chute.x0, chute.x1, 4.6, floorY, half, half + 2 * T);
  box("chuteSide", chute.x1, chute.x1 + 1, bottom, floorY, half, half + 2 * T);
  box("door", chute.x0, chute.x1, bottom, 5, baseHalf, baseHalf + 0.1);
  // Clear guards on the two open edges of the hole.
  box("guardX", chute.x1 - 0.06, chute.x1 + 0.06, floorY, floorY + barrierH, chute.z0, chute.z1);
  box("guardZ", chute.x0, chute.x1, floorY, floorY + barrierH, chute.z0 - 0.06, chute.z0 + 0.06);

  // Ramp: top surface runs from (z 1.5, y 4.4) down to (z 5.3, y 2.4), rolling prizes to the door.
  const za = chute.z0, ya = 4.4, zb = baseHalf, yb = 2.4, ht = 0.3;
  const len = Math.hypot(zb - za, ya - yb);
  const rotX = Math.atan2(ya - yb, zb - za);
  const nY = Math.cos(rotX), nZ = Math.sin(rotX);
  out.push({
    name: "ramp",
    c: [(chute.x0 + chute.x1) / 2, (ya + yb) / 2 - nY * ht, (za + zb) / 2 - nZ * ht],
    h: [(chute.x1 - chute.x0) / 2, ht, len / 2 + ht],
    rotX,
  });

  // Raised strips along the walls: plush resting against the glass roll back within the claw's reach.
  const { w: ew, h: eh } = MACHINE.edge;
  const ang = Math.atan2(eh, ew);
  const sLen = Math.hypot(ew, eh) + 0.4; // reaches into the wall and under the floor
  const st = 0.3; // half thickness
  const mid = half - ew / 2;
  const sn = Math.sin(ang) * st;
  const cy = floorY + eh / 2 - Math.cos(ang) * st;
  const slope = (name, c, hh, rx, rz) => out.push({ name, c, h: hh, rotX: rx, rotZ: rz });
  slope("slopeR", [mid + sn, cy, 0], [sLen / 2, st, half], 0, ang);
  slope("slopeL", [-(mid + sn), cy, (chute.z0 - half) / 2], [sLen / 2, st, (chute.z0 + half) / 2], 0, -ang);
  slope("slopeB", [0, cy, -(mid + sn)], [half, st, sLen / 2], ang, 0);
  slope("slopeF", [(chute.x1 + half) / 2, cy, mid + sn], [(half - chute.x1) / 2, st, sLen / 2], -ang, 0);
  return out;
}

export function addMachineColliders(world, mats) {
  const bodies = [];
  for (const b of machineColliders()) {
    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      material: b.name.startsWith("floor") ? mats.floor : mats.glass, // everything but the flat floor is slick
      collisionFilterGroup: GROUP.STATIC,
      collisionFilterMask: MASK.STATIC,
    });
    body.addShape(new CANNON.Box(V(...b.h)));
    body.position.set(...b.c);
    if (b.rotX) body.quaternion.setFromAxisAngle(V(1, 0, 0), b.rotX);
    else if (b.rotZ) body.quaternion.setFromAxisAngle(V(0, 0, 1), b.rotZ);
    body.aabbNeedsUpdate = true;
    world.addBody(body);
    bodies.push(body);
  }
  return bodies;
}

// Fixed-step accumulator. Returns the interpolation factor for rendering.
export function createStepper(step, maxSubSteps, tick) {
  let acc = 0;
  return (dt) => {
    acc += dt;
    let n = 0;
    while (acc >= step && n < maxSubSteps) {
      tick(step);
      acc -= step;
      n++;
    }
    if (acc >= step) acc %= step; // fell too far behind: drop the backlog instead of spiralling
    return acc / step;
  };
}

// Teleport a body (no interpolation streak, no leftover motion).
export function place(b, p, q) {
  for (const v of [b.position, b.previousPosition, b.interpolatedPosition]) v.set(p.x, p.y, p.z);
  if (q) for (const v of [b.quaternion, b.previousQuaternion, b.interpolatedQuaternion]) v.copy(q);
  b.velocity.setZero();
  b.angularVelocity.setZero();
  b.force.setZero();
  b.torque.setZero();
  b.aabbNeedsUpdate = true;
  b.wakeUp();
}

// Set a kinematic body's velocities so that one step of length dt lands it on the target pose.
const _inv = new CANNON.Quaternion();
const _dq = new CANNON.Quaternion();
export function driveKinematic(body, x, y, z, q, dt) {
  const p = body.position;
  body.velocity.set((x - p.x) / dt, (y - p.y) / dt, (z - p.z) / dt);
  if (!q) return;
  body.quaternion.conjugate(_inv);
  q.mult(_inv, _dq);
  if (_dq.w < 0) _dq.set(-_dq.x, -_dq.y, -_dq.z, -_dq.w);
  const s = Math.hypot(_dq.x, _dq.y, _dq.z);
  const k = s < 1e-6 ? 2 / dt : (2 * Math.atan2(s, _dq.w)) / (s * dt);
  body.angularVelocity.set(_dq.x * k, _dq.y * k, _dq.z * k);
}

// Copy an interpolated body pose onto a three.js object.
const _q = new CANNON.Quaternion();
export function syncMesh(obj, body, alpha) {
  const a = body.previousPosition, b = body.position;
  obj.position.set(a.x + (b.x - a.x) * alpha, a.y + (b.y - a.y) * alpha, a.z + (b.z - a.z) * alpha);
  body.previousQuaternion.slerp(body.quaternion, alpha, _q);
  obj.quaternion.set(_q.x, _q.y, _q.z, _q.w);
}

export function inChuteXZ(x, z, margin = 0) {
  const c = MACHINE.chute;
  return x >= c.x0 - margin && x <= c.x1 + margin && z >= c.z0 - margin && z <= c.z1 + margin;
}

// Height of the play floor surface at (x, z), including the raised strips along the walls.
export function floorTopAt(x, z) {
  const { floorY, half, chute, edge } = MACHINE;
  const rise = (d) => clamp((d - (half - edge.w)) / edge.w, 0, 1) * edge.h;
  let r = Math.max(rise(x), rise(-z)); // right and back walls run the full length
  if (z <= chute.z0) r = Math.max(r, rise(-x)); // left wall, beside the floor only
  if (x >= chute.x1) r = Math.max(r, rise(z)); // front wall, beside the floor only
  return floorY + r;
}

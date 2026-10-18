// Claw shape: finger geometry, hub size and pose helpers shared by the claw controller and the auto test.
import { CANNON, V, inChuteXZ, floorTopAt } from "./physics.js";
import { CONFIG, MACHINE } from "./config.js";
import { clamp } from "./util.js";

const C = CONFIG.claw;

// Finger shape in the arm frame: x points away from the claw axis, y up, origin at the hinge.
export const ARM_LEN = 1.6;
export const TIP_LEN = 0.5;
export const TIP_BEND = (50 * Math.PI) / 180; // the tip segment bends towards the axis
export const TIP_X = -TIP_LEN * Math.sin(TIP_BEND);
export const TIP_Y = -ARM_LEN - TIP_LEN * Math.cos(TIP_BEND);
export const FINGER_PTS = [[0, -ARM_LEN], [TIP_X, TIP_Y]]; // knuckle and tip
export const ARM_T = 0.1; // contact radius used for finger touch tests
export const HUB_R = 0.45;
export const HUB_H = 0.6;
export const HUB_COL_R = 0.42;
export const TROLLEY_Y = 16.6;
export const PHIS = [90, 210, 330].map((d) => (d * Math.PI) / 180);

const _p = { x: 0, y: 0, z: 0 };
const _h = { x: 0, y: 0, z: 0 };
const _k = { x: 0, y: 0, z: 0 };
const _t = { x: 0, y: 0, z: 0 };

// World position of finger point (lx, ly) on arm phi opened by angle a; hub bottom centre at (hx, hy, hz), claw upright.
export function armPoint(hx, hy, hz, phi, a, lx, ly, out) {
  const ca = Math.cos(a), sa = Math.sin(a);
  const r = C.hingeRadius + lx * ca - ly * sa;
  out.x = hx + Math.cos(phi) * r;
  out.y = hy + lx * sa + ly * ca;
  out.z = hz + Math.sin(phi) * r;
  return out;
}

function segDist2(a, b, p) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / (dx * dx + dy * dy + dz * dz), 0, 1);
  const qx = a.x + dx * t - p.x, qy = a.y + dy * t - p.y, qz = a.z + dz * t - p.z;
  return qx * qx + qy * qy + qz * qz;
}

// Distance from a finger centreline to a sphere surface, minus the finger contact radius.
export function armGap(hx, hy, hz, phi, a, c, r) {
  armPoint(hx, hy, hz, phi, a, 0, 0, _h);
  armPoint(hx, hy, hz, phi, a, 0, -ARM_LEN, _k);
  armPoint(hx, hy, hz, phi, a, TIP_X, TIP_Y, _t);
  return Math.sqrt(Math.min(segDist2(_h, _k, c), segDist2(_k, _t, c))) - r - ARM_T;
}

// Lowest hub height at (hx, hz) that keeps every finger point above the floor, or above the hole
// guards, for any opening angle the claw can take while closing. q: optional claw lean.
export function minHubY(hx, hz, q = null) {
  const { floorY, barrierH } = MACHINE;
  let need = -Infinity;
  for (const phi of PHIS) {
    for (let i = 0; i <= 8; i++) {
      const a = C.closedAngle + ((C.openAngle - C.closedAngle) * i) / 8;
      for (const [lx, ly] of FINGER_PTS) {
        armPoint(0, 0, 0, phi, a, lx, ly, _p);
        if (q) q.vmult(_p, _p);
        const x = hx + _p.x, z = hz + _p.z;
        const base = inChuteXZ(x, z, 0.12) ? floorY + barrierH + 0.08 : floorTopAt(x, z) + C.tipClear;
        need = Math.max(need, base - _p.y + 0.05);
      }
    }
  }
  return need;
}

const _qy = new CANNON.Quaternion();
const _qz = new CANNON.Quaternion();
const AX_Y = V(0, 1, 0);
const AX_Z = V(0, 0, 1);
export function armQuat(phi, a, out) {
  _qy.setFromAxisAngle(AX_Y, -phi);
  _qz.setFromAxisAngle(AX_Z, a);
  return _qy.mult(_qz, out);
}

function grow(ext, p, m) {
  ext.px = Math.max(ext.px, p.x + m);
  ext.nx = Math.max(ext.nx, -p.x + m);
  ext.pz = Math.max(ext.pz, p.z + m);
  ext.nz = Math.max(ext.nz, -p.z + m);
}

// Horizontal extent of the claw around the hub bottom centre for lean q and the arms' current angles,
// contact margins included: ext.px is how far it reaches towards +x, ext.nx towards -x, and so on.
export function reach(q, arms, ext) {
  ext.px = ext.nx = ext.pz = ext.nz = HUB_R;
  _p.x = 0;
  _p.y = HUB_H;
  _p.z = 0;
  grow(ext, q.vmult(_p, _p), HUB_R);
  for (const arm of arms) {
    for (const [lx, ly] of FINGER_PTS) grow(ext, q.vmult(armPoint(0, 0, 0, arm.phi, arm.angle, lx, ly, _p), _p), ARM_T);
  }
  return ext;
}

const _axis = new CANNON.Vec3();
// Lean of the claw hanging from the trolley when its centre of mass sits off (x, z) from the point under it, L away.
export function tiltFrom(off, L, out) {
  const m = Math.hypot(off.x, off.z);
  if (m < 1e-6) {
    out.set(0, 0, 0, 1);
    return out;
  }
  _axis.set(-off.z / m, 0, off.x / m);
  return out.setFromAxisAngle(_axis, Math.asin(Math.min(m / L, 0.99)));
}

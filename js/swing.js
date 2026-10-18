// Pendulum model of the claw hanging from the trolley: small angles, the cable length changes slowly.
import { CONFIG } from "./config.js";

const S = CONFIG.claw.swing; // fields are read at use time so ?set= overrides apply

export function createSwing() {
  const off = { x: 0, z: 0 }; // claw centre of mass relative to the point under the trolley
  const vel = { x: 0, z: 0 };

  // ax, az: trolley acceleration. L: cable length to the centre of mass. damping: per second.
  function step(dt, ax, az, L, damping) {
    const w2 = S.gravity / L;
    vel.x += (-w2 * off.x - S.accelK * ax - damping * vel.x) * dt;
    vel.z += (-w2 * off.z - S.accelK * az - damping * vel.z) * dt;
    off.x += vel.x * dt;
    off.z += vel.z * dt;
    const max = L * Math.sin(S.maxAngle);
    const m = Math.hypot(off.x, off.z);
    if (m > max) {
      const nx = off.x / m, nz = off.z / m;
      off.x = nx * max;
      off.z = nz * max;
      const out = vel.x * nx + vel.z * nz;
      if (out > 0) {
        vel.x -= out * nx;
        vel.z -= out * nz;
      }
    }
  }

  // Peak displacement of the current swing.
  const amplitude = (L) => Math.hypot(off.x, off.z, Math.hypot(vel.x, vel.z) * Math.sqrt(L / S.gravity));

  return { off, vel, step, amplitude };
}

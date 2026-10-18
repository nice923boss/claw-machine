// Tag ring hooking: a finger point passing through a plush's tag ring hangs the plush on that finger.
import { CANNON, GROUP, MASK } from "./physics.js";
import { CONFIG } from "./config.js";

const H = CONFIG.hook; // fields are read at use time so ?set= overrides apply
const _c = new CANNON.Vec3();
const _n = new CANNON.Vec3();
const _d = new CANNON.Vec3();
const _a = new CANNON.Vec3();
const _b = new CANNON.Vec3();
const _q = new CANNON.Quaternion();
const UP = new CANNON.Vec3(0, 1, 0);

// World centre and normal of a plush's tag ring.
export function ringWorld(p, centre, normal) {
  const b = p.body;
  b.quaternion.vmult(p.tag.local, centre);
  centre.vadd(b.position, centre);
  if (normal) b.quaternion.vmult(p.tag.normal, normal);
  return centre;
}

export function createHook({ world, plushes, rng }) {
  let cur = null; // { p, c }

  // First free tagged plush whose ring disc the point moving a -> b passes through; out gets the crossing point.
  function crossing(a, b, out) {
    for (const p of plushes.list) {
      if (p.state !== "free" || !p.tag) continue;
      ringWorld(p, _c, _n);
      const da = (a.x - _c.x) * _n.x + (a.y - _c.y) * _n.y + (a.z - _c.z) * _n.z;
      const db = (b.x - _c.x) * _n.x + (b.y - _c.y) * _n.y + (b.z - _c.z) * _n.z;
      if (da > 0 === db > 0) continue;
      const t = da / (da - db);
      out.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
      if (out.distanceTo(_c) < p.tag.r + H.catchR) return p;
    }
    return null;
  }

  // Hang p on armBody: the ring point nearest the crossing x is pinned to x on the finger.
  function attach(p, armBody, x) {
    const b = p.body;
    ringWorld(p, _c, _n);
    x.vsub(_c, _d);
    _d.addScaledVector(-_d.dot(_n), _n, _d); // into the ring plane
    const len = _d.length();
    if (len < 1e-4) b.quaternion.vmult(UP, _d);
    else _d.scale(1 / len, _d);
    _c.addScaledVector(p.tag.r, _d, _a); // nearest point on the ring
    _a.vsub(b.position, _a);
    b.quaternion.conjugate(_q).vmult(_a, _a); // plush local
    x.vsub(armBody.position, _b);
    armBody.quaternion.conjugate(_q).vmult(_b, _b); // finger local
    const c = new CANNON.PointToPointConstraint(b, _a, armBody, _b, H.forceK * b.mass * Math.abs(CONFIG.physics.gravity));
    world.addConstraint(c);
    b.wakeUp();
    b.allowSleep = false;
    b.collisionFilterGroup = GROUP.HELD;
    b.collisionFilterMask = MASK.LOOSE;
    p.state = "held";
    cur = { p, c };
  }

  function detach() {
    const { p, c } = cur;
    cur = null;
    world.removeConstraint(c);
    p.body.allowSleep = true;
    p.body.wakeUp();
    p.state = "free";
    return p;
  }

  // Distance between the two pinned points: grows when the plush snags on something.
  function stretch() {
    const { c } = cur;
    c.bodyA.quaternion.vmult(c.pivotA, _a).vadd(c.bodyA.position, _a);
    c.bodyB.quaternion.vmult(c.pivotB, _b).vadd(c.bodyB.position, _b);
    return _a.distanceTo(_b);
  }

  function slips(dt, swingSpeed) {
    if (stretch() > H.maxStretch) return true;
    return rng() < 1 - Math.exp(-(H.slipBase + H.slipSwingK * swingSpeed) * dt);
  }

  return {
    crossing,
    attach,
    detach,
    stretch,
    slips,
    get plush() {
      return cur ? cur.p : null;
    },
  };
}

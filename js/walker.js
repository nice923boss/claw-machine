// First-person camera that walks around the playable machine at eye height.
// Quick views walk the player there; dragging walks too; wheel or pinch steps closer or back.
import * as THREE from "three";
import { MACHINE } from "./config.js";
import { clamp, lerp, smooth } from "./util.js";

const B = MACHINE.baseHalf; // footprint half size the player walks around
const EYE = 16;
const GAP = [2, 9]; // distance range from the cabinet
const TY = [7.5, 14]; // look-at height range
const WALK = 9; // walking speed, units per second
const STRIDE = 7; // distance per footstep

export const VIEWS = {
  front: { theta: 0, gap: 9, eye: EYE, ty: 11, tOff: 0, label: "正面" },
  left: { theta: -Math.PI / 2, gap: 8, eye: EYE, ty: 11, tOff: 0, label: "左側" },
  right: { theta: Math.PI / 2, gap: 8, eye: EYE, ty: 11, tOff: 0, label: "右側" },
  top: { theta: 0, gap: 2, eye: 19.2, ty: 8.5, tOff: 1.5, label: "俯視" },
};
const KEYS = ["theta", "gap", "eye", "ty", "tOff"];

// Signed distance from the cabinet footprint (a square of half size B) in the floor plane.
function sdf(x, z) {
  const qx = Math.abs(x) - B, qz = Math.abs(z) - B;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
}

// Distance from the centre along direction theta at which the cabinet is `gap` away.
function radiusAt(theta, gap) {
  const sx = Math.sin(theta), cz = Math.cos(theta);
  let lo = 0, hi = B * 1.5 + gap + 2;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (sdf(sx * mid, cz * mid) < gap) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createWalker({ camera, dom, onFootstep, onTap }) {
  const cur = { ...VIEWS.front };
  const goal = { ...VIEWS.front };
  let tween = null; // timed walk to a quick view
  let tiptoe = false;
  let tiptoeTurn = 0;
  let walked = 0;
  let reach = 0; // extra distance on narrow screens, see setReach
  let bobAmt = 0;
  let nextStep = STRIDE;
  const last = new THREE.Vector3();
  const base = new THREE.Vector3();
  const target = new THREE.Vector3();
  const right = new THREE.Vector3();

  function setView(name) {
    const v = VIEWS[name];
    const to = { ...v, theta: cur.theta + wrap(v.theta - cur.theta) };
    const from = { ...cur };
    const r = (radiusAt(from.theta, from.gap) + radiusAt(to.theta, to.gap)) / 2;
    const dist = Math.hypot((to.theta - from.theta) * r, to.gap - from.gap);
    tween = { from, to, t: 0, dur: clamp(dist / WALK, 0.5, 2.5) };
    Object.assign(goal, to);
    tiptoe = name === "top";
    tiptoeTurn = 0;
  }

  function leaveTiptoe() {
    if (!tiptoe) return;
    tiptoe = false;
    Object.assign(goal, { eye: EYE, tOff: 0, ty: Math.max(goal.ty, 10) });
  }

  // ---- pointer input: drag walks around, two fingers pinch, a short tap may hit the coin slot
  const pointers = new Map();
  let pinch = 0;
  let tap = null;

  function nudge(dTheta, dTy, gapScale) {
    if (tween) {
      Object.assign(goal, cur);
      tween = null;
    }
    goal.theta += dTheta;
    goal.ty = clamp(goal.ty + dTy, TY[0], TY[1]);
    goal.gap = clamp(goal.gap * gapScale, GAP[0], GAP[1]);
    if (tiptoe) {
      tiptoeTurn += Math.abs(dTheta);
      if (goal.gap > 3 || tiptoeTurn > 0.15) leaveTiptoe();
    }
  }

  dom.addEventListener("pointerdown", (e) => {
    dom.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    tap = pointers.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
    if (pointers.size === 2) pinch = spread();
  });
  dom.addEventListener("pointermove", (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 6) tap = null;
    if (pointers.size === 1) {
      nudge(-dx * 0.006, -dy * 0.02, 1);
    } else if (pointers.size === 2) {
      const s = spread();
      if (pinch > 0 && s > 0) nudge(0, 0, pinch / s);
      pinch = s;
    }
  });
  const end = (e) => {
    if (!pointers.delete(e.pointerId)) return;
    if (tap && performance.now() - tap.t < 400) onTap?.(e.clientX, e.clientY);
    tap = null;
    pinch = pointers.size === 2 ? spread() : 0;
  };
  dom.addEventListener("pointerup", end);
  dom.addEventListener("pointercancel", end);
  dom.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      nudge(0, 0, Math.exp(clamp(e.deltaY, -200, 200) * 0.0015));
    },
    { passive: false },
  );
  function spread() {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  // ---- per frame
  function update(dt) {
    if (tween) {
      tween.t = Math.min(tween.dur, tween.t + dt);
      const k = smooth(tween.t / tween.dur);
      for (const key of KEYS) cur[key] = lerp(tween.from[key], tween.to[key], k);
      if (tween.t >= tween.dur) tween = null;
    } else {
      const f = 1 - Math.exp(-dt * 7);
      for (const key of KEYS) cur[key] += (goal[key] - cur[key]) * f;
    }
    if (Math.abs(cur.theta) > Math.PI * 4) {
      const turns = Math.round(cur.theta / (Math.PI * 2)) * Math.PI * 2;
      cur.theta -= turns;
      goal.theta -= turns;
      if (tween) {
        tween.from.theta -= turns;
        tween.to.theta -= turns;
      }
    }

    // The extra reach fades out while rising on tiptoe, which stays pressed against the glass.
    const standing = 1 - clamp((cur.eye - EYE) / (VIEWS.top.eye - EYE), 0, 1);
    const r = radiusAt(cur.theta, cur.gap + reach * standing);
    const sx = Math.sin(cur.theta), cz = Math.cos(cur.theta);
    base.set(sx * r, cur.eye, cz * r);
    // Walking sway comes from the distance actually covered on the floor.
    const moved = Math.hypot(base.x - last.x, base.z - last.z);
    last.copy(base);
    const speed = dt > 0 ? moved / dt : 0;
    bobAmt += (clamp(speed / 4, 0, 1) - bobAmt) * (1 - Math.exp(-dt * 8));
    if (moved < 3) {
      walked += moved;
      if (walked >= nextStep) {
        nextStep = walked + STRIDE;
        onFootstep?.();
      }
    }
    const phase = (walked / STRIDE) * Math.PI;
    right.set(cz, 0, -sx);
    camera.position.copy(base).addScaledVector(right, Math.sin(phase) * 0.12 * bobAmt);
    camera.position.y += Math.abs(Math.sin(phase)) * 0.22 * bobAmt;
    target.set(sx * cur.tOff, cur.ty, cz * cur.tOff);
    camera.lookAt(target);
  }

  // Narrow screens stand further back so the whole cabinet front, coin slot included, fits across.
  // tanHalfFov: tangent of the camera's horizontal half field of view.
  function setReach(tanHalfFov) {
    // The slot's outer edge (x 5.4, z 6) should sit within 90% of the half width.
    const need = 6 + 5.4 / (0.9 * tanHalfFov);
    reach = Math.max(0, need - (B + VIEWS.front.gap));
  }

  // The view the player is closest to, for the HUD.
  function viewLabel() {
    if (tiptoe) return VIEWS.top.label;
    const a = wrap(cur.theta);
    if (Math.abs(a) < Math.PI / 4) return "正面";
    if (Math.abs(a) > (Math.PI * 3) / 4) return "背面";
    return a > 0 ? "右側" : "左側";
  }

  // When not facing the front, how the joystick directions (fixed to the cabinet front) look on screen.
  const ARROWS = ["↑", "→", "↓", "←"];
  function hint() {
    const a = wrap(cur.theta);
    if (Math.abs(a) < 0.5) return "";
    // Joystick up pushes the claw towards -z. Screen right = (cos a, 0, -sin a), screen forward = (-sin a, 0, -cos a).
    const screen = (x, z) => {
      const sr = x * Math.cos(a) - z * Math.sin(a);
      const sf = -x * Math.sin(a) - z * Math.cos(a);
      return Math.abs(sr) > Math.abs(sf) ? (sr > 0 ? "→" : "←") : sf > 0 ? "↑" : "↓";
    };
    return `${viewLabel()}視角：搖桿 ${ARROWS[0]} 在畫面往 ${screen(0, -1)}，搖桿 ${ARROWS[1]} 在畫面往 ${screen(1, 0)}（畫面 ↑ 是往裡面）`;
  }

  return { update, setView, setReach, viewLabel, hint, get theta() { return cur.theta; } };
}

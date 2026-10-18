// Three-finger claw: kinematic bodies driven by a state machine, plus the grab and slip model.
// The physics only pushes plush around; whether a plush is held is decided by the grab model,
// which pins the plush to the claw as a kinematic body until it slips or is released.
// The claw hangs from the trolley and swings (swing.js); a finger can also catch a tag ring (hook.js).
import * as THREE from "three";
import { CANNON, GROUP, MASK, V, place, driveKinematic, syncMesh } from "./physics.js";
import { CONFIG, MACHINE } from "./config.js";
import { clamp, approach, randRange } from "./util.js";
import { createSwing } from "./swing.js";
import { createHook } from "./hook.js";
import {
  ARM_LEN, TIP_LEN, TIP_BEND, TIP_X, TIP_Y, FINGER_PTS, ARM_T, HUB_R, HUB_H, HUB_COL_R, TROLLEY_Y, PHIS,
  armPoint, armGap, minHubY, armQuat, reach, tiltFrom,
} from "./claw-shape.js";

const C = CONFIG.claw;
const G = CONFIG.grab;
const S = CONFIG.claw.swing; // fields are read at use time so ?set= overrides apply
const RAY_OFFS = [[0, 0], [0.32, 0], [-0.32, 0], [0, 0.32], [0, -0.32]];
const RAY_LIFT = 0.3;
const WAKE_R = 2.5;
const RELAX = 0.12; // fingers loosen this much when a plush slips out
const RELAX_RATE = RELAX / 0.15;
const LOOSE_MIN = 0.5; // a dropped plush ignores the claw at least this long
const LOW_Y = 12.2; // below this hub height the fingers can reach the hole guards and the raised edges
const BRACED = new Set(["descend", "close", "grip", "ascend", "steady"]); // the swing damps faster in these states
const HOOKING = new Set(["close", "grip", "ascend"]); // states in which a finger can catch a tag ring

const _p = { x: 0, y: 0, z: 0 };
const _c = new CANNON.Vec3();
const _w = new CANNON.Vec3();
const _x = new CANNON.Vec3();
const _l = new CANNON.Vec3();
const _hq = new CANNON.Quaternion();
const _ext = { px: 0, nx: 0, pz: 0, nz: 0 };
const _pts = FINGER_PTS.map(() => new CANNON.Vec3());
const _top = new THREE.Vector3();
const _dir = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export function createClaw({ world, scene, mats, plushes, rng }) {
  const listeners = {};
  const on = (ev, fn) => (listeners[ev] ||= []).push(fn);
  const emit = (ev, data) => {
    for (const fn of listeners[ev] || []) fn(data);
  };

  const kinematic = () =>
    new CANNON.Body({
      type: CANNON.Body.KINEMATIC,
      mass: 0,
      material: mats.claw,
      collisionFilterGroup: GROUP.CLAW,
      collisionFilterMask: MASK.CLAW,
      allowSleep: false,
      sleepSpeedLimit: 0.05,
    });

  // ---- visuals
  const metal = new THREE.MeshStandardMaterial({ color: 0xd9dde3, metalness: 0.6, roughness: 0.32 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a3f47, metalness: 0.4, roughness: 0.5 });
  const shadowed = (m) => ((m.castShadow = true), m);

  const hubGroup = new THREE.Group();
  const hubMesh = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(HUB_R * 0.85, HUB_R, HUB_H, 24), metal));
  hubMesh.position.y = HUB_H / 2;
  const cap = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.2, 16), dark));
  cap.position.y = HUB_H + 0.1;
  hubGroup.add(hubMesh, cap);
  const cable = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 6), dark));
  const trolleyMesh = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 1.1), dark));
  scene.add(hubGroup, cable, trolleyMesh);

  const upperGeo = new THREE.BoxGeometry(0.16, ARM_LEN, 0.24).translate(0, -ARM_LEN / 2, 0);
  const tipGeo = new THREE.BoxGeometry(0.12, TIP_LEN, 0.22)
    .rotateZ(-TIP_BEND)
    .translate(TIP_X / 2, (-ARM_LEN + TIP_Y) / 2, 0);
  const knuckleGeo = new THREE.SphereGeometry(0.1, 10, 8).translate(0, -ARM_LEN, 0);

  // ---- bodies
  const hub = { x: C.home.x, y: C.topY, z: C.home.z }; // hub bottom centre
  const tilt = new CANNON.Quaternion(); // claw lean about the hub bottom centre
  const tiltInv = new CANNON.Quaternion();
  const nextTilt = new CANNON.Quaternion();
  const hubBody = kinematic();
  hubBody.addShape(new CANNON.Sphere(HUB_COL_R), V(0, HUB_COL_R, 0));
  place(hubBody, hub);
  world.addBody(hubBody);

  const tipQ = new CANNON.Quaternion().setFromAxisAngle(V(0, 0, 1), -TIP_BEND);
  const arms = PHIS.map((phi) => {
    const body = kinematic();
    body.addShape(new CANNON.Box(V(0.08, ARM_LEN / 2, 0.12)), V(0, -ARM_LEN / 2, 0));
    body.addShape(new CANNON.Box(V(0.06, TIP_LEN / 2, 0.11)), V(TIP_X / 2, (-ARM_LEN + TIP_Y) / 2, 0), tipQ);
    const arm = {
      phi, angle: C.openAngle, stopped: false, touch: null, relaxTo: null, body, q: new CANNON.Quaternion(),
      prev: FINGER_PTS.map(() => new CANNON.Vec3()), // knuckle and tip after the last step, for ring crossing
    };
    place(body, hingePos(arm, hub.x, hub.y, hub.z, tilt, _w), armQuat(phi, arm.angle, arm.q));
    world.addBody(body);
    fingerWorld(arm, arm.prev);
    arm.group = new THREE.Group();
    arm.group.add(
      shadowed(new THREE.Mesh(upperGeo, metal)),
      shadowed(new THREE.Mesh(tipGeo, metal)),
      shadowed(new THREE.Mesh(knuckleGeo, dark)),
    );
    scene.add(arm.group);
    return arm;
  });
  const clawBodies = new Set([hubBody, ...arms.map((a) => a.body)]);

  function hingePos(arm, x, y, z, q, out) {
    out.set(Math.cos(arm.phi) * C.hingeRadius, 0, Math.sin(arm.phi) * C.hingeRadius);
    q.vmult(out, out);
    out.set(out.x + x, out.y + y, out.z + z);
    return out;
  }

  // World positions of a finger's knuckle and tip, from its body pose.
  function fingerWorld(arm, out) {
    const b = arm.body;
    for (let i = 0; i < FINGER_PTS.length; i++) {
      _l.set(FINGER_PTS[i][0], FINGER_PTS[i][1], 0);
      b.quaternion.vmult(_l, out[i]);
      out[i].vadd(b.position, out[i]);
    }
    return out;
  }

  // ---- state
  const trolley = { x: C.home.x, z: C.home.z }; // gantry position: the cable hangs from here
  const prevTrolley = { ...trolley };
  const vel = { x: 0, z: 0 }; // trolley velocity
  const lastVel = { x: 0, z: 0 };
  const input = { x: 0, z: 0 };
  const swing = createSwing();
  const hook = createHook({ world, plushes, rng });
  const next = { x: 0, y: 0, z: 0 }; // hub pose built during preStep
  let state = "idle";
  let stateT = 0;
  let time = 0;
  let power = 1;
  let held = null;
  let target = null; // plush under the claw when it starts closing
  let result = null;
  let resting = false; // claw sits on plush or the floor: cable slack, no swing
  let touchingPlush = false;
  const loose = [];

  function setState(s) {
    state = s;
    stateT = 0;
    emit("stateChange", s);
  }

  function setInput(ix, iz) {
    input.x = clamp(ix, -1, 1);
    input.z = clamp(iz, -1, 1);
  }

  const swingLen = (y = hub.y) => TROLLEY_Y - y + S.comDrop; // cable length to the claw's centre of mass

  function startRound(p) {
    if (state !== "idle") return false;
    power = p;
    resting = false;
    result = {
      reason: "empty", plush: null, power, n: 0, offN: 0, sizeN: 0, depth: 0, pGrip: 0, gap: null, squeeze: null, at: null,
      hook: null, midAir: false, swingAtDrop: null,
    };
    for (const arm of arms) Object.assign(arm, { stopped: false, touch: null, relaxTo: null });
    setState("move");
    return true;
  }

  // In "move": stop the trolley and lower the claw. While lowering: close right where it is (mid-air close).
  function drop() {
    if (state === "move") {
      vel.x = vel.z = 0;
      result.swingAtDrop = swing.amplitude(swingLen());
      setState("descend");
      return true;
    }
    if (state === "descend") {
      target = pickTarget();
      result.midAir = true;
      setState("close");
      return true;
    }
    return false;
  }

  // World point c seen in the claw's upright frame (rotated back about the hub bottom centre).
  function toClaw(c, out = c) {
    out.set(c.x - hub.x, c.y - hub.y, c.z - hub.z);
    tiltInv.vmult(out, out);
    out.set(out.x + hub.x, out.y + hub.y, out.z + hub.z);
    return out;
  }
  const sphereClaw = (p, s, out) => toClaw(plushes.sphereWorld(p, s, out));

  // Free distance between the hub bottom and whatever lies below it.
  const _from = new CANNON.Vec3();
  const _to = new CANNON.Vec3();
  const _ray = new CANNON.RaycastResult();
  const rayOpts = { collisionFilterMask: GROUP.PLUSH | GROUP.STATIC, skipBackfaces: true };
  function probeGap() {
    let gap = Infinity;
    for (const [ox, oz] of RAY_OFFS) {
      _from.set(hub.x + ox, hub.y + RAY_LIFT, hub.z + oz);
      _to.set(hub.x + ox, hub.y - 4, hub.z + oz);
      world.raycastClosest(_from, _to, rayOpts, _ray);
      if (_ray.hasHit) gap = Math.min(gap, _ray.distance - RAY_LIFT);
    }
    return gap;
  }

  // The plush whose core sphere is nearest the claw axis, if it is within reach.
  function pickTarget() {
    let best = null, bestD = G.reach;
    for (const p of plushes.list) {
      if (p.state !== "free") continue;
      sphereClaw(p, p.core, _c);
      const d = Math.hypot(_c.x - hub.x, _c.z - hub.z);
      if (_c.y < hub.y && d < bestD) [best, bestD] = [p, d];
    }
    return best;
  }

  // Plush whose collision sphere the finger would touch at angle a (deepest touch wins).
  // A finger stops on the target at first contact; other plush get pushed aside unless jammed.
  function touching(arm, a) {
    let best = null, bestGap = 0;
    for (const p of plushes.list) {
      if (p.state !== "free") continue;
      const b = p.body.position;
      if (Math.abs(b.x - hub.x) > 3 || Math.abs(b.z - hub.z) > 3 || b.y > hub.y + 1.5) continue;
      const lim = target && p !== target ? -C.squish : 0;
      for (const s of p.spheres) {
        const g = armGap(hub.x, hub.y, hub.z, arm.phi, a, sphereClaw(p, s, _c), s.r);
        if (g < lim && g < bestGap) {
          bestGap = g;
          best = p;
        }
      }
    }
    return best;
  }

  function judge() {
    const counts = new Map();
    for (const arm of arms) if (arm.touch && arm.touch.state === "free") counts.set(arm.touch, (counts.get(arm.touch) || 0) + 1);
    if (!counts.size) return;
    // The plush touched by the most fingers is judged; it may differ from the aimed target.
    let chosen = null, n = 0, off = Infinity;
    for (const [p, k] of counts) {
      sphereClaw(p, p.core, _c);
      const d = Math.hypot(_c.x - hub.x, _c.z - hub.z);
      if (k > n || (k === n && d < off)) [chosen, n, off] = [p, k, d];
    }
    // Only the grab model lifts plush: anything else the fingers touched stops colliding with the claw.
    for (const p of counts.keys()) {
      if (p === chosen) continue;
      loosen(p);
      relaxArms(p);
    }
    sphereClaw(chosen, chosen.core, _c);
    let tipY = 0;
    for (const arm of arms) {
      if (arm.touch === chosen) tipY += armPoint(hub.x, hub.y, hub.z, arm.phi, arm.angle, TIP_X, TIP_Y, _p).y;
    }
    const depth = (_c.y - tipY / n) / chosen.coreR; // > 0 when the tips reach below the plush centre
    const offN = off / G.reach;
    Object.assign(result, { plush: chosen, n, offN, sizeN: chosen.sizeN, depth, at: { ...hub } });

    const weakT = () => randRange(rng, 0.05, G.weakSlipMax);
    if (n >= 2 && depth > 0.05 && offN <= 1) {
      const under = clamp(0.4 + depth, 0.4, 1);
      result.pGrip = clamp(
        G.gripBase * power ** G.gripPowerExp * (1 - G.gripOffsetK * offN * offN) * (1 - G.gripSizeK * chosen.sizeN) * under,
        0,
        0.98,
      );
      grab(chosen, rng() < result.pGrip ? Infinity : weakT());
    } else if (rng() < 0.25 * power) {
      grab(chosen, weakT());
    } else {
      result.reason = depth <= 0.05 ? "tipsAbove" : "noGrip";
      loosen(chosen);
      relaxArms(chosen);
    }
  }

  function grab(p, weakT) {
    const b = p.body;
    b.wakeUp();
    b.allowSleep = false;
    b.type = CANNON.Body.KINEMATIC;
    b.collisionFilterGroup = GROUP.HELD;
    b.collisionFilterMask = MASK.HELD;
    b.velocity.setZero();
    b.angularVelocity.setZero();
    p.state = "held";
    const i = loose.findIndex((L) => L.p === p);
    if (i >= 0) loose.splice(i, 1);
    // Pose relative to the hub bottom centre in the claw frame, so the plush leans with the claw.
    _c.set(b.position.x - hub.x, b.position.y - hub.y, b.position.z - hub.z);
    held = {
      p,
      rel: tiltInv.vmult(_c, new CANNON.Vec3()),
      q: tiltInv.mult(b.quaternion, new CANNON.Quaternion()),
      weak: weakT !== Infinity,
      weakT,
      liftT: 0,
    };
    // Fingers squeezed into the plush ease back to its surface, so no finger shows inside a held plush.
    // squeeze: closest finger centreline to the plush surface at the grab (negative = overlap); gap: the same after easing.
    let gap = Infinity, squeeze = Infinity;
    for (const arm of arms) {
      let a = arm.angle;
      squeeze = Math.min(squeeze, surfaceGap(p, arm, a));
      while (a < C.openAngle && surfaceGap(p, arm, a) < 0) a = Math.min(C.openAngle, a + 0.01);
      if (a > arm.angle) arm.relaxTo = Math.max(arm.relaxTo ?? a, a);
      gap = Math.min(gap, surfaceGap(p, arm, a));
    }
    Object.assign(result, { gap, squeeze });
    result.reason = held.weak ? "weakSlip" : "held";
    emit("grab", { plush: p, weak: held.weak });
  }

  // Closest distance from the finger centreline at angle a to the plush surface.
  function surfaceGap(p, arm, a) {
    let g = Infinity;
    for (const s of p.spheres) g = Math.min(g, armGap(hub.x, hub.y, hub.z, arm.phi, a, sphereClaw(p, s, _c), s.r) + ARM_T);
    return g;
  }

  function loosen(p) {
    p.body.collisionFilterGroup = GROUP.HELD;
    p.body.collisionFilterMask = MASK.LOOSE;
    const L = loose.find((e) => e.p === p);
    if (L) L.until = time + LOOSE_MIN;
    else loose.push({ p, until: time + LOOSE_MIN });
  }

  function relaxArms(p) {
    for (const arm of arms) if (arm.touch === p) arm.relaxTo = Math.min(C.openAngle, arm.angle + RELAX);
  }

  // Drop the held plush. It keeps the velocity it had while riding the claw.
  function letGo(reason) {
    const { p } = held;
    const b = p.body;
    held = null;
    b.type = CANNON.Body.DYNAMIC;
    b.allowSleep = true;
    b.wakeUp();
    p.state = "free";
    loosen(p);
    result.reason = reason;
    if (reason === "released") {
      emit("release", { plush: p });
    } else {
      relaxArms(p);
      emit("slip", { plush: p, reason });
    }
  }

  function slipHazard(dt, reason) {
    if (!held) return;
    held.liftT += dt;
    if (held.weak) {
      if (held.liftT >= held.weakT) letGo("weakSlip");
      return;
    }
    let h = G.slipBase * (1 - power) * (1 + G.slipOffsetK * result.offN ** 2) * (1 + G.slipSizeK * result.sizeN);
    h *= 1 + S.slipK * Math.hypot(swing.vel.x, swing.vel.z); // a swinging claw shakes the plush loose
    if (rng() < 1 - Math.exp(-h * dt)) letGo(reason);
  }

  function overlapsClaw(p) {
    for (const s of p.spheres) {
      sphereClaw(p, s, _c);
      if (Math.hypot(_c.x - hub.x, _c.y - hub.y - HUB_COL_R, _c.z - hub.z) < s.r + HUB_COL_R + 0.05) return true;
      for (const arm of arms) if (armGap(hub.x, hub.y, hub.z, arm.phi, arm.angle, _c, s.r) < 0.05) return true;
    }
    return false;
  }

  function wakeNearby() {
    for (const p of plushes.list) {
      if (p.state !== "free") continue;
      const b = p.body.position;
      const dx = b.x - hub.x, dz = b.z - hub.z;
      if (dx * dx + dz * dz < WAKE_R * WAKE_R && b.y > hub.y - 4.5) p.body.wakeUp();
    }
  }

  function attachHook(p, arm, x) {
    hook.attach(p, arm.body, x);
    result.hook = { plush: p, name: p.name, outcome: "hooked" };
    emit("hook", { plush: p });
  }

  // The hooked plush comes off: "hookReleased" over the hole, "hookSlip" anywhere else.
  function dropHook(outcome) {
    const p = hook.detach();
    loosen(p);
    result.hook.outcome = outcome;
    if (outcome === "hookReleased") emit("release", { plush: p });
    else emit("slip", { plush: p, reason: outcome });
  }

  // Keeps the held plush inside the glass: it ignores the walls while riding the claw.
  function keepInside() {
    const lim = MACHINE.half - 0.02;
    let px = 0, nx = 0, pz = 0, nz = 0; // deepest overshoot past each wall
    for (const s of held.p.spheres) {
      held.q.vmult(s.off, _c);
      _c.vadd(held.rel, _c);
      nextTilt.vmult(_c, _c);
      const x = next.x + _c.x, z = next.z + _c.z;
      px = Math.max(px, x + s.r - lim);
      nx = Math.max(nx, -lim - (x - s.r));
      pz = Math.max(pz, z + s.r - lim);
      nz = Math.max(nz, -lim - (z - s.r));
    }
    const dx = px > 0 ? -px : nx, dz = pz > 0 ? -pz : nz;
    if (!dx && !dz) return;
    _c.set(dx, 0, dz);
    nextTilt.conjugate(_hq).vmult(_c, _c);
    held.rel.vadd(_c, held.rel);
  }

  function bounce(a, want, got, k) {
    if (Math.abs(want - got) < 1e-9) return false;
    const v = swing.vel[a];
    if (v * (want - got) > 0) {
      if (Math.abs(v) > 0.3) emit("bump", { speed: Math.abs(v) });
      swing.vel[a] = -v * S.wallBounce;
    }
    swing.off[a] = (got - trolley[a]) / k;
    return true;
  }

  // Keeps the leaning claw clear of the glass, the hole guards and the raised edges. A blocked axis
  // holds the hub where it was and bounces the swing back. Returns true if anything was blocked.
  function keepClear(k) {
    reach(nextTilt, arms, _ext);
    const h = MACHINE.half;
    const wantX = next.x, wantZ = next.z;
    const cx = (v) => clamp(v, -h + _ext.nx, h - _ext.px);
    const cz = (v) => clamp(v, -h + _ext.nz, h - _ext.pz);
    let x = cx(wantX), z = cz(wantZ);
    const low = (px, pz) => next.y < minHubY(px, pz, nextTilt) - 1e-3;
    if (next.y <= LOW_Y && low(x, z)) {
      const ox = cx(hub.x), oz = cz(hub.z);
      if (!low(ox, z)) x = ox;
      else if (!low(x, oz)) z = oz;
      else [x, z] = [ox, oz];
    }
    next.x = x;
    next.z = z;
    const bx = bounce("x", wantX, x, k);
    const bz = bounce("z", wantZ, z, k);
    return bx || bz;
  }

  // Advance the state machine and set kinematic velocities so this step lands on the new pose.
  function preStep(dt) {
    time += dt;
    stateT += dt;
    prevTrolley.x = trolley.x;
    prevTrolley.z = trolley.z;
    let ny = hub.y;
    const openRate = (C.openAngle - C.closedAngle) / C.openTime;

    switch (state) {
      case "idle":
      case "move":
      case "descend":
        for (const arm of arms) arm.angle = approach(arm.angle, C.openAngle, openRate * dt);
        break;
    }

    switch (state) {
      case "move": {
        vel.x = approach(vel.x, input.x * C.moveSpeed, C.moveAccel * dt);
        vel.z = approach(vel.z, input.z * C.moveSpeed, C.moveAccel * dt);
        const tx = trolley.x + vel.x * dt, tz = trolley.z + vel.z * dt;
        trolley.x = clamp(tx, -C.range, C.range);
        trolley.z = clamp(tz, -C.range, C.range);
        if (trolley.x !== tx) vel.x = 0; // the gantry hits its end stop
        if (trolley.z !== tz) vel.z = 0;
        break;
      }
      case "descend": {
        const room = Math.min(probeGap() - C.stopGap, hub.y - minHubY(hub.x, hub.z, tilt));
        if (room <= 1e-3) {
          // Landed: the cable goes slack, so the claw stops swinging and keeps its lean.
          resting = true;
          swing.vel.x = swing.vel.z = 0;
          target = pickTarget();
          setState("close");
        } else {
          ny = hub.y - Math.min(C.descendSpeed * dt, room);
        }
        break;
      }
      case "close": {
        const rate = (C.openAngle - C.closedAngle) / C.closeTime;
        let moving = 0;
        for (const arm of arms) {
          if (arm.stopped) continue;
          const na = Math.max(C.closedAngle, arm.angle - rate * dt);
          const hit = touching(arm, na);
          if (hit) {
            arm.stopped = true;
            arm.touch = hit;
          } else {
            arm.angle = na;
            if (na <= C.closedAngle) arm.stopped = true;
            else moving++;
          }
        }
        if (moving === 0 || stateT > C.closeTime + 0.3) {
          judge();
          setState("grip");
        }
        break;
      }
      case "grip":
        if (stateT >= C.holdPause) {
          resting = false;
          setState("ascend");
        }
        break;
      case "ascend":
        ny = Math.min(C.topY, hub.y + C.ascendSpeed * dt);
        slipHazard(dt, "slipAscend");
        if (ny >= C.topY) {
          setState("top");
          if (held && !held.weak && rng() < G.joltSlip * (1 - power) * (1 + result.offN)) letGo("slipTop");
        }
        break;
      case "top":
        slipHazard(dt, "slipTop");
        if (stateT >= C.topPause) setState("return");
        break;
      case "return": {
        // Accelerate, cruise and brake towards the hole; the claw swings on the way.
        const dx = C.home.x - trolley.x, dz = C.home.z - trolley.z;
        const d = Math.hypot(dx, dz);
        const sp = Math.min(C.returnSpeed, Math.sqrt(2 * C.returnAccel * d), Math.hypot(vel.x, vel.z) + C.returnAccel * dt);
        if (d < 0.01 || sp * dt >= d) {
          trolley.x = C.home.x;
          trolley.z = C.home.z;
          vel.x = vel.z = 0;
          setState("steady");
        } else {
          vel.x = (dx / d) * sp;
          vel.z = (dz / d) * sp;
          trolley.x += vel.x * dt;
          trolley.z += vel.z * dt;
        }
        slipHazard(dt, "slipReturn");
        break;
      }
      case "steady":
        // Over the hole: open once the swing has calmed down, or after a short wait.
        if (swing.amplitude(swingLen()) < S.releaseAmp || stateT >= S.releaseWait) setState("release");
        break;
      case "release":
        if (held) letGo("released");
        if (hook.plush) dropHook("hookReleased");
        for (const arm of arms) {
          arm.relaxTo = null;
          arm.angle = approach(arm.angle, C.openAngle, openRate * dt);
        }
        if (stateT >= C.openTime) setState("settle");
        break;
      case "settle":
        if (stateT >= C.settleTime) {
          setState("idle");
          emit("roundEnd", result);
        }
        break;
    }

    if (hook.plush && state !== "steady" && state !== "release" && hook.slips(dt, Math.hypot(swing.vel.x, swing.vel.z))) dropHook("hookSlip");
    for (const arm of arms) if (arm.relaxTo !== null) arm.angle = approach(arm.angle, arm.relaxTo, RELAX_RATE * dt);
    if (state !== "idle") wakeNearby();

    // Swing: trolley acceleration drives the pendulum; the hub hangs on the cable below the trolley.
    const L = swingLen(ny);
    const k = (TROLLEY_Y - ny) / L;
    const ax = (vel.x - lastVel.x) / dt, az = (vel.z - lastVel.z) / dt;
    lastVel.x = vel.x;
    lastVel.z = vel.z;
    if (!resting) {
      const damping = (BRACED.has(state) ? S.lowerDamping : S.damping) + (touchingPlush ? S.contactDamp : 0);
      swing.step(dt, ax, az, L, damping);
    }
    next.x = trolley.x + swing.off.x * k;
    next.y = ny;
    next.z = trolley.z + swing.off.z * k;
    tiltFrom(swing.off, L, nextTilt);
    if (keepClear(k)) tiltFrom(swing.off, L, nextTilt);
    if (held) keepInside();

    driveKinematic(hubBody, next.x, next.y, next.z, nextTilt, dt);
    for (const arm of arms) {
      hingePos(arm, next.x, next.y, next.z, nextTilt, _w);
      driveKinematic(arm.body, _w.x, _w.y, _w.z, nextTilt.mult(armQuat(arm.phi, arm.angle, arm.q), _hq), dt);
    }
    if (held) {
      nextTilt.vmult(held.rel, _w);
      driveKinematic(held.p.body, next.x + _w.x, next.y + _w.y, next.z + _w.z, nextTilt.mult(held.q, _hq), dt);
    }
    hub.x = next.x;
    hub.y = next.y;
    hub.z = next.z;
    tilt.copy(nextTilt);
    tilt.conjugate(tiltInv);
  }

  // After the physics step: hand dropped plush back to normal collisions once clear of the claw,
  // note whether the claw rubs against plush, and let fingers catch tag rings.
  function postStep() {
    for (let i = loose.length - 1; i >= 0; i--) {
      const L = loose[i];
      if (L.p.state === "gone") {
        loose.splice(i, 1);
      } else if (time > L.until && L.p.state !== "held" && !overlapsClaw(L.p)) {
        L.p.body.collisionFilterGroup = GROUP.PLUSH;
        L.p.body.collisionFilterMask = MASK.PLUSH;
        loose.splice(i, 1);
      }
    }
    touchingPlush = world.contacts.some((c) => clawBodies.has(c.bi) || clawBodies.has(c.bj));
    const catching = HOOKING.has(state);
    for (const arm of arms) {
      fingerWorld(arm, _pts);
      for (let i = 0; i < _pts.length; i++) {
        if (catching && !hook.plush) {
          const p = hook.crossing(arm.prev[i], _pts[i], _x);
          if (p) attachHook(p, arm, _x);
        }
        arm.prev[i].copy(_pts[i]);
      }
    }
  }

  function syncVisual(alpha) {
    syncMesh(hubGroup, hubBody, alpha);
    for (const arm of arms) syncMesh(arm.group, arm.body, alpha);
    const tx = prevTrolley.x + (trolley.x - prevTrolley.x) * alpha;
    const tz = prevTrolley.z + (trolley.z - prevTrolley.z) * alpha;
    trolleyMesh.position.set(tx, TROLLEY_Y + 0.15, tz);
    // The cable runs from the trolley to the top of the (leaning) hub.
    _top.set(0, HUB_H + 0.2, 0).applyQuaternion(hubGroup.quaternion).add(hubGroup.position);
    _dir.set(tx - _top.x, TROLLEY_Y - _top.y, tz - _top.z);
    const len = Math.max(0.01, _dir.length());
    cable.scale.y = len;
    cable.position.set((tx + _top.x) / 2, (TROLLEY_Y + _top.y) / 2, (tz + _top.z) / 2);
    cable.quaternion.setFromUnitVectors(UP, _dir.divideScalar(len));
  }

  const motorOn = () =>
    (state === "move" && Math.abs(vel.x) + Math.abs(vel.z) > 0.05) ||
    state === "descend" ||
    state === "ascend" ||
    state === "return";

  return {
    get state() {
      return state;
    },
    get power() {
      return power;
    },
    get held() {
      return held ? held.p : null;
    },
    get hooked() {
      return hook.plush;
    },
    get result() {
      return result;
    },
    pos: hub,
    trolley,
    vel,
    swing,
    swingAmp: () => swing.amplitude(swingLen()),
    on,
    setInput,
    startRound,
    drop,
    preStep,
    postStep,
    syncVisual,
    motorOn,
    isLoose: (p) => loose.some((L) => L.p === p),
  };
}

// Plush manager: spawning, physics bodies, render sync, prize and escape checks.
import * as THREE from "three";
import { CANNON, GROUP, MASK, V, place, syncMesh, inChuteXZ } from "./physics.js";
import { CONFIG, MACHINE } from "./config.js";
import { SPECIES, plushGeometry } from "./plush-models.js";
import { clamp, randRange, pick, weighted } from "./util.js";

const P = CONFIG.physics;
const G = CONFIG.grab;
const WON_LINGER = 2.5; // seconds a prize stays visible in the pickup window
const H = CONFIG.hook; // fields are read at use time so ?set= overrides apply

export function createPlushManager({ world, scene, mats, rng }) {
  const list = [];
  let nextId = 1;
  const stats = { maxSpeed: 0, escaped: 0 };

  const matNormal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  const matLimited = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.38,
    metalness: 0.55,
    emissive: 0x4a3200,
    emissiveIntensity: 0.6,
  });

  // Tag ring and cord, shared by every tagged plush (model space, scaled with the plush mesh).
  const ringGeo = new THREE.TorusGeometry(H.ringR, H.tube, 8, 24).rotateY(Math.PI / 2); // ring normal along +x
  const cordGeo = new THREE.CylinderGeometry(H.tube, H.tube, H.cord + 0.04, 6);
  const matTag = new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 0.5, roughness: 0.35 });

  // Rarity first (weighted), then species, then a palette of that rarity.
  function roll() {
    const rarity = weighted(rng, CONFIG.rarity);
    const sp = pick(rng, SPECIES);
    const pal = pick(rng, sp.pals[rarity.id]);
    return { sp, pal, rarity };
  }

  function spawn(pos, opts = {}) {
    const { sp, pal, rarity } = opts.sp ? opts : roll();
    const scale = sp.size * randRange(rng, 0.9, 1.1);
    const body = new CANNON.Body({
      mass: scale ** 3,
      material: mats.plush,
      collisionFilterGroup: GROUP.PLUSH,
      collisionFilterMask: MASK.PLUSH,
      linearDamping: P.linearDamping,
      angularDamping: P.angularDamping,
      allowSleep: true,
      sleepSpeedLimit: P.sleepSpeedLimit,
      sleepTimeLimit: P.sleepTimeLimit,
    });
    const spheres = [];
    for (const [x, y, z, r] of sp.spheres) {
      const off = V(x * scale, y * scale, z * scale);
      body.addShape(new CANNON.Sphere(r * scale), off);
      spheres.push({ off, r: r * scale });
    }
    let core = spheres[0];
    for (const s of spheres) if (s.r > core.r) core = s;

    const yaw = opts.yaw ?? rng() * Math.PI * 2;
    const tagged = opts.tag ?? rng() < H.chance;
    place(body, pos, new CANNON.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw));
    world.addBody(body);

    const mesh = new THREE.Mesh(plushGeometry(sp, pal), rarity.id === "limited" ? matLimited : matNormal);
    mesh.scale.setScalar(scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    syncMesh(mesh, body, 1);

    let tag = null;
    if (tagged) {
      // The ring hangs on a short cord from the top of the highest collision sphere.
      let top = sp.spheres[0];
      for (const s of sp.spheres) if (s[1] + s[3] > top[1] + top[3]) top = s;
      const [x, y, z, r] = top;
      const y0 = y + r;
      const ringY = y0 + H.cord + H.ringR;
      const ring = new THREE.Mesh(ringGeo, matTag);
      ring.position.set(x, ringY, z);
      const cord = new THREE.Mesh(cordGeo, matTag);
      cord.position.set(x, y0 + H.cord / 2, z);
      ring.castShadow = cord.castShadow = true;
      mesh.add(ring, cord);
      tag = { local: V(x * scale, ringY * scale, z * scale), normal: V(1, 0, 0), r: H.ringR * scale };
    }

    const p = {
      id: nextId++,
      sp,
      pal,
      rarity,
      name: pal[0] + sp.name,
      scale,
      spheres,
      core,
      coreR: core.r,
      sizeN: clamp((core.r - G.idealRadius) / (G.maxRadius - G.idealRadius), 0, 1),
      body,
      mesh,
      tag, // tag ring in body space, or null
      state: "free", // free | held | won | gone
      wonAt: 0,
    };
    body.plush = p;
    list.push(p);
    return p;
  }

  function remove(p) {
    const i = list.indexOf(p);
    if (i < 0) return;
    list.splice(i, 1);
    world.removeBody(p.body);
    scene.remove(p.mesh);
    p.state = "gone";
  }

  function sync(alpha) {
    for (const p of list) syncMesh(p.mesh, p.body, alpha);
  }

  // Runs right before integration, so the capped velocity is the one that moves the body.
  function clampSpeeds() {
    for (const p of list) {
      const b = p.body;
      if (b.type !== CANNON.Body.DYNAMIC) continue;
      const v = b.velocity;
      const w = b.angularVelocity;
      const vl = v.length();
      if (vl > stats.maxSpeed) stats.maxSpeed = vl;
      if (vl > P.maxSpeed) v.scale(P.maxSpeed / vl, v);
      const wl = w.length();
      if (wl > P.maxSpin) w.scale(P.maxSpin / wl, w);
    }
  }
  world.addEventListener("preStep", clampSpeeds);

  function sphereWorld(p, s, out) {
    p.body.quaternion.vmult(s.off, out);
    out.vadd(p.body.position, out);
    return out;
  }

  // Prize check (fell through the hole) and escape check (left the play area by tunnelling).
  function update(time, on = {}) {
    const { floorY, chute, baseHalf } = MACHINE;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      if (p.state === "won") {
        if (time - p.wonAt > WON_LINGER) remove(p);
        continue;
      }
      if (p.state !== "free") continue;
      const { x, y, z } = p.body.position;
      if (y < floorY - 1 && x >= chute.x0 && x <= chute.x1 && z >= chute.z0 && z <= baseHalf) {
        p.state = "won";
        p.wonAt = time;
        on.win?.(p);
      } else if (
        (y < floorY - 0.8 && !inChuteXZ(x, z)) ||
        Math.abs(x) > 5.5 ||
        Math.abs(z) > 5.5 ||
        y < 0 ||
        y > 25
      ) {
        stats.escaped++;
        remove(p);
        on.escape?.(p);
      }
    }
  }

  const activeCount = () => list.reduce((n, p) => n + (p.state === "won" ? 0 : 1), 0);

  return { list, stats, roll, spawn, remove, sync, sphereWorld, update, activeCount };
}

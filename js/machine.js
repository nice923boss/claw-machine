// The playable cabinet: body, glass, gantry, control panel, coin slot, credit display and marquee sign.
// Every surface plush can touch lines up with machineColliders() in physics.js.
import * as THREE from "three";
import { MACHINE } from "./config.js";
import { machineColliders } from "./physics.js";
import { createBatch } from "./geo.js";
import { neonTexture, createSegDisplay } from "./textures.js";
import { clamp, lerp, smooth } from "./util.js";

const COL = {
  body: "#ef5b9c",
  trim: "#f3f0f5",
  dark: "#262a35",
  carpet: "#2c3a8c",
  cushion: "#4555c0",
  ramp: "#3a3f4b",
  shaft: "#20222b",
  board: "#1a1022",
  rail: "#9aa3b5",
};

export const PANEL = { joy: [-2.6, 8.5, 6.05], button: [1.9, 8.5, 6.05], slot: [4.35, 9.5, 6.52] };

export function createMachine({ scene }) {
  const { floorY, half, chute, baseHalf: B, wallTop } = MACHINE;
  const root = new THREE.Group();
  scene.add(root);

  const matBody = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.08 });
  const matGlow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const matGlass = new THREE.MeshStandardMaterial({
    color: 0xd6ecff,
    transparent: true,
    opacity: 0.12,
    roughness: 0.05,
    metalness: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  // ---- cabinet base, carpet and the drop shaft (casts and receives shadows)
  const base = createBatch();
  base.box(chute.x1, B, 0, floorY, -B, B, COL.body);
  base.box(-B, chute.x1, 0, floorY, -B, chute.z0, COL.body);
  base.box(-B, chute.x0, 0, floorY, chute.z0, B, COL.body); // outer side of the shaft
  base.box(chute.x0, chute.x1, 5, floorY, half, B, COL.body); // lip above the pickup window
  base.box(chute.x0, chute.x1, 0, 2.2, chute.z0, B, COL.shaft); // under the ramp
  base.box(chute.x1, half, floorY, floorY + 0.02, -half, half, COL.carpet);
  base.box(-half, chute.x1, floorY, floorY + 0.02, -half, chute.z0, COL.carpet);
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  for (const c of machineColliders()) {
    const isSlope = c.name.startsWith("slope");
    if (!isSlope && c.name !== "ramp") continue;
    _q.setFromEuler(_e.set(c.rotX || 0, 0, c.rotZ || 0));
    _m.compose(new THREE.Vector3(...c.c), _q, new THREE.Vector3(1, 1, 1));
    base.add(new THREE.BoxGeometry(c.h[0] * 2, c.h[1] * 2, c.h[2] * 2), isSlope ? COL.cushion : COL.ramp, _m);
  }
  // Rim around the glass foot hides where the cushions run into the walls.
  const rimY = floorY + 0.6;
  base.box(-B, B, floorY, rimY, half + 0.02, B, COL.trim);
  base.box(-B, B, floorY, rimY, -B, -half - 0.02, COL.trim);
  base.box(-B, -half - 0.02, floorY, rimY, -half, half, COL.trim);
  base.box(half + 0.02, B, floorY, rimY, -half, half, COL.trim);
  // Control panel across the front with the coin box on its right.
  base.box(-B, B, 7.2, 8.5, B, 6.8, COL.trim);
  base.box(-B, B, 7.0, 7.2, B, 6.9, COL.dark);
  base.box(3.6, 5.1, 8.5, 10.6, 5.35, 6.5, COL.dark);
  base.box(-1.4, 0.9, 8.5, 9.8, 5.32, 5.6, COL.dark);
  const baseMesh = new THREE.Mesh(base.merge(), matBody);
  baseMesh.castShadow = baseMesh.receiveShadow = true;
  root.add(baseMesh);

  // ---- upper frame: pillars, top box, header board, gantry rails (no shadows: the inside stays lit)
  const upper = createBatch();
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x0 = sx < 0 ? -B : half, z0 = sz < 0 ? -B : half;
      upper.box(x0, x0 + (B - half), floorY, wallTop + 0.2, z0, z0 + (B - half), COL.trim);
    }
  }
  upper.box(-B, B, wallTop + 0.2, 18.4, -B, B, COL.body);
  upper.box(-B, B, 18.4, 21.2, half + 0.1, B, COL.board);
  upper.box(-B, B, 18.4, 18.55, -B, half + 0.1, COL.body);
  for (const sx of [-1, 1]) upper.box(sx * 4.25 - 0.1, sx * 4.25 + 0.1, 16.95, 17.15, -half, half, COL.rail);
  const upperMesh = new THREE.Mesh(upper.merge(), matBody);
  upperMesh.receiveShadow = true;
  root.add(upperMesh);

  // Cross beam riding on the rails with the trolley.
  const beam = new THREE.Mesh(new THREE.BoxGeometry(8.7, 0.15, 0.3), new THREE.MeshStandardMaterial({ color: COL.rail, metalness: 0.4, roughness: 0.4 }));
  beam.position.set(0, 16.97, 0);
  root.add(beam);

  // ---- glowing parts: ceiling light panel, neon strips
  const glow = createBatch();
  glow.box(-half, half, wallTop + 0.15, wallTop + 0.2, -half, half, "#fff1d8");
  glow.box(-B, B, wallTop + 0.3, wallTop + 0.42, B, B + 0.05, "#45f0ff");
  for (const sx of [-1, 1]) glow.box(sx * 4.9 - 0.08, sx * 4.9 + 0.08, floorY + 0.7, wallTop, B, B + 0.05, "#ff5fd2");
  glow.box(-B, B, 8.45, 8.5, 6.8, 6.85, "#45f0ff");
  root.add(new THREE.Mesh(glow.merge(), matGlow));

  // ---- clear parts: glass walls, hole guards, pickup door
  const glass = createBatch();
  const gz = half + 0.02;
  glass.box(-half, half, floorY, wallTop + 0.2, gz, gz + 0.03, "#ffffff");
  glass.box(-half, half, floorY, wallTop + 0.2, -gz - 0.03, -gz, "#ffffff");
  glass.box(-gz - 0.03, -gz, floorY, wallTop + 0.2, -half, half, "#ffffff");
  glass.box(gz, gz + 0.03, floorY, wallTop + 0.2, -half, half, "#ffffff");
  for (const c of machineColliders()) {
    if (c.name !== "guardX" && c.name !== "guardZ") continue;
    glass.box(c.c[0] - c.h[0], c.c[0] + c.h[0], c.c[1] - c.h[1], c.c[1] + c.h[1], c.c[2] - c.h[2], c.c[2] + c.h[2], "#ffffff");
  }
  glass.box(chute.x0, chute.x1, 2.2, 5, B + 0.01, B + 0.04, "#ffffff");
  const glassMesh = new THREE.Mesh(glass.merge(), matGlass);
  glassMesh.renderOrder = 2;
  root.add(glassMesh);

  // ---- header sign and marquee bulbs
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(9.4, 2.3),
    new THREE.MeshBasicMaterial({ map: neonTexture("夾娃娃", "#ff4fd8", 640, 157), toneMapped: false }),
  );
  sign.position.set(0, 19.8, B + 0.01);
  root.add(sign);

  const bulbPos = [];
  const bx = 5.0, by0 = 18.6, by1 = 21.0;
  for (let x = -bx; x <= bx + 1e-6; x += 10 / 18) bulbPos.push([x, by1], [x, by0]);
  for (let y = by0 + 0.48; y < by1 - 0.2; y += 0.48) bulbPos.push([-bx, y], [bx, y]);
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ toneMapped: false }), bulbPos.length);
  bulbPos.forEach(([x, y], i) => bulbs.setMatrixAt(i, _m.makeTranslation(x, y, B + 0.08)));
  // Order bulbs around the frame so the chase runs in a loop.
  const order = bulbPos.map((p, i) => [Math.atan2(p[1] - (by0 + by1) / 2, p[0] / 3), i]).sort((a, b) => a[0] - b[0]).map((a) => a[1]);
  const BULB_ON = new THREE.Color("#ffe9a0"), BULB_OFF = new THREE.Color("#4a3a20"), BULB_PINK = new THREE.Color("#ff6fd8");
  order.forEach((i) => bulbs.setColorAt(i, BULB_OFF));
  root.add(bulbs);

  // ---- control panel parts
  const matDark = new THREE.MeshStandardMaterial({ color: COL.dark, roughness: 0.5 });
  const joy = new THREE.Group();
  joy.position.set(...PANEL.joy);
  const joyBase = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), matDark);
  const stick = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 8), new THREE.MeshStandardMaterial({ color: 0xc8ccd6, metalness: 0.7, roughness: 0.3 }));
  shaft.position.y = 0.4;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), new THREE.MeshStandardMaterial({ color: 0xe8202c, roughness: 0.3 }));
  knob.position.y = 0.85;
  stick.add(shaft, knob);
  joy.add(joyBase, stick);
  for (const o of [joyBase, shaft, knob]) o.castShadow = true;
  root.add(joy);

  const button = new THREE.Group();
  button.position.set(...PANEL.button);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.12, 24), matDark);
  ring.position.y = 0.06;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.2, 24), new THREE.MeshStandardMaterial({ color: 0xffc21a, roughness: 0.35, emissive: 0x4a3000 }));
  cap.position.y = 0.16;
  button.add(ring, cap);
  root.add(button);

  // Credit display: credits left, seconds right.
  const seg = createSegDisplay();
  const segMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.13, 0.8), new THREE.MeshBasicMaterial({ map: seg.texture, toneMapped: false }));
  segMesh.position.set(-0.25, 9.15, 5.61);
  root.add(segMesh);

  // Coin slot with its LED ring and label. coinTarget is what a click or tap must hit.
  const slotPos = new THREE.Vector3(...PANEL.slot);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.04), new THREE.MeshBasicMaterial({ color: 0x050505 }));
  slot.position.copy(slotPos);
  const led = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 6, 28), new THREE.MeshBasicMaterial({ color: 0x3dff7a, toneMapped: false }));
  led.position.copy(slotPos);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.5), new THREE.MeshBasicMaterial({ map: neonTexture("投幣", "#ffd23f", 256, 107), toneMapped: false }));
  label.position.set(slotPos.x, 10.25, slotPos.z + 0.005);
  const coinTarget = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.6, 1.8), new THREE.MeshBasicMaterial({ visible: false }));
  coinTarget.position.set(slotPos.x, 9.6, 5.95);
  root.add(slot, led, label, coinTarget);
  const LED_ON = new THREE.Color(0x3dff7a), LED_OFF = new THREE.Color(0x0b3018);

  // ---- coin flight: from the player's hand into the slot, edge first
  const coinGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.06, 24).rotateZ(Math.PI / 2); // face normal along x, like the slot
  const coinMat = new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 0.85, roughness: 0.25 });
  const coins = [];
  const FLY = 0.45, SLIDE = 0.15;

  function insertCoin(from, onIn) {
    const mesh = new THREE.Mesh(coinGeo, coinMat);
    mesh.position.copy(from);
    root.add(mesh);
    coins.push({ mesh, from: from.clone(), t: 0, onIn, spin: Math.random() * 6 });
    ledFast = 0.6;
  }

  const _p = new THREE.Vector3();
  function updateCoins(dt) {
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      c.t += dt;
      if (c.t < FLY) {
        const k = smooth(c.t / FLY);
        _p.lerpVectors(c.from, slotPos, k);
        _p.y += Math.sin(k * Math.PI) * 0.9; // a little arc
        _p.z += 0.12 * (1 - k);
        c.mesh.position.copy(_p);
        c.mesh.rotation.set(0, 0, (1 - k) * (c.spin + 1.4)); // tumbles, then lines up with the slot
      } else if (c.t < FLY + SLIDE) {
        const k = (c.t - FLY) / SLIDE;
        c.mesh.rotation.set(0, 0, 0);
        c.mesh.position.set(slotPos.x, slotPos.y, slotPos.z - k * 0.4);
      } else {
        root.remove(c.mesh);
        coins.splice(i, 1);
        c.onIn?.();
      }
    }
  }

  // ---- animation state
  let pressT = 0;
  let flashT = 0;
  let ledFast = 0;
  let chaseT = 0;
  let chaseStep = 0;
  let time = 0;

  function pressButton() {
    pressT = 0.18;
  }
  function flash(sec = 2.5) {
    flashT = sec;
  }

  // info: { credits, seconds (null when no round), ix, iz, trolleyZ }
  function update(dt, info) {
    time += dt;
    updateCoins(dt);

    // Stick leans with the input, the button dips while pressed.
    stick.rotation.x = lerp(stick.rotation.x, info.iz * 0.35, Math.min(1, dt * 18));
    stick.rotation.z = lerp(stick.rotation.z, -info.ix * 0.35, Math.min(1, dt * 18));
    pressT = Math.max(0, pressT - dt);
    cap.position.y = 0.16 - (pressT > 0 ? 0.1 : 0);
    beam.position.z = clamp(info.trolleyZ, -half, half);

    seg.set(info.credits, info.seconds);

    // LED ring: blinks slowly with no credits, fast right after a coin, steady otherwise.
    ledFast = Math.max(0, ledFast - dt);
    let on = true;
    if (ledFast > 0) on = Math.floor(time * 16) % 2 === 0;
    else if (info.credits <= 0) on = Math.floor(time * 2) % 2 === 0;
    led.material.color.copy(on ? LED_ON : LED_OFF);

    // Marquee: a chasing pattern, all bulbs flashing pink during a restock.
    flashT = Math.max(0, flashT - dt);
    chaseT += dt;
    if (chaseT >= (flashT > 0 ? 0.08 : 0.12)) {
      chaseT = 0;
      chaseStep++;
      order.forEach((idx, k) => {
        const c = flashT > 0 ? (chaseStep % 2 ? BULB_PINK : BULB_OFF) : (k + chaseStep) % 3 === 0 ? BULB_ON : BULB_OFF;
        bulbs.setColorAt(idx, c);
      });
      bulbs.instanceColor.needsUpdate = true;
    }
  }

  return { root, coinTarget, slotPos, insertCoin, pressButton, flash, update };
}

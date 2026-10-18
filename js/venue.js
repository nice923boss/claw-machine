// The claw shop around the playable machine: tiled floor, neon walls, decorative cabinets and a coin changer.
// Everything here is static and merged by material, so the whole room costs a handful of draw calls.
import * as THREE from "three";
import { createBatch, frameAt } from "./geo.js";
import { neonAtlas, tileTexture } from "./textures.js";
import { pick, randRange } from "./util.js";

export const ROOM = { x0: -33, x1: 33, z0: -34, z1: 38, h: 34 };

const SIGNS = [
  ["claw", "夾娃娃", "#ff4fd8"],
  ["shop", "選物販賣機", "#4ff3ff"],
  ["open", "24H 營業", "#ffe14f"],
  ["welcome", "歡迎光臨", "#7dff6b"],
  ["lucky", "幸運夾", "#ff8a3d"],
  ["king", "娃娃王", "#b28cff"],
  ["fun", "夾夾樂", "#ff5f7a"],
  ["new", "新品上架", "#4fffb0"],
  ["change", "兌幣機", "#ffd700"],
];
const BODY = ["#4f8cff", "#ffb02e", "#37c99a", "#c15cff", "#ff6b6b", "#2fc4e8"];
const NEON = ["#ff4fd8", "#45f0ff", "#ffe14f", "#7dff6b", "#ff8a3d"];
const PLUSH = ["#ffd1dc", "#ffb3c7", "#c8e6ff", "#fff2a8", "#c9f7d0", "#e2c9ff", "#ffcc99", "#a0d8ef", "#f7a1a1", "#ffffff", "#8b5a3c"];
const TRIM = "#f3f0f5";

export function createVenue({ scene, rng }) {
  const solid = createBatch();
  const glass = createBatch();
  const glow = createBatch();
  const signs = createBatch();
  const atlas = neonAtlas(SIGNS.map(([, text, color]) => [text, color]));
  const rect = Object.fromEntries(SIGNS.map(([id], i) => [id, atlas.rects[i]]));
  const _t = new THREE.Matrix4();
  const _f = new THREE.Matrix4();

  const sign = (w, h, x, y, z, frame, id) => {
    _f.multiplyMatrices(frame, _t.makeTranslation(x, y, z));
    signs.add(new THREE.PlaneGeometry(w, h), "#ffffff", _f, rect[id]);
  };

  // A non-playable claw machine in local space (front towards +z), same proportions as the real one.
  function cabinet(x, z, rotY, body, signId) {
    const f = frameAt(x, z, rotY);
    solid.box(-5.3, 5.3, 0, 8, -5.3, 5.3, body, f);
    solid.box(-5.3, 5.3, 7.2, 8.5, 5.3, 6.8, TRIM, f);
    solid.box(-4.5, -1.5, 2.2, 5, 5.3, 5.32, "#20222b", f); // pickup window
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x0 = sx < 0 ? -5.3 : 4.5, z0 = sz < 0 ? -5.3 : 4.5;
        solid.box(x0, x0 + 0.8, 8, 17.2, z0, z0 + 0.8, TRIM, f);
      }
    }
    solid.box(-5.3, 5.3, 17.2, 18.4, -5.3, 5.3, body, f);
    solid.box(-5.3, 5.3, 18.4, 21, 4.6, 5.3, "#1a1022", f);
    solid.box(-4.5, 4.5, 8, 8.02, -4.5, 4.5, pick(rng, ["#2c3a8c", "#7a2c6b", "#2c6b5a"]), f);
    solid.at(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 6), "#c8ccd6", -2.6, 8.9, 6.05, f);
    solid.at(new THREE.SphereGeometry(0.24, 8, 6), "#e8202c", -2.6, 9.35, 6.05, f);
    solid.at(new THREE.CylinderGeometry(0.36, 0.36, 0.2, 12), "#ffc21a", 1.9, 8.6, 6.05, f);
    // A heap of plush, suggested by soft round shapes.
    for (let i = 0; i < 12; i++) {
      const r = randRange(rng, 0.55, 0.95);
      const px = randRange(rng, -3.6, 3.6), pz = randRange(rng, -3.6, 3.6);
      const py = 8 + r + (rng() < 0.35 ? randRange(rng, 0.6, 1.2) : 0);
      solid.at(new THREE.SphereGeometry(r, 8, 6), pick(rng, PLUSH), px, py, pz, f);
    }
    glass.box(-4.5, 4.5, 8, 17.2, -4.5, 4.5, "#ffffff", f);
    glow.box(-4.5, 4.5, 17.12, 17.18, -4.5, 4.5, "#fff1d8", f);
    const neon = pick(rng, NEON);
    for (const sx of [-1, 1]) glow.box(sx * 4.9 - 0.08, sx * 4.9 + 0.08, 8.7, 17, 5.3, 5.35, neon, f);
    glow.box(-5.3, 5.3, 17.5, 17.62, 5.3, 5.35, neon, f);
    sign(9.4, 2.2, 0, 19.7, 5.31, f, signId);
  }

  // Coin changer: a tall gold box with a screen, bill slot and coin tray.
  function changer(x, z, rotY) {
    const f = frameAt(x, z, rotY);
    solid.box(-2.2, 2.2, 0, 15.5, -1.6, 1.6, "#d9a520", f);
    solid.box(-1.9, 1.9, 2, 5, 1.6, 1.95, "#2b2b33", f);
    solid.box(-1.2, 1.2, 8.6, 8.9, 1.6, 1.75, "#101014", f);
    solid.box(-0.5, 0.5, 7.2, 7.6, 1.6, 1.75, "#101014", f);
    glow.box(-1.6, 1.6, 9.8, 12.4, 1.6, 1.65, "#4fd2ff", f);
    sign(4.2, 1.05, 0, 13.9, 1.62, f, "change");
  }

  // ---- room shell
  const { x0, x1, z0, z1, h } = ROOM;
  const wall = "#2a1d3a";
  solid.box(x0 - 1, x1 + 1, h, h + 1, z0 - 1, z1 + 1, "#18121f");
  solid.box(x0 - 1, x1 + 1, 0, h, z0 - 1, z0, wall);
  solid.box(x0 - 1, x1 + 1, 0, h, z1, z1 + 1, wall);
  solid.box(x0 - 1, x0, 0, h, z0, z1, wall);
  solid.box(x1, x1 + 1, 0, h, z0, z1, wall);
  // Neon lines along the walls and light panels on the ceiling.
  const line = (y, color) => {
    glow.box(x0, x1, y, y + 0.25, z0, z0 + 0.06, color);
    glow.box(x0, x1, y, y + 0.25, z1 - 0.06, z1, color);
    glow.box(x0, x0 + 0.06, y, y + 0.25, z0, z1, color);
    glow.box(x1 - 0.06, x1, y, y + 0.25, z0, z1, color);
  };
  line(27, "#ff4fd8");
  line(1.2, "#45f0ff");
  for (let gx = -24; gx <= 24; gx += 12) {
    for (let gz = -24; gz <= 30; gz += 12) glow.box(gx - 3, gx + 3, h - 0.08, h, gz - 1, gz + 1, "#e8e2ff");
  }
  const I = new THREE.Matrix4();
  sign(18, 4.2, 0, 23.5, z0 + 0.02, I, "shop");
  _f.makeRotationY(Math.PI / 2).setPosition(x0 + 0.02, 0, 0);
  sign(13, 3.2, 0, 23.5, 0, _f.clone(), "open");
  _f.makeRotationY(-Math.PI / 2).setPosition(x1 - 0.02, 0, 0);
  sign(13, 3.2, 0, 23.5, 0, _f.clone(), "new");
  _f.makeRotationY(Math.PI).setPosition(0, 0, z1 - 0.02);
  sign(16, 4, 0, 23.5, 0, _f.clone(), "welcome");

  // ---- decorative machines along the walls, all facing the playable one
  const names = ["claw", "lucky", "king", "fun"];
  let k = 0;
  const next = () => [BODY[k % BODY.length], names[k++ % names.length]];
  for (const x of [-18, -6, 6]) cabinet(x, -26, 0, ...next());
  for (const z of [-12, 0, 12]) cabinet(-26, z, Math.PI / 2, ...next());
  for (const z of [-12, 0, 12]) cabinet(26, z, -Math.PI / 2, ...next());
  for (const x of [-12, 0, 12]) cabinet(x, 31, Math.PI, ...next());
  changer(17, -27.5, 0);

  // ---- meshes
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: tileTexture([(x1 - x0) / 8, (z1 - z0) / 8]), roughness: 0.35, metalness: 0.05 }),
  );
  floor.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
  floor.receiveShadow = true;
  const room = new THREE.Group();
  room.add(
    floor,
    new THREE.Mesh(solid.merge(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05 })),
    new THREE.Mesh(glow.merge(), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })),
    new THREE.Mesh(signs.merge(), new THREE.MeshBasicMaterial({ map: atlas.texture, vertexColors: true, toneMapped: false })),
  );
  const glassMesh = new THREE.Mesh(
    glass.merge(),
    new THREE.MeshStandardMaterial({ color: 0xd6ecff, transparent: true, opacity: 0.14, roughness: 0.05, depthWrite: false }),
  );
  glassMesh.renderOrder = 1;
  room.add(glassMesh);
  scene.add(room);
  return { room };
}

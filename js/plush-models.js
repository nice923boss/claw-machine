// Procedural plush models: collision spheres, palettes and merged vertex-coloured geometry.
// Model space: +Z is the face, +Y is up, units before the per-plush scale.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const EYE = 0x1d1a1f;
const SHINE = 0xffffff;
const GOLD = ["金色", 0xe7b928, 0xfff0b0, 0xd9472b, 0xb8860b];
const HALF_PI = Math.PI / 2;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

// Collects primitives, bakes transform and colour into each, then merges them into one geometry.
function collector(pal) {
  const geos = [];
  const add = (geo, color, pos, rot, scl) => {
    _e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0);
    _m.compose(_p.set(pos[0], pos[1], pos[2]), _q.setFromEuler(_e), scl ? _s.set(scl[0], scl[1], scl[2]) : _s.set(1, 1, 1));
    geo.applyMatrix4(_m);
    const c = new THREE.Color(typeof color === "string" ? pal[color] : color);
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    geos.push(geo);
  };
  return {
    sphere(r, color, pos, scl, rot, w = 10, h = 8) {
      add(new THREE.SphereGeometry(r, w, h), color, pos, rot, scl);
    },
    body(r, color, pos, scl, rot) {
      add(new THREE.SphereGeometry(r, 20, 14), color, pos, rot, scl);
    },
    cone(r, h, color, pos, rot) {
      add(new THREE.ConeGeometry(r, h, 10), color, pos, rot);
    },
    cyl(rt, rb, h, color, pos, rot) {
      add(new THREE.CylinderGeometry(rt, rb, h, 12), color, pos, rot);
    },
    torus(r, t, color, pos, rot) {
      add(new THREE.TorusGeometry(r, t, 6, 14), color, pos, rot);
    },
    eyes(x, y, z, r, scl) {
      for (const sx of [-1, 1]) {
        add(new THREE.SphereGeometry(r, 10, 8), EYE, [sx * x, y, z], null, scl);
        add(new THREE.SphereGeometry(r * 0.35, 6, 5), SHINE, [sx * x + r * 0.3, y + r * 0.35, z + r * 0.72]);
      }
    },
    mirror(fn) {
      fn(-1);
      fn(1);
    },
    merge() {
      const g = mergeGeometries(geos, false);
      for (const x of geos) x.dispose();
      g.computeBoundingSphere();
      return g;
    },
  };
}

// Palette rows: [name, main, accent, extra, mark].
export const SPECIES = [
  {
    id: "bear",
    name: "小熊",
    size: 1.05,
    spheres: [[0, -0.25, 0, 0.6], [0, 0.55, 0.05, 0.5]],
    pals: {
      common: [["棕色", 0xa86f3e, 0xf0d2a8, 0xd04a4a, 0x5b3a22], ["奶茶", 0xd3ad83, 0xfaeedd, 0x6fa8dc, 0x8a6a4c]],
      rare: [["粉紅", 0xf4a7c3, 0xfff0f5, 0x8fc9ff, 0x7a4a5a], ["薄荷", 0x9ee0c8, 0xf0fff8, 0xffb347, 0x4f8f7a]],
      limited: [GOLD],
    },
    build(b) {
      b.body(0.58, "main", [0, -0.25, 0], [1, 0.95, 0.95]);
      b.sphere(0.4, "accent", [0, -0.28, 0.4], [1, 1, 0.5], null, 16, 10);
      b.body(0.48, "main", [0, 0.55, 0.05]);
      b.mirror((s) => {
        b.sphere(0.17, "main", [s * 0.33, 0.93, 0]);
        b.sphere(0.1, "accent", [s * 0.33, 0.93, 0.09], [1, 1, 0.45]);
        b.sphere(0.17, "main", [s * 0.52, -0.12, 0.18], [1, 1.3, 1]);
        b.sphere(0.2, "main", [s * 0.28, -0.7, 0.22], [1, 0.8, 1.25]);
        b.sphere(0.1, "accent", [s * 0.28, -0.7, 0.46], [1, 1, 0.35]);
        b.cone(0.1, 0.2, "extra", [s * 0.13, 0.12, 0.5], [0, 0, (s * Math.PI) / 2]);
      });
      b.sphere(0.06, "extra", [0, 0.12, 0.52]);
      b.sphere(0.2, "accent", [0, 0.46, 0.44], [1.2, 0.85, 0.8]);
      b.sphere(0.065, "mark", [0, 0.52, 0.6], [1.3, 1, 1]);
      b.eyes(0.17, 0.66, 0.45, 0.06);
    },
  },
  {
    id: "rabbit",
    name: "兔子",
    size: 0.95,
    spheres: [[0, -0.25, 0, 0.55], [0, 0.48, 0.03, 0.45]],
    pals: {
      common: [["白色", 0xf6f3ee, 0xffffff, 0xf08aa0, 0xd8d0c8], ["灰色", 0xa9a9b3, 0xf2e8ea, 0xf08aa0, 0x77777f]],
      rare: [["粉紅", 0xf7b6cf, 0xfff2f7, 0xe0607e, 0xd88aa6], ["薰衣草", 0xc6b4ea, 0xf4efff, 0xe0607e, 0x9a86c8]],
      limited: [GOLD],
    },
    build(b) {
      b.body(0.53, "main", [0, -0.25, 0], [1, 1, 0.95]);
      b.sphere(0.36, "accent", [0, -0.3, 0.36], [1, 1.05, 0.45], null, 16, 10);
      b.body(0.44, "main", [0, 0.48, 0.03], [1.05, 0.95, 1]);
      b.mirror((s) => {
        b.sphere(0.13, "main", [s * 0.15, 1.05, -0.05], [0.9, 3.2, 0.6], [-0.3, 0, -s * 0.15]);
        b.sphere(0.08, "extra", [s * 0.15, 1.05, 0.01], [0.9, 3.4, 0.4], [-0.3, 0, -s * 0.15]);
        b.sphere(0.07, "extra", [s * 0.25, 0.38, 0.4], [1.3, 0.8, 0.5]);
        b.sphere(0.15, "main", [s * 0.45, -0.1, 0.2], [1, 1.3, 1]);
        b.sphere(0.18, "main", [s * 0.24, -0.68, 0.25], [1, 0.7, 1.4]);
        b.sphere(0.09, "mark", [s * 0.24, -0.68, 0.48], [1, 1, 0.35]);
      });
      b.sphere(0.05, "extra", [0, 0.45, 0.47], [1.3, 1, 1]);
      b.sphere(0.15, "accent", [0, -0.35, -0.53]);
      b.eyes(0.16, 0.55, 0.4, 0.055);
    },
  },
  {
    id: "cat",
    name: "貓咪",
    size: 1.0,
    spheres: [[0, -0.25, 0, 0.58], [0, 0.5, 0.03, 0.5]],
    pals: {
      common: [
        ["橘色", 0xf0a04b, 0xfff3e0, 0xf28c9c, 0xc8742a],
        ["灰色", 0x9aa0a8, 0xf5f5f5, 0xf28c9c, 0x6d737a],
        ["黑色", 0x3a3a40, 0xe8e8e8, 0xf28c9c, 0x2a2a2e],
      ],
      rare: [["三花", 0xfaf5ec, 0xffffff, 0xf28c9c, 0xe0913a], ["粉藍", 0xa9cdf0, 0xf0f8ff, 0xf28c9c, 0x7ea9d6]],
      limited: [GOLD],
    },
    build(b) {
      b.body(0.56, "main", [0, -0.25, 0], [1, 0.95, 0.95]);
      b.sphere(0.36, "accent", [0, -0.3, 0.38], [1, 1.1, 0.45], null, 16, 10);
      b.body(0.47, "main", [0, 0.5, 0.03], [1.12, 0.92, 1]);
      b.mirror((s) => {
        b.cone(0.17, 0.32, "main", [s * 0.3, 0.92, 0], [0, 0, -s * 0.38]);
        b.cone(0.1, 0.2, "accent", [s * 0.29, 0.9, 0.07], [0, 0, -s * 0.38]);
        b.sphere(0.1, "accent", [s * 0.08, 0.38, 0.45], [1.1, 0.85, 0.8]);
        b.sphere(0.16, "main", [s * 0.48, -0.12, 0.22], [1, 1.25, 1]);
        b.sphere(0.19, "accent", [s * 0.27, -0.7, 0.24], [1, 0.75, 1.25]);
        b.sphere(0.04, "mark", [s * 0.12, 0.82, 0.31], [1, 1.8, 0.6], [0, 0, s * 0.3]);
      });
      b.sphere(0.045, "extra", [0, 0.45, 0.51], [1.3, 0.9, 1]);
      b.sphere(0.05, "mark", [0, 0.84, 0.31], [1, 2, 0.6]);
      b.sphere(0.11, "main", [0.05, -0.55, -0.55]);
      b.sphere(0.1, "main", [0.12, -0.38, -0.68]);
      b.sphere(0.095, "main", [0.18, -0.18, -0.72]);
      b.sphere(0.09, "mark", [0.22, 0, -0.7]);
      b.eyes(0.18, 0.56, 0.45, 0.065, [0.75, 1.25, 0.6]);
    },
  },
  {
    id: "chick",
    name: "小雞",
    size: 0.85,
    spheres: [[0, -0.18, 0, 0.58], [0, 0.3, 0.02, 0.44]],
    pals: {
      common: [["黃色", 0xffd84a, 0xf5c22e, 0xff8c2a, 0xff9fb0], ["橘色", 0xffb347, 0xf59a23, 0xff7a1a, 0xff9fb0]],
      rare: [["白色", 0xfaf7f0, 0xe8e2d6, 0xff8c2a, 0xff9fb0]],
      limited: [GOLD],
    },
    build(b) {
      b.body(0.57, "main", [0, -0.2, 0], [1, 1.02, 1]);
      b.body(0.43, "main", [0, 0.32, 0.03]);
      b.cone(0.085, 0.2, "extra", [0, 0.3, 0.5], [HALF_PI, 0, 0]);
      b.mirror((s) => {
        b.sphere(0.2, "accent", [s * 0.55, -0.18, 0], [0.4, 0.85, 0.8], [0, 0, s * 0.25]);
        b.sphere(0.07, "mark", [s * 0.27, 0.22, 0.38], [1.3, 0.8, 0.5]);
        b.cone(0.07, 0.18, "extra", [s * 0.2, -0.7, 0.25], [HALF_PI, 0, 0]);
      });
      b.cone(0.06, 0.2, "accent", [0, 0.8, 0.02], [0, 0, 0.3]);
      b.cone(0.05, 0.16, "accent", [0.06, 0.78, -0.04], [0, 0, -0.4]);
      b.eyes(0.15, 0.42, 0.4, 0.055);
    },
  },
  {
    id: "penguin",
    name: "企鵝",
    size: 1.0,
    spheres: [[0, -0.2, 0, 0.55], [0, 0.48, 0, 0.45]],
    pals: {
      common: [["藍色", 0x2f4b7c, 0xf7f7f7, 0xffa53a, 0xff9fb0], ["黑色", 0x2b2b30, 0xf7f7f7, 0xffa53a, 0xff9fb0]],
      rare: [["天空藍", 0x6bb6ea, 0xf7f7f7, 0xffa53a, 0xff9fb0]],
      limited: [GOLD],
    },
    build(b) {
      b.body(0.54, "main", [0, -0.2, 0], [1, 1.08, 0.95]);
      b.sphere(0.44, "accent", [0, -0.25, 0.22], [0.92, 1.1, 0.75], null, 18, 12);
      b.body(0.44, "main", [0, 0.48, 0]);
      b.sphere(0.34, "accent", [0, 0.43, 0.19], [1.15, 0.9, 0.85], null, 16, 12);
      b.cone(0.07, 0.17, "extra", [0, 0.38, 0.5], [HALF_PI, 0, 0]);
      b.mirror((s) => {
        b.sphere(0.18, "main", [s * 0.53, -0.15, 0], [0.35, 1, 0.65], [0, 0, s * 0.35]);
        b.sphere(0.13, "extra", [s * 0.2, -0.72, 0.2], [1, 0.4, 1.5]);
        b.sphere(0.06, "mark", [s * 0.25, 0.32, 0.4], [1.3, 0.8, 0.5]);
      });
      b.eyes(0.14, 0.52, 0.42, 0.05);
    },
  },
  {
    id: "dino",
    name: "恐龍",
    size: 1.15,
    spheres: [[0, -0.1, 0, 0.55], [0, 0.55, 0.55, 0.38], [0, -0.1, -0.7, 0.3]],
    pals: {
      common: [["綠色", 0x6cc070, 0xe6f5c9, 0xf6c445, 0x2f3a2f], ["藍色", 0x5aa7d8, 0xe0f2ff, 0xffd166, 0x2a3a4a]],
      rare: [["紫色", 0xa27ad6, 0xf1e6ff, 0x7cd992, 0x3a2a4a]],
      limited: [GOLD],
    },
    build(b) {
      b.body(0.54, "main", [0, -0.12, 0], [0.95, 0.95, 1.1]);
      b.sphere(0.38, "accent", [0, -0.2, 0.36], [0.9, 1, 0.55], null, 16, 10);
      b.cyl(0.18, 0.24, 0.5, "main", [0, 0.3, 0.33], [0.65, 0, 0]);
      b.body(0.32, "main", [0, 0.6, 0.55], [1, 0.9, 1.15]);
      b.sphere(0.22, "main", [0, 0.5, 0.82], [1, 0.8, 1]);
      b.cone(0.26, 0.95, "main", [0, -0.18, -0.85], [-HALF_PI - 0.2, 0, 0]);
      for (const [y, z, r] of [[0.86, 0.45, 0.1], [0.5, 0.18, 0.1], [0.42, -0.1, 0.11], [0.3, -0.4, 0.1], [0.05, -0.7, 0.08]]) {
        b.cone(r, r * 2, "extra", [0, y, z], [-0.4, 0, 0]);
      }
      b.mirror((s) => {
        b.cyl(0.13, 0.15, 0.24, "main", [s * 0.3, -0.55, 0.22]);
        b.cyl(0.14, 0.16, 0.24, "main", [s * 0.3, -0.55, -0.28]);
        b.sphere(0.1, "main", [s * 0.4, 0, 0.32], [0.8, 1.2, 0.8]);
        b.sphere(0.03, "mark", [s * 0.07, 0.55, 1.01]);
      });
      b.eyes(0.15, 0.7, 0.83, 0.055);
    },
  },
  {
    id: "pig",
    name: "小豬",
    size: 1.1,
    spheres: [[0, -0.05, -0.2, 0.6], [0, 0.18, 0.42, 0.47]],
    pals: {
      common: [["粉紅", 0xf7b2bd, 0xf08ea0, 0x8a5a5a, 0xe8798d], ["花斑", 0xfbe3e3, 0xf0a3ae, 0x7a5050, 0x8a6060]],
      rare: [["奶油", 0xf6e3c6, 0xeac9a0, 0x8a6a4a, 0xd9a77a]],
      limited: [GOLD],
    },
    build(b) {
      b.body(0.58, "main", [0, -0.05, -0.2], [0.95, 0.88, 1.15]);
      b.body(0.45, "main", [0, 0.18, 0.42]);
      b.cyl(0.16, 0.16, 0.14, "accent", [0, 0.12, 0.86], [HALF_PI, 0, 0]);
      b.mirror((s) => {
        b.sphere(0.035, "extra", [s * 0.06, 0.12, 0.93]);
        b.cone(0.14, 0.24, "main", [s * 0.25, 0.58, 0.42], [0.7, 0, -s * 0.35]);
        for (const z of [0.15, -0.5]) {
          b.cyl(0.12, 0.11, 0.24, "main", [s * 0.3, -0.48, z]);
          b.cyl(0.111, 0.111, 0.06, "extra", [s * 0.3, -0.62, z]);
        }
        b.sphere(0.08, "mark", [s * 0.28, 0.06, 0.74], [1.2, 0.8, 0.5]);
      });
      b.sphere(0.1, "mark", [0.12, 0.25, -0.4], [1.6, 0.5, 1.4]);
      b.torus(0.08, 0.03, "mark", [0, 0.1, -0.88]);
      b.eyes(0.17, 0.33, 0.8, 0.05);
    },
  },
  {
    id: "octopus",
    name: "章魚",
    size: 1.1,
    spheres: [[0, 0.22, 0, 0.6], [0, -0.2, 0, 0.45]],
    pals: {
      common: [["紅色", 0xe85d5d, 0xffd0c8, 0xb33a3a, 0xffe0d6], ["紫色", 0x9a6fd0, 0xe8dcff, 0x6e45a8, 0xf0e6ff]],
      rare: [["粉紅", 0xff9ec7, 0xffe3f0, 0xd9578f, 0xfff0f6], ["藍色", 0x6aa8ff, 0xdcebff, 0x3a6fc8, 0xeef5ff]],
      limited: [GOLD],
    },
    build(b) {
      b.body(0.6, "main", [0, 0.25, 0], [1, 1.05, 1]);
      b.sphere(0.5, "main", [0, -0.28, 0], [1.2, 0.55, 1.2], null, 20, 10);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        const c = Math.cos(a), s = Math.sin(a);
        b.sphere(0.14, "main", [c * 0.52, -0.55, s * 0.52], [1, 0.75, 2.4], [0, HALF_PI - a, 0]);
        b.sphere(0.1, "accent", [c * 0.82, -0.58, s * 0.82], [1, 0.8, 1]);
      }
      b.mirror((s) => {
        b.sphere(0.06, "mark", [s * 0.3, 0.62, 0.37], [1, 1, 0.5]);
        b.sphere(0.08, "accent", [s * 0.33, 0.1, 0.5], [1.3, 0.8, 0.5]);
      });
      b.sphere(0.07, "mark", [0, 0.82, 0.25], [1, 1, 0.5]);
      b.torus(0.07, 0.03, "extra", [0, 0.05, 0.6]);
      b.eyes(0.2, 0.3, 0.53, 0.1);
    },
  },
];

const geoCache = new Map();

// One merged geometry per species and palette, shared by every plush of that kind.
export function plushGeometry(sp, pal) {
  const key = sp.id + ":" + pal[0];
  let g = geoCache.get(key);
  if (!g) {
    const [, main, accent, extra, mark] = pal;
    const b = collector({ main, accent, extra, mark });
    sp.build(b);
    g = b.merge();
    geoCache.set(key, g);
  }
  return g;
}

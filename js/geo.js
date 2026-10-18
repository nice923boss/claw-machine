// Geometry batching: many flat-coloured parts merged into one mesh, so a whole cabinet is one draw call.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const _m = new THREE.Matrix4();
const _c = new THREE.Color();

export function createBatch() {
  const geos = [];

  // Takes ownership of geo. matrix places it; uvRect [u0, v0, u1, v1] maps its 0..1 UVs into an atlas cell.
  function add(geo, color, matrix = null, uvRect = null) {
    const g = geo.index ? geo.toNonIndexed() : geo; // merged parts must all be non-indexed
    if (g !== geo) geo.dispose();
    if (matrix) g.applyMatrix4(matrix);
    if (uvRect) {
      const uv = g.attributes.uv;
      const [u0, v0, u1, v1] = uvRect;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    }
    _c.set(color);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([_c.r, _c.g, _c.b], i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.clearGroups();
    geos.push(g);
    return g;
  }

  // Axis-aligned box from its extents, optionally placed in a parent frame.
  function box(x0, x1, y0, y1, z0, z1, color, frame = null) {
    _m.makeTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    if (frame) _m.premultiply(frame);
    return add(new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)), color, _m);
  }

  // Any geometry at (x, y, z) in an optional parent frame.
  function at(geo, color, x, y, z, frame = null) {
    _m.makeTranslation(x, y, z);
    if (frame) _m.premultiply(frame);
    return add(geo, color, _m);
  }

  function merge() {
    if (!geos.length) return new THREE.BufferGeometry();
    const g = mergeGeometries(geos, false);
    for (const x of geos) x.dispose();
    geos.length = 0;
    g.computeBoundingSphere();
    return g;
  }

  return { add, box, at, merge };
}

// Frame for a part of a cabinet standing at (x, z) and facing direction rotY (0 = front towards +z).
export function frameAt(x, z, rotY) {
  return new THREE.Matrix4().makeRotationY(rotY).setPosition(x, 0, z);
}

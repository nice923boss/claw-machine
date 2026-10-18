// Restocking: every 40 to 120 seconds (or right away when few are left) 3 to 6 new plush drop in from the top.
// Never while the claw is working; the batch waits for the round to end.
import { CONFIG } from "./config.js";
import { inChuteXZ } from "./physics.js";
import { randRange, randInt } from "./util.js";

const R = CONFIG.restock;
const DROP_GAP = 0.25; // seconds between two plush of a batch

export function createRestock({ plushes, claw, rng, debug = false, onBatch }) {
  const [minSec, maxSec] = debug ? [R.debugMinSec, R.debugMaxSec] : [R.minSec, R.maxSec];
  let wait = randRange(rng, minSec, maxSec);
  let queue = []; // rolled plush still to drop
  let gap = 0;

  // A free spot inside the glass, away from the hole and from plush near that height.
  function spot(y0, y1) {
    for (let i = 0; i < 40; i++) {
      const c = { x: randRange(rng, -3.8, 3.8), y: randRange(rng, y0, y1), z: randRange(rng, -3.8, 3.8) };
      if (inChuteXZ(c.x, c.z, 1.0)) continue;
      if (plushes.list.some(({ body: { position: b } }) => Math.hypot(b.x - c.x, b.y - c.y, b.z - c.z) < 1.7)) continue;
      return c;
    }
    return null;
  }

  // The opening stock, poured in at once.
  function fill(n = R.initial) {
    for (let k = 0; k < n; k++) {
      const c = spot(9.5, 16);
      if (c) plushes.spawn(c);
    }
  }

  function start() {
    const room = R.cap - plushes.activeCount() - queue.length;
    const n = Math.min(randInt(rng, R.batchMin, R.batchMax), room);
    wait = randRange(rng, minSec, maxSec);
    if (n <= 0) return;
    queue = Array.from({ length: n }, () => plushes.roll());
    gap = 0;
    onBatch?.(queue.map((r) => ({ name: r.pal[0] + r.sp.name, rarity: r.rarity })));
  }

  function update(dt) {
    if (queue.length) {
      gap -= dt;
      if (gap <= 0) {
        const c = spot(14.5, 16);
        if (c) {
          plushes.spawn(c, queue.shift());
          gap = DROP_GAP;
        }
      }
      return;
    }
    wait -= dt;
    const due = wait <= 0 || plushes.activeCount() < R.lowCount;
    if (due && claw.state === "idle") start();
  }

  return {
    fill,
    update,
    get next() {
      return Math.max(0, wait);
    },
    get dropping() {
      return queue.length > 0;
    },
  };
}

// Replayable auto test: picks a plush (or a random spot), steers the claw there, drops and records.
// It runs once per physics step, so a given seed gives the same results at any frame rate.
// Used by the dev spike and by the game with ?debug=1&auto=1.
import { CONFIG } from "./config.js";
import { CANNON, inChuteXZ } from "./physics.js";
import { PHIS } from "./claw-shape.js";
import { ringWorld } from "./hook.js";
import { clamp, randRange } from "./util.js";

const R = CONFIG.claw.range;
const SETTLE = 2.0; // let the pile rest before aiming
const POST = 0.6; // prizes still falling after the round count for it
const TIMEOUT = 40;
const HOOK_R = 0.6; // hook mode: the chosen finger tip crosses the ring this far from the claw axis
const HOOK_DROP = 1.8; // hook mode: close mid-air once the hub is this high above the ring centre

export const REASON_LABEL = {
  empty: "空爪",
  tipsAbove: "爪尖沒伸到下方",
  noGrip: "沒抓住",
  weakSlip: "抓不牢滑落",
  slipAscend: "上升途中滑落",
  slipTop: "到頂震落",
  slipReturn: "回程滑落",
  released: "送到出貨口",
  held: "抓住",
  timeout: "逾時",
};

// Wilson score interval for k successes in n trials.
export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 0];
  const p = k / n;
  const z2 = z * z;
  const den = 1 + z2 / n;
  const c = (p + z2 / (2 * n)) / den;
  const h = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

const r3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000);

export function createAutoTest({ claw, plushes, rng, runs = 30, mode = "aim", err = 0.7, waitSwing = true, prepare, start }) {
  const records = [];
  let phase = "prep";
  let t = 0;
  let aim = null;
  let cur = null;
  let ended = false;
  let stray = 0;
  const _c = new CANNON.Vec3();
  const _n = new CANNON.Vec3();
  // Like a player, give up on a plush after two drops that missed it or only brushed its top (e.g. pinned by the hole guard).
  const misses = new WeakMap();

  claw.on("roundEnd", () => {
    ended = true;
  });

  const reachable = (p) => {
    if (p.state !== "free" || (misses.get(p) || 0) >= 2) return false;
    const b = p.body.position;
    return Math.abs(b.x) < R + 0.3 && Math.abs(b.z) < R + 0.3 && !inChuteXZ(b.x, b.z, 0.3);
  };

  function chooseAim() {
    if (mode === "hook") {
      const cands = plushes.list.filter((p) => p.tag && reachable(p));
      if (cands.length) return hookAim(cands[Math.floor(rng() * cands.length)]);
    }
    if (mode !== "uniform") {
      const cands = plushes.list.filter(reachable);
      if (cands.length) {
        const p = cands[Math.floor(rng() * cands.length)];
        plushes.sphereWorld(p, p.core, _c);
        const a = rng() * Math.PI * 2;
        const r = err * Math.sqrt(rng());
        return { x: clamp(_c.x + Math.cos(a) * r, -R, R), z: clamp(_c.z + Math.sin(a) * r, -R, R), target: p };
      }
    }
    for (;;) {
      const x = randRange(rng, -R, R);
      const z = randRange(rng, -R, R);
      if (!inChuteXZ(x, z, 0.5)) return { x, z, target: null };
    }
  }

  // Put the claw so that the finger facing the ring most squarely closes through the ring centre.
  function hookAim(p) {
    ringWorld(p, _c, _n);
    let best = null, bestS = -Infinity;
    for (const phi of PHIS) {
      const dx = Math.cos(phi), dz = Math.sin(phi);
      const x = _c.x - dx * HOOK_R, z = _c.z - dz * HOOK_R;
      let s = Math.abs(dx * _n.x + dz * _n.z);
      if (Math.abs(x) > R || Math.abs(z) > R) s -= 1;
      if (s > bestS) [best, bestS] = [{ x, z }, s];
    }
    return { x: clamp(best.x, -R, R), z: clamp(best.z, -R, R), target: p, hook: true };
  }

  function record(reason) {
    const r = claw.result || {};
    const hookWin = (p) => r.hook && p === r.hook.plush && r.hook.outcome === "hookReleased";
    const modeled = cur.won.filter((p) => (p === r.plush && r.reason === "released") || hookWin(p)).length;
    const why = reason || r.reason;
    if (aim.target && !r.hook && (why === "empty" || why === "tipsAbove")) misses.set(aim.target, (misses.get(aim.target) || 0) + 1);
    records.push({
      i: records.length + 1,
      power: r3(cur.power),
      aimAt: aim.target ? aim.target.name : "隨機點",
      plush: r.plush ? r.plush.name : null,
      reason: why,
      n: r.n,
      offN: r3(r.offN),
      sizeN: r3(r.sizeN),
      depth: r3(r.depth),
      pGrip: r3(r.pGrip),
      gap: r3(r.gap),
      squeeze: r3(r.squeeze),
      at: r.at ? [r3(r.at.x), r3(r.at.y), r3(r.at.z)] : null, // hub position when the fingers closed
      won: cur.won.map((p) => p.name),
      other: cur.won.length - modeled,
      hook: r.hook ? r.hook.outcome : null,
      hookWon: !!r.hook && cur.won.includes(r.hook.plush),
      midAir: !!r.midAir,
      swing: r3(r.swingAtDrop),
    });
    cur = null;
  }

  function step(dt) {
    if (records.length >= runs) return;
    t += dt;
    switch (phase) {
      case "prep":
        if (claw.state !== "idle") break;
        prepare?.();
        phase = "settle";
        t = 0;
        break;
      case "settle":
        if (t < SETTLE) break;
        aim = chooseAim();
        ended = false;
        if (!start()) break;
        cur = { power: claw.power, won: [] };
        phase = "drive";
        t = 0;
        break;
      case "drive": {
        const dx = aim.x - claw.trolley.x;
        const dz = aim.z - claw.trolley.z;
        claw.setInput(clamp(dx / 0.3, -1, 1), clamp(dz / 0.3, -1, 1));
        const still = Math.hypot(claw.vel.x, claw.vel.z) < 0.05 && (!waitSwing || claw.swingAmp() < CONFIG.claw.swing.settle);
        if ((Math.hypot(dx, dz) < 0.02 && still) || t > CONFIG.round.seconds || claw.state !== "move") {
          claw.setInput(0, 0);
          claw.drop();
          phase = "busy";
          t = 0;
        }
        break;
      }
      case "busy":
        if (aim.hook && claw.state === "descend" && aim.target.state === "free" && claw.pos.y - HOOK_DROP <= ringWorld(aim.target, _c).y) claw.drop();
        if (ended) {
          phase = "post";
          t = 0;
        } else if (t > TIMEOUT) {
          record("timeout");
          phase = "prep";
        }
        break;
      case "post":
        if (t < POST) break;
        record();
        phase = "prep";
        break;
    }
  }

  function onWin(p) {
    if (cur) cur.won.push(p);
    else stray++;
  }

  function summary() {
    const n = records.length;
    const wins = records.filter((r) => r.won.length > 0).length;
    const reasons = {};
    for (const r of records) reasons[r.reason] = (reasons[r.reason] || 0) + 1;
    const gaps = records.map((r) => r.gap).filter((g) => g != null);
    return {
      runs: n,
      planned: runs,
      done: n >= runs,
      wins,
      rate: n ? wins / n : 0,
      ci95: wilson(wins, n),
      reasons,
      otherWins: records.reduce((s, r) => s + r.other, 0),
      strayWins: stray,
      hooks: records.filter((r) => r.hook).length,
      hookWins: records.filter((r) => r.hookWon).length,
      worstGap: gaps.length ? Math.min(...gaps) : null,
      records,
    };
  }

  return {
    step,
    onWin,
    summary,
    get done() {
      return records.length >= runs;
    },
  };
}

export function formatSummary(s) {
  const pct = (v) => (v * 100).toFixed(1) + "%";
  const lines = [
    `第 ${s.runs}/${s.planned} 次，夾中 ${s.wins} 次（${pct(s.rate)}）`,
    `95% 信賴區間 ${pct(s.ci95[0])} ～ ${pct(s.ci95[1])}`,
    "結果：" + Object.entries(s.reasons).map(([k, v]) => `${REASON_LABEL[k] || k} ${v}`).join("、"),
  ];
  if (s.hooks) lines.push(`勾到吊牌 ${s.hooks} 次，勾中送進洞 ${s.hookWins} 次`);
  if (s.otherWins || s.strayWins) lines.push(`非抓取模型的夾中 ${s.otherWins}，局外掉落 ${s.strayWins}`);
  return lines;
}

// Claw grab spike: cabinet colliders, the claw and a few plush, plus the replayable auto test.
// ?debug=1 runs the test. Other params: n, runs, mode=aim|uniform|hook, err, speed, fast=1, seed, cols=1, wait=0, set.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createWorld, addMachineColliders, machineColliders, createStepper, inChuteXZ } from "../js/physics.js";
import { CONFIG } from "../js/config.js";
import { createPlushManager } from "../js/plush.js";
import { createClaw } from "../js/claw.js";
import { createAutoTest, formatSummary } from "../js/autotest.js";
import { mulberry32, randRange, params, numParam } from "../js/util.js";

const P = CONFIG.physics;
const G = CONFIG.grab;
const DEBUG = params.get("debug") === "1";
const N = numParam("n", 10);
const RUNS = numParam("runs", 30);
const MODE = ["uniform", "hook"].includes(params.get("mode")) ? params.get("mode") : "aim";
const ERR = numParam("err", 0.7);
const SPEED = Math.max(1, Math.round(numParam("speed", 1)));
const FAST = params.get("fast") === "1";
const SEED = numParam("seed", Math.floor(Math.random() * 1e9));
const COLS = params.get("cols") === "1";

const panel = document.getElementById("panel");
addEventListener("error", (e) => {
  panel.textContent += `\n錯誤：${e.message}`;
});

// ?set=claw.squish:0.2,grab.slipBase:0.065 overrides tuning values for parameter sweeps.
const SET = params.get("set") || "";
for (const kv of SET.split(",").filter(Boolean)) {
  const [path, raw] = kv.split(":");
  const keys = path.split(".");
  const last = keys.pop();
  const obj = keys.reduce((o, k) => o?.[k], CONFIG);
  const v = Number(raw);
  if (!obj || !(last in obj) || !Number.isFinite(v)) throw new Error(`無效的覆寫參數 ${kv}`);
  obj[last] = v;
}
const rng = mulberry32(SEED);

// ---- renderer, camera, lights
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2027);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 14, 22);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 11, 0);
controls.enableDamping = true;
controls.update();

scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4050, 1.3));
const key = new THREE.DirectionalLight(0xffffff, 2.4);
key.position.set(6, 26, 12);
key.target.position.set(0, 9, 0);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 50 });
key.shadow.camera.updateProjectionMatrix();
key.shadow.bias = -0.0005;
key.shadow.normalBias = 0.02;
scene.add(key, key.target);

// Debug view of the exact physics boxes.
for (const b of machineColliders()) {
  const solid = b.name.startsWith("floor") || b.name === "ramp" || b.name.startsWith("slope");
  const mat = new THREE.MeshStandardMaterial({
    color: solid ? 0x8c7058 : 0x8fb4d8,
    transparent: !solid,
    opacity: solid ? 1 : b.name === "wallF" ? 0.08 : 0.15,
    depthWrite: solid,
  });
  const m = new THREE.Mesh(new THREE.BoxGeometry(b.h[0] * 2, b.h[1] * 2, b.h[2] * 2), mat);
  m.position.set(...b.c);
  m.rotation.x = b.rotX;
  m.rotation.z = b.rotZ || 0;
  m.receiveShadow = solid;
  scene.add(m);
}

// ---- physics, plush, claw
const { world, mats } = createWorld();
addMachineColliders(world, mats);
const plushes = createPlushManager({ world, scene, mats, rng });
const claw = createClaw({ world, scene, mats, plushes, rng });
window.__spike = { world, plushes, claw, camera, controls };

const wire = new THREE.MeshBasicMaterial({ color: 0x33ff99, wireframe: true });
function spawnOne() {
  for (let i = 0; i < 40; i++) {
    const c = { x: randRange(rng, -3.8, 3.8), y: randRange(rng, 11, 14), z: randRange(rng, -3.8, 3.8) };
    if (inChuteXZ(c.x, c.z, 1.0)) continue;
    if (plushes.list.some(({ body: { position: b } }) => Math.hypot(b.x - c.x, b.y - c.y, b.z - c.z) < 1.7)) continue;
    const p = plushes.spawn(c);
    if (COLS) {
      for (const [x, y, z, r] of p.sp.spheres) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), wire);
        m.position.set(x, y, z);
        p.mesh.add(m);
      }
    }
    return p;
  }
  return null;
}
const topUp = () => {
  for (let k = N - plushes.activeCount(); k > 0; k--) spawnOne();
};
topUp();

const auto = DEBUG
  ? createAutoTest({
      claw,
      plushes,
      rng,
      runs: RUNS,
      mode: MODE,
      err: ERR,
      waitSwing: params.get("wait") !== "0",
      prepare: topUp,
      start: () => claw.startRound(randRange(rng, G.powerMin, G.powerMax)),
    })
  : null;

// ---- manual control
const keys = new Set();
addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
  if (auto) return;
  if (e.code === "Space") claw.drop();
  if (e.code === "KeyR") claw.startRound(randRange(rng, G.powerMin, G.powerMax));
});
addEventListener("keyup", (e) => keys.delete(e.code));
const axis = (neg, pos) => (pos.some((k) => keys.has(k)) ? 1 : 0) - (neg.some((k) => keys.has(k)) ? 1 : 0);
if (!auto) claw.on("roundEnd", topUp);

// ---- simulation step
let simTime = 0;
let stepMs = 0;
let steps = 0;
const onPlush = { win: (p) => auto?.onWin(p) };
function tick(dt) {
  if (auto) auto.step(dt);
  else claw.setInput(axis(["ArrowLeft", "KeyA"], ["ArrowRight", "KeyD"]), axis(["ArrowUp", "KeyW"], ["ArrowDown", "KeyS"]));
  claw.preStep(dt);
  const t0 = performance.now();
  world.step(dt);
  stepMs += performance.now() - t0;
  steps++;
  claw.postStep(dt);
  simTime += dt;
  plushes.update(simTime, onPlush);
}

// ---- report
const gl = renderer.getContext();
const dbgInfo = gl.getExtension("WEBGL_debug_renderer_info");
const GPU = dbgInfo ? gl.getParameter(dbgInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
let fpsFrames = 0;
let fpsTime = 0;

function report() {
  return {
    engine: "cannon-es 0.20.0",
    seed: SEED,
    set: SET,
    mode: MODE,
    err: ERR,
    plush: N,
    speed: SPEED,
    fast: FAST,
    fps: FAST || !fpsTime ? null : Math.round((fpsFrames / fpsTime) * 10) / 10,
    stepMs: steps ? Math.round((stepMs / steps) * 1000) / 1000 : 0,
    simSeconds: Math.round(simTime),
    escaped: plushes.stats.escaped,
    maxSpeed: Math.round(plushes.stats.maxSpeed * 10) / 10,
    gpu: GPU,
    ...(auto ? auto.summary() : {}),
  };
}

function updatePanel() {
  const r = report();
  window.__spikeReport = r;
  const lines = [`爪子抓取 Spike（${r.engine}）`, `模式 ${MODE}，瞄準誤差 ${ERR}，玩偶 ${N}，倍速 ${SPEED}，種子 ${SEED}`];
  if (SET) lines.push(`覆寫參數 ${SET}`);
  if (auto) lines.push(...formatSummary(r));
  else lines.push(`手動模式，爪子狀態 ${claw.state}，擺幅 ${claw.swingAmp().toFixed(2)}` + (claw.hooked ? `，勾住 ${claw.hooked.name}` : ""));
  lines.push(
    `平均 FPS ${r.fps ?? (FAST ? "（快轉模式不計）" : "（自動測試時計算）")}，物理每步 ${r.stepMs} ms，模擬 ${r.simSeconds} 秒`,
    `最大速度 ${r.maxSpeed}，逃脫 ${r.escaped}` + (r.worstGap != null ? `，最差間隙 ${r.worstGap}` : ""),
    `GPU：${GPU}`,
  );
  if (r.done) lines.push("測試完成");
  panel.textContent = lines.join("\n");
}

// ---- loops
const timer = new THREE.Timer();
const stepper = createStepper(P.step, P.maxSubSteps * SPEED, tick);
let panelT = 0;

function frame(t) {
  requestAnimationFrame(frame);
  timer.update(t);
  const raw = timer.getDelta();
  const dt = Math.max(0, Math.min(raw, 0.1));
  const alpha = stepper(dt * SPEED);
  if (auto && !auto.done && simTime > 1) {
    fpsFrames++;
    fpsTime += raw;
  }
  plushes.sync(alpha);
  claw.syncVisual(alpha);
  controls.update(dt);
  renderer.render(scene, camera);
  panelT += dt;
  if (panelT > 0.25) {
    panelT = 0;
    updatePanel();
  }
}

// Fast mode: no frame pacing, the simulation runs in 40 ms slices between renders.
function fastLoop() {
  const ch = new MessageChannel();
  ch.port1.onmessage = () => {
    const end = performance.now() + 40;
    while (performance.now() < end && !auto.done) tick(P.step);
    plushes.sync(1);
    claw.syncVisual(1);
    renderer.render(scene, camera);
    updatePanel();
    if (!auto.done) ch.port2.postMessage(0);
    else requestAnimationFrame(frame);
  };
  ch.port2.postMessage(0);
}

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

updatePanel();
if (FAST && auto) fastLoop();
else requestAnimationFrame(frame);

// Entry point: the shop, the cabinet, physics, claw, game rules, walking camera, sound and HUD, then the loop.
// ?debug=1 shortens restocks and shows a status line.
// ?debug=1&auto=1 runs the auto grab test. Other params: n, runs, mode=aim|uniform|hook, err, speed, fast=1, seed, wait=0, set.
import * as THREE from "three";
import { CONFIG } from "./config.js";
import { createWorld, addMachineColliders, createStepper } from "./physics.js";
import { createVenue } from "./venue.js";
import { createMachine } from "./machine.js";
import { createPlushManager } from "./plush.js";
import { createClaw } from "./claw.js";
import { createAudio } from "./audio.js";
import { createUI } from "./ui.js";
import { createGame } from "./game.js";
import { createRestock } from "./restock.js";
import { createWalker } from "./walker.js";
import { createAutoTest, formatSummary } from "./autotest.js";
import { clamp, mulberry32, randRange, params, numParam } from "./util.js";

const P = CONFIG.physics;
const G = CONFIG.grab;
const DEBUG = params.get("debug") === "1";
const AUTO = DEBUG && params.get("auto") === "1";
const N = numParam("n", 20);
const RUNS = numParam("runs", 30);
const MODE = ["uniform", "hook"].includes(params.get("mode")) ? params.get("mode") : "aim";
const ERR = numParam("err", 0.7);
const SPEED = AUTO ? Math.max(1, Math.round(numParam("speed", 1))) : 1;
const FAST = AUTO && params.get("fast") === "1";
const SEED = numParam("seed", Math.floor(Math.random() * 1e9));

function fatal(msg) {
  window.__clawFatal = true;
  const boot = document.getElementById("boot");
  boot.classList.add("error");
  boot.textContent = msg;
}

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
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (err) {
  fatal("這個瀏覽器無法使用 WebGL 2，所以畫不出 3D 畫面。請改用最新版 Chrome、Edge、Firefox 或 Safari，並確認瀏覽器設定裡的「硬體加速」已開啟。");
  throw err;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById("stage").appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1024);
scene.fog = new THREE.Fog(0x1a1024, 45, 110);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);

scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4050, 1.3));
const key = new THREE.DirectionalLight(0xffffff, 2.4);
key.position.set(6, 26, 12);
key.target.position.set(0, 9, 0);
key.castShadow = true; // the only shadow casting light
key.shadow.mapSize.set(1024, 1024);
Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 50 });
key.shadow.camera.updateProjectionMatrix();
key.shadow.bias = -0.0005;
key.shadow.normalBias = 0.02;
scene.add(key, key.target);
// Neon tint from the shop, no shadows.
const pink = new THREE.PointLight(0xff4fd8, 0.6, 70, 0);
pink.position.set(-22, 24, 14);
const cyan = new THREE.PointLight(0x45f0ff, 0.5, 70, 0);
cyan.position.set(22, 24, -14);
scene.add(pink, cyan);

// Portrait screens widen the vertical field of view so the cabinet keeps its width in view.
function resize() {
  const aspect = innerWidth / innerHeight;
  camera.aspect = aspect;
  camera.fov = aspect >= 1 ? 50 : clamp(THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(23)) / aspect)), 50, 85);
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener("resize", resize);
resize();

// ---- world
createVenue({ scene, rng });
const machine = createMachine({ scene });
const { world, mats } = createWorld();
addMachineColliders(world, mats);
const plushes = createPlushManager({ world, scene, mats, rng });
const claw = createClaw({ world, scene, mats, plushes, rng });
const audio = await createAudio();

const ui = createUI({
  onCoin: () => game.insertCoin(coinFrom()),
  onExchange: () => game.exchange(),
  onStart: () => game.start(),
  onDrop: () => game.drop(),
  onView: (v) => walker.setView(v),
  onMute: () => audio.setMuted(!audio.muted),
  onGesture: () => audio.unlock(),
});
const game = createGame({ claw, machine, audio, ui, rng });
ui.setPrizes(game.prizes);

const restock = createRestock({
  plushes,
  claw,
  rng,
  debug: DEBUG,
  onBatch: (items) => {
    const names = items.map((it) => it.name + (it.rarity.id === "common" ? "" : `（${it.rarity.label}）`));
    ui.toast(`補貨囉！新來了 ${names.join("、")}`, 3500);
    machine.flash();
    audio.play("restock");
  },
});
restock.fill(AUTO ? N : undefined);

// ---- coin slot: a short tap or click on it inserts a coin
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function hitSlot(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  if (!raycaster.intersectObject(machine.coinTarget, false).length) return false;
  // Seen from behind the cabinet the slot is hidden: the nearest hit must be the slot itself.
  return raycaster.intersectObject(machine.root, true)[0]?.object === machine.coinTarget;
}
const _from = new THREE.Vector3();
// The coin starts near the player's hand, between the eyes and the slot and a little lower.
const coinFrom = () => _from.copy(camera.position).lerp(machine.slotPos, 0.35).setY(_from.y - 1.2);

const walker = createWalker({
  camera,
  dom: renderer.domElement,
  onFootstep: () => audio.play("step", 0.8, randRange(Math.random, 0.9, 1.1)),
  onTap: (x, y) => {
    if (hitSlot(x, y)) game.insertCoin(coinFrom());
  },
});
// Runs after resize(), which was registered first and has already updated the camera.
const fitReach = () => walker.setReach(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
addEventListener("resize", fitReach);
fitReach();
renderer.domElement.addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse" || e.buttons) return;
  renderer.domElement.style.cursor = hitSlot(e.clientX, e.clientY) ? "pointer" : "";
});

// ---- auto test (debug only)
const auto = AUTO
  ? createAutoTest({
      claw,
      plushes,
      rng,
      runs: RUNS,
      mode: MODE,
      err: ERR,
      waitSwing: params.get("wait") !== "0",
      prepare: () => restock.fill(N - plushes.activeCount()),
      start: () => claw.startRound(randRange(rng, G.powerMin, G.powerMax)),
    })
  : null;

// ---- simulation step
let simTime = 0;
let stepMs = 0;
let steps = 0;
const onPlush = { win: (p) => (auto ? auto.onWin(p) : game.onWin(p)) };
function tick(dt) {
  if (auto) auto.step(dt);
  else {
    const a = ui.axis();
    game.input(a.x, a.z);
  }
  claw.preStep(dt);
  const t0 = performance.now();
  world.step(dt);
  stepMs += performance.now() - t0;
  steps++;
  claw.postStep(dt);
  simTime += dt;
  plushes.update(simTime, onPlush);
  if (!auto) {
    game.update(dt);
    restock.update(dt);
  }
}

// ---- debug read-out
const gl = renderer.getContext();
const dbgInfo = gl.getExtension("WEBGL_debug_renderer_info");
const GPU = dbgInfo ? gl.getParameter(dbgInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
let fpsFrames = 0;
let fpsTime = 0;
let winFrames = 0;
let winTime = 0;
let liveFps = 0;

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
    gpu: GPU,
    ...auto.summary(),
  };
}

function updateDebug() {
  if (auto) {
    const r = report();
    window.__clawReport = r;
    const lines = [`自動測試（${r.engine}），模式 ${MODE}，瞄準誤差 ${ERR}，玩偶 ${N}，倍速 ${SPEED}，種子 ${SEED}`];
    if (SET) lines.push(`覆寫參數 ${SET}`);
    lines.push(...formatSummary(r));
    lines.push(`平均 FPS ${r.fps ?? (FAST ? "（快轉模式不計）" : "計算中")}，物理每步 ${r.stepMs} ms，模擬 ${r.simSeconds} 秒，逃脫 ${r.escaped}`);
    if (r.done) lines.push("測試完成");
    ui.debug(lines.join("\n"));
  } else {
    const power = claw.state === "idle" ? "" : `，爪力 ${claw.power.toFixed(2)}`;
    ui.debug(`FPS ${liveFps}，玩偶 ${plushes.activeCount()} 隻，下次補貨 ${Math.ceil(restock.next)} 秒，爪子 ${claw.state}${power}`);
  }
}

// ---- per frame
const C = CONFIG.claw;
function draw(dt, alpha) {
  plushes.sync(alpha);
  claw.syncVisual(alpha);
  walker.update(dt);
  const a = auto ? { x: clamp(claw.vel.x / C.moveSpeed, -1, 1), z: clamp(claw.vel.z / C.moveSpeed, -1, 1) } : ui.axis();
  machine.update(dt, { credits: game.credits, seconds: game.timeLeft, ix: a.x, iz: a.z, trolleyZ: claw.trolley.z });
  audio.motor(claw.motorOn());
  ui.render({
    wallet: game.wallet,
    credits: game.credits,
    seconds: game.timeLeft,
    hint: walker.hint(),
    prizes: game.prizes.length,
    muted: audio.muted,
  });
  renderer.render(scene, camera);
}

const timer = new THREE.Timer();
const stepper = createStepper(P.step, P.maxSubSteps * SPEED, tick);
let debugT = 0;

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
  winFrames++;
  winTime += raw;
  if (winTime >= 1) {
    liveFps = Math.round(winFrames / winTime);
    winFrames = winTime = 0;
  }
  draw(dt, alpha);
  debugT += dt;
  if (DEBUG && debugT > 0.25) {
    debugT = 0;
    updateDebug();
  }
}

// Fast mode: no frame pacing, the simulation runs in 40 ms slices between renders.
function fastLoop() {
  const ch = new MessageChannel();
  ch.port1.onmessage = () => {
    const end = performance.now() + 40;
    while (performance.now() < end && !auto.done) tick(P.step);
    draw(0.04, 1);
    updateDebug();
    if (!auto.done) ch.port2.postMessage(0);
    else requestAnimationFrame(frame);
  };
  ch.port2.postMessage(0);
}

// Debug: run the game for `sec` seconds of frames without requestAnimationFrame (hidden or background tabs).
function advance(sec, fps = 30) {
  for (let t = 0; t < sec; t += 1 / fps) draw(1 / fps, stepper(1 / fps));
  updateDebug();
}

if (DEBUG) window.__claw = { game, claw, plushes, restock, walker, world, camera, ui, audio, machine, advance };
draw(0, 1); // the first picture is right even before the first animation frame
document.getElementById("boot")?.remove();
window.__clawReady = true;
if (!AUTO) {
  const touch = document.body.classList.contains("touch");
  ui.toast(touch ? "點機台右前方的「投幣」口投幣，再推搖桿開始" : "點機台右前方的「投幣」口（或按 C）投幣，再用方向鍵開始", 5000);
}
if (FAST) fastLoop();
else requestAnimationFrame(frame);

// HUD: keyboard, on-screen joystick and buttons, status text, toasts, prize popup and panels.
import confetti from "canvas-confetti";

const $ = (id) => document.getElementById(id);
const VIEW_KEYS = { Digit1: "front", Digit2: "left", Digit3: "right", Digit4: "top" };
const RARITY_CLASS = { common: "r-common", rare: "r-rare", limited: "r-limited" };

export function createUI({ onCoin, onExchange, onStart, onDrop, onView, onMute, onGesture }) {
  const el = {
    wallet: $("wallet"),
    credits: $("credits"),
    timer: $("timer"),
    toast: $("toast"),
    hint: $("hint"),
    mute: $("btn-mute"),
    prizeCount: $("prize-count"),
    win: $("win-pop"),
    winName: $("win-name"),
    winRarity: $("win-rarity"),
    prizeList: $("prize-list"),
    debug: $("debug"),
    joy: $("joystick"),
    knob: $("knob"),
  };

  // ---- first gesture unlocks audio; touch devices get the joystick
  const setTouch = () => document.body.classList.add("touch");
  if (matchMedia("(pointer: coarse)").matches) setTouch();
  addEventListener("touchstart", setTouch, { once: true, passive: true });
  addEventListener("pointerdown", () => onGesture?.(), { capture: true });
  addEventListener("keydown", () => onGesture?.(), { capture: true });

  // ---- keyboard
  const keys = new Set();
  addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === "Escape") return closeSheets();
    if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
    keys.add(e.code);
    if (e.repeat) return;
    if (e.code === "Space") onDrop();
    else if (e.code === "KeyC") onCoin();
    else if (VIEW_KEYS[e.code]) onView(VIEW_KEYS[e.code]);
  });
  addEventListener("keyup", (e) => keys.delete(e.code));
  addEventListener("blur", () => keys.clear());
  const key = (...codes) => (codes.some((c) => keys.has(c)) ? 1 : 0);

  // ---- on-screen joystick
  const stick = { x: 0, z: 0, id: null };
  function moveKnob(e) {
    const r = el.joy.getBoundingClientRect();
    const R = r.width / 2;
    let dx = (e.clientX - (r.left + R)) / R, dy = (e.clientY - (r.top + R)) / R;
    const m = Math.hypot(dx, dy);
    if (m > 1) {
      dx /= m;
      dy /= m;
    }
    el.knob.style.transform = `translate(${dx * R * 0.55}px, ${dy * R * 0.55}px)`;
    const dead = m < 0.2;
    stick.x = dead ? 0 : dx;
    stick.z = dead ? 0 : dy;
  }
  el.joy.addEventListener("pointerdown", (e) => {
    stick.id = e.pointerId;
    el.joy.setPointerCapture(e.pointerId);
    moveKnob(e);
  });
  el.joy.addEventListener("pointermove", (e) => e.pointerId === stick.id && moveKnob(e));
  const release = (e) => {
    if (e.pointerId !== stick.id) return;
    stick.id = null;
    stick.x = stick.z = 0;
    el.knob.style.transform = "";
  };
  el.joy.addEventListener("pointerup", release);
  el.joy.addEventListener("pointercancel", release);

  // Joystick or keys, whichever is pushed further. +z points towards the player at the front.
  function axis() {
    const kx = key("ArrowRight", "KeyD") - key("ArrowLeft", "KeyA");
    const kz = key("ArrowDown", "KeyS") - key("ArrowUp", "KeyW");
    return {
      x: Math.abs(stick.x) > Math.abs(kx) ? stick.x : kx,
      z: Math.abs(stick.z) > Math.abs(kz) ? stick.z : kz,
    };
  }

  // ---- buttons
  const tap = (id, fn, ev = "click") =>
    $(id).addEventListener(ev, (e) => {
      e.preventDefault();
      fn();
      $(id).blur();
    });
  tap("btn-start", onStart, "pointerdown");
  tap("btn-drop", onDrop, "pointerdown");
  tap("btn-exchange", onExchange);
  tap("btn-mute", onMute);
  tap("btn-prizes", () => openSheet("sheet-prizes"));
  tap("btn-tips", () => openSheet("sheet-tips"));
  for (const b of document.querySelectorAll("[data-view]")) tap(b.id, () => onView(b.dataset.view));
  for (const b of document.querySelectorAll("[data-close]")) b.addEventListener("click", closeSheets);

  function openSheet(id) {
    closeSheets();
    if (id === "sheet-prizes") renderPrizes();
    $(id).hidden = false;
  }
  function closeSheets() {
    for (const s of document.querySelectorAll(".sheet")) s.hidden = true;
  }

  // ---- status text, rewritten only when it changes
  const shown = {};
  function text(node, name, value) {
    if (shown[name] === value) return;
    shown[name] = value;
    node.textContent = value;
  }
  function render(s) {
    text(el.wallet, "wallet", String(s.wallet));
    text(el.credits, "credits", String(s.credits));
    text(el.timer, "timer", s.seconds == null ? "--" : `${Math.ceil(s.seconds)} 秒`);
    text(el.hint, "hint", s.hint);
    el.hint.hidden = !s.hint;
    text(el.prizeCount, "prizes", String(s.prizes));
    text(el.mute, "mute", s.muted ? "取消靜音" : "靜音");
    document.body.classList.toggle("low-time", s.seconds != null && s.seconds <= 5);
  }

  let toastTimer = 0;
  function toast(msg, ms = 2200) {
    el.toast.textContent = msg;
    el.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove("show"), ms);
  }

  let prizes = [];
  let winTimer = 0;
  function win(p, list) {
    prizes = list;
    el.winName.textContent = `夾到了：${p.name}`;
    el.winRarity.textContent = p.rarity.label;
    el.winRarity.className = `badge ${RARITY_CLASS[p.rarity.id] || ""}`;
    el.win.hidden = false;
    el.win.classList.remove("pop");
    void el.win.offsetWidth; // restart the pop animation
    el.win.classList.add("pop");
    clearTimeout(winTimer);
    winTimer = setTimeout(() => (el.win.hidden = true), 2500);
    const big = p.rarity.id !== "common";
    const base = { zIndex: 40, disableForReducedMotion: true, spread: 75, particleCount: big ? 160 : 100 };
    confetti({ ...base, origin: { x: 0.5, y: 0.55 } });
    if (big) {
      confetti({ ...base, angle: 60, origin: { x: 0, y: 0.8 } });
      confetti({ ...base, angle: 120, origin: { x: 1, y: 0.8 } });
    }
  }

  function setPrizes(list) {
    prizes = list;
  }

  // Newest first, same plush counted together.
  function renderPrizes() {
    el.prizeList.textContent = "";
    if (!prizes.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "還沒有戰利品，投幣試試看！";
      el.prizeList.append(li);
      return;
    }
    const groups = new Map();
    for (let i = prizes.length - 1; i >= 0; i--) {
      const p = prizes[i];
      const g = groups.get(p.name);
      if (g) g.n++;
      else groups.set(p.name, { ...p, n: 1 });
    }
    for (const g of groups.values()) {
      const li = document.createElement("li");
      const badge = document.createElement("span");
      badge.className = `badge ${RARITY_CLASS[g.rarity] || ""}`;
      badge.textContent = g.label;
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = g.name;
      const n = document.createElement("span");
      n.className = "count";
      n.textContent = `× ${g.n}`;
      li.append(badge, name, n);
      el.prizeList.append(li);
    }
  }

  function debug(msg) {
    el.debug.hidden = false;
    el.debug.textContent = msg;
  }

  return { axis, render, toast, win, setPrizes, debug };
}

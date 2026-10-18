// All sounds are synthesised with ZzFX. The AudioContext is created on the first user gesture.
// ZzFX builds a context as soon as it is imported, so the constructor is stubbed during the import.
const SOUNDS = {
  // volume, randomness, frequency, attack, sustain, release, shape, shapeCurve, slide, deltaSlide,
  // pitchJump, pitchJumpTime, repeatTime, noise, modulation, bitCrush, delay, sustainVolume, decay, tremolo, filter
  coin: [1.1, 0.05, 1500, 0, 0.04, 0.25, 1, 1.6, 0, 0, 700, 0.05],
  motor: [0.22, 0, 70, 0, 0.6, 0, 2, 1, 0, 0, 0, 0, 0, 0.15, 0, 0, 0, 1, 0, 0.12],
  drop: [0.5, 0.05, 420, 0.01, 0.12, 0.25, 1, 1, -3],
  close: [0.9, 0.05, 160, 0, 0.03, 0.1, 4, 1, 0, 0, 0, 0, 0, 1.6],
  win: [1, 0, 523, 0.02, 0.32, 0.45, 1, 1.4, 0, 0, 262, 0.08, 0.16, 0, 0, 0, 0, 0.9, 0.05],
  miss: [0.7, 0.04, 330, 0.02, 0.18, 0.35, 2, 1, -2.5, 0, 0, 0, 0, 0, 0, 0, 0, 0.6],
  restock: [0.8, 0, 880, 0.01, 0.08, 0.45, 0, 1, 0, 0, 440, 0.09],
  bump: [0.7, 0.1, 95, 0, 0.02, 0.12, 0, 1, -6, 0, 0, 0, 0, 0.5],
  hook: [0.6, 0.05, 1700, 0, 0.01, 0.09, 3, 1, 0, 0, 650, 0.03],
  step: [0.3, 0.2, 75, 0, 0.01, 0.06, 4, 1, 0, 0, 0, 0, 0, 1.2],
  deny: [0.45, 0, 150, 0, 0.1, 0.08, 5, 1],
};
const MUTE_KEY = "clawMuted.v1";

async function loadZzfx() {
  const Native = globalThis.AudioContext;
  globalThis.AudioContext = class {};
  try {
    const zz = await import("zzfx");
    zz.ZZFX.audioContext = null;
    return zz;
  } finally {
    globalThis.AudioContext = Native;
  }
}

export async function createAudio() {
  let zz = null;
  try {
    zz = await loadZzfx();
  } catch (err) {
    console.error("音效模組載入失敗，遊戲改為靜音", err);
  }
  const sounds = {};
  if (zz) for (const [name, p] of Object.entries(SOUNDS)) sounds[name] = new zz.ZZFXSound([...p]);

  let ac = null;
  let muted = false;
  try {
    muted = localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    // storage blocked: keep the default
  }
  let motorSrc = null;

  function unlock() {
    if (!zz || !globalThis.AudioContext) return;
    if (!ac) ac = new AudioContext();
    if (ac.state === "suspended") ac.resume();
    zz.ZZFX.audioContext = ac;
  }

  function play(name, volume = 1, pitch = 1) {
    if (muted || !ac || !sounds[name]) return;
    sounds[name].play(volume, pitch);
  }

  function motor(on) {
    if (on && !motorSrc && !muted && ac && sounds.motor) motorSrc = sounds.motor.play(1, 1, 0, 0, true);
    else if ((!on || muted) && motorSrc) {
      motorSrc.stop();
      motorSrc = null;
    }
  }

  function setMuted(m) {
    muted = m;
    if (m) motor(false);
    try {
      localStorage.setItem(MUTE_KEY, m ? "1" : "0");
    } catch {
      // storage blocked: the choice lasts for this visit only
    }
  }

  return { unlock, play, motor, setMuted, get muted() { return muted; }, get available() { return !!zz; } };
}

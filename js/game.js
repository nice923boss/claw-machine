// Game rules: virtual wallet, credits, the 30 second round, prizes. No real money anywhere.
import { CONFIG } from "./config.js";
import { randRange } from "./util.js";

const W = CONFIG.wallet;
const G = CONFIG.grab;
const PRIZE_KEY = "clawPrizes.v1";
const MISS_DELAY = 0.8; // a prize can still drop just after the claw opens

function loadPrizes() {
  try {
    const v = JSON.parse(localStorage.getItem(PRIZE_KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function createGame({ claw, machine, audio, ui, rng }) {
  let wallet = W.start;
  let credits = 0;
  let inFlight = 0; // coins on their way into the slot
  let timeLeft = null; // seconds left to aim, null outside the aiming phase
  let roundOn = false;
  let wonThisRound = false;
  let missCheck = -1;
  let pushed = false; // joystick pushed last tick, for the "insert a coin" hint
  const prizes = loadPrizes();

  function savePrizes() {
    try {
      localStorage.setItem(PRIZE_KEY, JSON.stringify(prizes.slice(-200)));
    } catch {
      ui.toast("瀏覽器不允許儲存，戰利品只保留到關閉網頁");
    }
  }

  function insertCoin(from) {
    if (wallet <= 0) {
      audio.play("deny");
      ui.toast("代幣不足，按「兌換代幣」補充");
      return false;
    }
    if (credits + inFlight >= W.maxCredits) {
      audio.play("deny");
      ui.toast(`可玩次數最多 ${W.maxCredits} 次`);
      return false;
    }
    wallet--;
    inFlight++;
    machine.insertCoin(from, () => {
      inFlight--;
      credits++;
      audio.play("coin");
    });
    return true;
  }

  function exchange() {
    wallet += W.exchange;
    audio.play("coin", 0.6, 0.8);
    ui.toast(`兌換了 ${W.exchange} 枚代幣（免費虛擬代幣）`);
  }

  function needCoin() {
    audio.play("deny");
    ui.toast("請先投幣");
  }

  function start() {
    if (claw.state !== "idle") return false;
    if (credits <= 0) {
      needCoin();
      return false;
    }
    if (!claw.startRound(randRange(rng, G.powerMin, G.powerMax))) return false;
    credits--;
    timeLeft = CONFIG.round.seconds;
    roundOn = true;
    wonThisRound = false;
    missCheck = -1;
    return true;
  }

  // The drop button: starts a round when idle, lowers the claw, or closes it mid-air while lowering.
  function drop() {
    const s = claw.state;
    if (s === "idle") return start();
    if (s !== "move" && s !== "descend") return false;
    if (!claw.drop()) return false;
    machine.pressButton();
    if (s === "move") {
      timeLeft = null;
      audio.play("drop");
    } else {
      ui.toast("半空收爪！");
    }
    return true;
  }

  // Joystick each simulation step. Pushing it while idle starts a round.
  function input(ix, iz) {
    const push = ix !== 0 || iz !== 0;
    if (claw.state === "idle" && push && !pushed) {
      if (credits > 0) start();
      else needCoin();
    }
    pushed = push;
    claw.setInput(claw.state === "move" ? ix : 0, claw.state === "move" ? iz : 0);
  }

  function update(dt) {
    if (claw.state === "move" && timeLeft !== null) {
      timeLeft -= dt;
      if (timeLeft <= 0) {
        timeLeft = 0;
        ui.toast("時間到，自動下爪");
        drop();
      }
    }
    if (missCheck >= 0) {
      missCheck -= dt;
      if (missCheck < 0) {
        roundOn = false;
        if (!wonThisRound) {
          audio.play("miss");
          ui.toast("沒夾到，再接再厲！");
        }
      }
    }
  }

  function onWin(p) {
    if (roundOn) wonThisRound = true;
    prizes.push({ name: p.name, rarity: p.rarity.id, label: p.rarity.label, at: Date.now() });
    savePrizes();
    audio.play("win");
    ui.win(p, prizes);
  }

  claw.on("stateChange", (s) => {
    if (s === "close") audio.play("close");
  });
  claw.on("bump", ({ speed }) => audio.play("bump", Math.min(1, speed / 3)));
  claw.on("hook", () => {
    audio.play("hook");
    ui.toast("勾到吊牌了！");
  });
  claw.on("roundEnd", () => {
    timeLeft = null;
    missCheck = MISS_DELAY;
  });

  return {
    insertCoin,
    exchange,
    start,
    drop,
    input,
    update,
    onWin,
    prizes,
    get wallet() {
      return wallet;
    },
    get credits() {
      return credits;
    },
    get timeLeft() {
      return timeLeft;
    },
  };
}

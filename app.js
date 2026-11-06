(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const elements = {
    body: document.body,
    arena: $("#arena"),
    canvas: $("#arena-canvas"),
    stageList: $("#stage-list"),
    stages: $$(".stage"),
    peekStageKey: $("#peek-stage-key"),
    sessionState: $("#session-state"),
    modeReadout: $("#mode-readout"),
    modeCopy: $("#mode-copy"),
    peekMethodReadout: $("#peek-method-readout"),
    liveStatus: $("#live-status"),
    postureValue: $("#posture-value"),
    cameraValue: $("#camera-value"),
    stanceValue: $("#stance-value"),
    offsetValue: $("#offset-value"),
    contactValue: $("#contact-value"),
    enemyStatus: $("#enemy-status"),
    enemyStatusText: $("#enemy-status-text"),
    exposureValue: $("#exposure-value"),
    cancelTiming: $("#cancel-timing"),
    peekReaction: $("#peek-reaction"),
    peekHold: $("#peek-hold"),
    cueKicker: $("#cue-kicker"),
    cueMain: $("#cue-main"),
    cueHint: $("#cue-hint"),
    timingMeter: $("#timing-meter"),
    timingGood: $("#timing-good"),
    timingPointer: $("#timing-pointer"),
    resultRating: $("#result-rating"),
    resultCopy: $("#result-copy"),
    scoreValue: $("#score-value"),
    comboValue: $("#combo-value"),
    reactionValue: $("#reaction-value"),
    bestValue: $("#best-value"),
    attemptValue: $("#attempt-value"),
    successValue: $("#success-value"),
    accuracyValue: $("#accuracy-value"),
    ratingValue: $("#rating-value"),
    eventTrack: $("#event-track"),
    challengeButton: $("#challenge-button"),
    resetButton: $("#reset-button"),
    soundToggle: $("#sound-toggle"),
    themeToggle: $("#theme-toggle"),
    clockLabel: $("#clock-label"),
    clockValue: $("#clock-value"),
    rangeReadout: $("#range-readout"),
    rangeCopy: $("#range-copy"),
    toast: $("#toast"),
    modeButtons: $$("[data-mode]"),
    peekMethodButtons: $$("[data-peek-method]"),
    difficultyButtons: $$("[data-difficulty]"),
    touchButtons: $$(".touch-controls [data-action]")
  };

  const difficulties = {
    beginner: {
      label: "入门",
      cancelMin: 260,
      cancelMax: 1000,
      peekWindow: 1200,
      holdMin: 180,
      holdMax: 800
    },
    standard: {
      label: "标准",
      cancelMin: 160,
      cancelMax: 650,
      peekWindow: 800,
      holdMin: 160,
      holdMax: 620
    },
    extreme: {
      label: "极限",
      cancelMin: 110,
      cancelMax: 430,
      peekWindow: 520,
      holdMin: 120,
      holdMax: 460
    }
  };

  const state = {
    mode: "free",
    phase: "idle",
    difficulty: "standard",
    peekMethod: "lean",
    requiredSide: "right",
    playerX: 0,
    touchDirections: new Set(),
    movement: new Set(),
    keys: new Set(),
    sprintEligible: false,
    proneStartedAt: 0,
    ghostStartedAt: 0,
    leanStartedAt: 0,
    leanSide: "right",
    directLean: false,
    freeWasProne: false,
    exposed: false,
    resultToken: 0,
    resetTimer: 0,
    events: [],
    lastCancel: null,
    lastReaction: null,
    lastHold: null,
    lastScore: 0,
    score: 0,
    bestScore: 0,
    combo: 0,
    bestCombo: 0,
    attempts: 0,
    successes: 0,
    sound: false,
    theme: "dark",
    challenge: {
      active: false,
      endsAt: 0,
      completed: false
    },
    camera: {
      x: 0,
      y: 0,
      roll: 0,
      targetX: 0,
      targetY: 0,
      targetRoll: 0
    },
    canvas: {
      width: 0,
      height: 0,
      dpr: 1
    },
    lastFrame: 0,
    lastUiPaint: 0,
    audioContext: null,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    animationTime: 0
  };

  function getDifficulty() {
    return difficulties[state.difficulty];
  }

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem("ghostPeekLabV1") || "{}");
      state.bestScore = Number(saved.bestScore) || 0;
      state.bestCombo = Number(saved.bestCombo) || 0;
      state.theme = saved.theme === "light" ? "light" : "dark";
      state.difficulty = difficulties[saved.difficulty] ? saved.difficulty : "standard";
      state.peekMethod = saved.peekMethod === "strafe" ? "strafe" : "lean";
      state.sound = Boolean(saved.sound);
    } catch {
      state.bestScore = 0;
      state.bestCombo = 0;
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem("ghostPeekLabV1", JSON.stringify({
        bestScore: state.bestScore,
        bestCombo: state.bestCombo,
        theme: state.theme,
        difficulty: state.difficulty,
        peekMethod: state.peekMethod,
        sound: state.sound
      }));
    } catch {
      // Local storage can be unavailable in restricted browser contexts.
    }
  }

  function applyTheme() {
    elements.body.dataset.theme = state.theme;
    elements.themeToggle.textContent = state.theme === "dark" ? "亮色" : "暗色";
    elements.body.style.colorScheme = state.theme;
  }

  function applyDifficulty() {
    const difficulty = getDifficulty();
    elements.rangeReadout.textContent = difficulty.label;
    elements.rangeCopy.textContent =
      `断趴 ${difficulty.cancelMin}-${difficulty.cancelMax} ms · 探身响应 ${difficulty.peekWindow} ms 内 · 停留 ${difficulty.holdMin}-${difficulty.holdMax} ms`;

    elements.difficultyButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.difficulty === state.difficulty));
    });
  }

  function applyMode() {
    elements.body.dataset.mode = state.mode;
    const isFree = state.mode === "free";
    elements.modeReadout.textContent = isFree ? "自由操作" : "跟随指令";
    elements.modeCopy.textContent = isFree
      ? "随意移动、趴伏和探身，不判定顺序。"
      : "按提示完成断趴、错位和探身，超时或顺序错误会记录。";
    elements.modeButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.mode === state.mode));
    });
  }

  function applyPeekMethod() {
    const isLean = state.peekMethod === "lean";
    elements.peekMethodReadout.textContent = isLean ? "探身 E/Q" : "闪身 A/D";
    elements.peekStageKey.textContent = isLean ? "E / Q" : "A / D";
    elements.peekMethodButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.peekMethod === state.peekMethod));
    });
  }

  function applySoundLabel() {
    elements.soundToggle.textContent = state.sound ? "声音 开" : "声音 关";
    elements.soundToggle.setAttribute("aria-pressed", String(state.sound));
  }

  function syncPersistentStats() {
    elements.bestValue.textContent = String(state.bestScore);
  }

  function clearSessionData() {
    state.score = 0;
    state.combo = 0;
    state.attempts = 0;
    state.successes = 0;
    state.lastScore = 0;
    state.lastCancel = null;
    state.lastReaction = null;
    state.lastHold = null;
    state.events = [];
    state.challenge.active = false;
    state.challenge.endsAt = 0;
    state.challenge.completed = false;
    state.requiredSide = "right";
    state.playerX = 0;
    clearTimeout(state.resetTimer);
  }

  function setMode(mode) {
    if (mode !== "free" && mode !== "training") {
      return;
    }
    state.mode = mode;
    state.phase = "idle";
    state.keys.clear();
    state.movement.clear();
    state.touchDirections.clear();
    clearSessionData();
    applyMode();
    resetCycle(false);
    updateEventTrack();
    showToast(mode === "free" ? "已进入自由操作" : "已进入指令训练");
  }

  function resetSession() {
    clearSessionData();
    resetCycle();
    renderAll();
    updateEventTrack();
    showToast("本轮记录已清空");
  }

  function beginChallenge() {
    if (state.challenge.active) {
      return;
    }

    state.mode = "training";
    applyMode();
    clearSessionData();
    resetCycle();
    state.challenge.active = true;
    state.challenge.completed = false;
    state.challenge.endsAt = performance.now() + 45000;
    elements.challengeButton.textContent = "挑战进行中";
    elements.challengeButton.disabled = true;
    elements.clockLabel.textContent = "剩余时间";
    elements.clockValue.textContent = "45.0s";
    renderAll();
    updateEventTrack();
    playTone(520, 0.06, 0.035);
    showToast("挑战开始，连续完成动作链");
  }

  function endChallenge() {
    if (!state.challenge.active) {
      return;
    }

    state.challenge.active = false;
    state.challenge.completed = true;
    state.challenge.endsAt = 0;
    elements.challengeButton.textContent = "再次挑战";
    elements.challengeButton.disabled = false;
    elements.clockLabel.textContent = "本轮结束";
    elements.clockValue.textContent = String(state.score);
    elements.resultRating.textContent = "SESSION";
    elements.resultCopy.textContent = `挑战结束，得分 ${state.score}，成功 ${state.successes}/${state.attempts}`;
    state.bestScore = Math.max(state.bestScore, state.score);
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    saveBestScore(state.bestScore);
    saveSettings();
    syncPersistentStats();
    playTone(740, 0.12, 0.04);
    showToast(`挑战结束，得分 ${state.score}`);
  }

  function getSavedBestScore() {
    try {
      const saved = JSON.parse(localStorage.getItem("ghostPeekLabV1") || "{}");
      return Number(saved.bestScore) || 0;
    } catch {
      return 0;
    }
  }

  function saveBestScore(score) {
    try {
      const saved = JSON.parse(localStorage.getItem("ghostPeekLabV1") || "{}");
      saved.bestScore = Math.max(score, Number(saved.bestScore) || 0);
      saved.bestCombo = Math.max(Number(saved.bestCombo) || 0, state.bestCombo);
      saved.theme = state.theme;
      saved.difficulty = state.difficulty;
      saved.peekMethod = state.peekMethod;
      saved.sound = state.sound;
      localStorage.setItem("ghostPeekLabV1", JSON.stringify(saved));
    } catch {
      // Non-blocking persistence failure.
    }
  }

  function resetCycle(keepEvents = true) {
    clearTimeout(state.resetTimer);
    state.phase = "idle";
    state.proneStartedAt = 0;
    state.ghostStartedAt = 0;
    state.leanStartedAt = 0;
    state.sprintEligible = false;
    state.directLean = false;
    state.freeWasProne = false;
    state.playerX = 0;
    state.exposed = false;
    elements.body.classList.remove("phase-error", "phase-success", "is-aiming", "is-running");
    if (!keepEvents) {
      state.events = [];
      updateEventTrack();
    }
    renderAll();
  }

  function scheduleReset(delay = 900) {
    const token = ++state.resultToken;
    state.resetTimer = window.setTimeout(() => {
      if (state.resultToken !== token || state.phase !== "result") {
        return;
      }
      resetCycle();
    }, delay);
  }

  function setPhase(phase) {
    state.phase = phase;
    elements.body.classList.toggle("is-running", ["sprint", "prone", "ghost", "lean", "free-prone", "free-lean"].includes(phase));
    elements.body.classList.toggle("is-aiming", ["lean", "free-lean"].includes(phase));
    elements.body.classList.remove("phase-error", "phase-success");
    renderAll();
  }

  function setActionCue(kicker, main, hint) {
    elements.cueKicker.textContent = kicker;
    elements.cueMain.textContent = main;
    elements.cueHint.textContent = hint;
  }

  function peekKeyForSide(side, method = state.peekMethod) {
    if (method === "strafe") {
      return side === "right" ? "D" : "A";
    }
    return side === "right" ? "E" : "Q";
  }

  function getLateralMeters() {
    const leaning = ["lean", "free-lean", "direct"].includes(state.phase);
    const peekOffset = leaning ? (state.leanSide === "right" ? 0.72 : -0.72) : 0;
    return state.playerX + peekOffset;
  }

  function isExposed() {
    if (state.phase === "lean" && state.mode === "training" && state.peekMethod === "strafe") {
      return Math.abs(state.playerX) > 0.16;
    }
    if (["lean", "free-lean", "direct"].includes(state.phase)) {
      return true;
    }
    return Math.abs(state.playerX) > 0.16;
  }

  function updateTacticalHud() {
    const lateral = getLateralMeters();
    elements.offsetValue.textContent = `${lateral >= 0 ? "+" : ""}${lateral.toFixed(1)} m`;
    state.exposed = isExposed();
    elements.body.classList.toggle("is-exposed", state.exposed);
    elements.enemyStatus.dataset.state = state.exposed ? "exposed" : "covered";
    elements.enemyStatusText.textContent = state.exposed ? "枪线锁定" : "直架中";
    elements.exposureValue.textContent = state.exposed ? "已离开掩体" : "被己方掩体遮挡";
    elements.contactValue.textContent = state.exposed ? "暴露" : "遮蔽";
  }

  function renderAll() {
    const phase = state.phase;
    const isFree = state.mode === "free";
    const phaseStage = {
      idle: -1,
      "free-prone": 1,
      "free-lean": 3,
      sprint: 0,
      prone: 1,
      ghost: 2,
      lean: 3,
      direct: 3,
      result: 4
    }[phase] ?? -1;

    elements.stages.forEach((stage, index) => {
      stage.classList.toggle("is-active", index === phaseStage);
      stage.classList.toggle("is-done", phaseStage > index || (phase === "result" && elements.body.classList.contains("phase-success")));
      stage.classList.toggle("is-past", index < phaseStage);
    });

    const labels = {
      idle: isFree ? "自由操作" : "待机",
      "free-prone": "自由趴伏",
      "free-lean": "自由闪身",
      sprint: "游龙步",
      prone: "断趴窗口",
      ghost: "GHOST READY",
      lean: "探身中",
      direct: "直接探头",
      result: elements.body.classList.contains("phase-error") ? "动作中断" : "完成"
    };

    elements.sessionState.textContent = isFree && phase === "idle" ? "自由" : (labels[phase] || "待机");
    elements.liveStatus.textContent = labels[phase] || (isFree ? "自由操作" : "等待输入");
    elements.postureValue.textContent =
      phase === "prone" || phase === "free-prone" ? "趴伏" :
      phase === "ghost" ? "视角错位" :
      phase === "lean" || phase === "free-lean" ? "横向探身" :
      phase === "direct" ? "直接探身" :
      phase === "sprint" ? "游走" : "站立";
    elements.cameraValue.textContent =
      phase === "lean" || phase === "free-lean" ? (state.leanSide === "right" ? "右移" : "左移") :
      phase === "ghost" ? "已回正" :
      phase === "prone" || phase === "free-prone" ? "下沉" :
      Math.abs(state.playerX) > 0.1 ? "横移" : "稳定";
    elements.stanceValue.textContent =
      phase === "prone" || phase === "free-prone" ? "低位" :
      phase === "ghost" ? "错位待命" :
      phase === "sprint" ? "游龙步" : "游走";
    updateTacticalHud();

    elements.cancelTiming.textContent = state.lastCancel === null ? "-- ms" : `${state.lastCancel} ms`;
    elements.peekReaction.textContent = state.lastReaction === null ? "-- ms" : `${state.lastReaction} ms`;
    elements.peekHold.textContent = state.lastHold === null ? "-- ms" : `${state.lastHold} ms`;

    elements.scoreValue.textContent = String(state.score);
    elements.comboValue.textContent = String(state.combo);
    elements.reactionValue.textContent = state.lastReaction === null ? "--" : `${state.lastReaction} ms`;
    elements.bestValue.textContent = String(Math.max(state.bestScore, state.score));
    elements.attemptValue.textContent = String(state.attempts);
    elements.successValue.textContent = String(state.successes);
    elements.accuracyValue.textContent = state.attempts ? `${Math.round((state.successes / state.attempts) * 100)}%` : "0%";
    elements.ratingValue.textContent = state.lastScore ? `${state.lastScore}` : "--";

    if (isFree && phase === "idle") {
      setActionCue("自由训练", "WASD", "A/D 横移 · E/Q 探身 · Z/C 趴伏");
      elements.timingMeter.hidden = true;
    } else if (isFree && phase === "free-prone") {
      setActionCue("自由趴伏", "Z / C", "再次按下恢复 · E/Q 可继续探身");
      elements.timingMeter.hidden = true;
    } else if (isFree && phase === "free-lean") {
      setActionCue("自由闪身", "松开", "A/D 横移或 E/Q 探身都能实时查看效果");
      elements.timingMeter.hidden = true;
    } else if (phase === "idle") {
      setActionCue("准备", "W + SHIFT", "进入游龙步，再起趴");
      elements.timingMeter.hidden = true;
    } else if (phase === "sprint") {
      setActionCue("游龙步", "Z", "起趴后，立刻松开 Shift");
      elements.timingMeter.hidden = true;
    } else if (phase === "prone") {
      setActionCue("断趴窗口", "SHIFT", "松开再按，打断趴伏前段");
      elements.timingMeter.hidden = false;
    } else if (phase === "ghost") {
      const sideLabel = state.requiredSide === "right" ? "右" : "左";
      const actionLabel = state.peekMethod === "strafe" ? "闪身" : "探身";
      setActionCue("GHOST READY", peekKeyForSide(state.requiredSide), `向${sideLabel}侧${actionLabel}`);
      elements.timingMeter.hidden = false;
    } else if (phase === "lean") {
      const key = peekKeyForSide(state.leanSide);
      setActionCue("探身中", `松开 ${key}`, "回到掩体，完成这一拍");
      elements.timingMeter.hidden = false;
    } else if (phase === "direct") {
      setActionCue("直接探头", "松开", "没有断趴，横移与姿态差都更小");
      elements.timingMeter.hidden = true;
    } else if (phase === "result") {
      elements.timingMeter.hidden = true;
    }

    elements.challengeButton.textContent = state.challenge.active
      ? "挑战进行中"
      : state.challenge.completed
        ? "再次挑战"
        : "开始 45 秒挑战";
    elements.challengeButton.disabled = state.challenge.active;
    elements.clockLabel.textContent = state.challenge.active
      ? "剩余时间"
      : state.challenge.completed
        ? "本轮得分"
        : isFree
          ? "自由训练"
          : "指令训练";
    if (!state.challenge.active) {
      elements.clockValue.textContent =
        state.challenge.completed ? String(state.score) : (isFree ? "--" : "READY");
    }
  }

  function addEvent(label, tone = "neutral") {
    state.events.push({ label, tone });
    state.events = state.events.slice(-7);
    updateEventTrack();
  }

  function updateEventTrack() {
    elements.eventTrack.replaceChildren();
    if (!state.events.length) {
      const placeholder = document.createElement("span");
      placeholder.className = "event-placeholder";
      placeholder.textContent = "等待按键输入";
      elements.eventTrack.append(placeholder);
      return;
    }

    state.events.forEach((event) => {
      const chip = document.createElement("span");
      chip.className = `event-chip ${event.tone}`;
      chip.textContent = event.label;
      elements.eventTrack.append(chip);
    });
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      elements.toast.classList.remove("is-visible");
    }, 1800);
  }

  function ensureAudio() {
    if (!state.sound) {
      return null;
    }
    if (!state.audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        return null;
      }
      state.audioContext = new AudioContextClass();
    }
    if (state.audioContext.state === "suspended") {
      state.audioContext.resume();
    }
    return state.audioContext;
  }

  function playTone(frequency, duration, volume = 0.03, type = "sine") {
    const context = ensureAudio();
    if (!context) {
      return;
    }
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
  }

  function beginProne() {
    if (state.phase !== "sprint") {
      state.attempts += 1;
      state.combo = 0;
      failAttempt("顺序未成立", "先做 W + Shift 游龙步，再按 Z 或 C 起趴。", "sequence");
      return;
    }
    state.lastCancel = null;
    state.lastReaction = null;
    state.lastHold = null;
    state.lastScore = 0;
    state.requiredSide = state.attempts % 2 === 0 ? "right" : "left";
    state.proneStartedAt = performance.now();
    state.attempts += 1;
    addEvent("Z 起趴", "neutral");
    setPhase("prone");
    playTone(380, 0.045, 0.025);
  }

  function interruptProne() {
    if (state.phase !== "prone") {
      return;
    }
    const elapsed = Math.round(performance.now() - state.proneStartedAt);
    const difficulty = getDifficulty();

    if (elapsed < difficulty.cancelMin) {
      failAttempt("打断过早", `本次 ${elapsed} ms，至少等到 ${difficulty.cancelMin} ms，让趴伏动作先进入前段。`, "cancel");
      return;
    }

    if (elapsed > difficulty.cancelMax) {
      failAttempt("打断过晚", `本次 ${elapsed} ms，已超过 ${difficulty.cancelMax} ms 窗口，容易变成完整趴伏。`, "cancel");
      return;
    }

    state.lastCancel = elapsed;
    state.ghostStartedAt = performance.now();
    addEvent(`SHIFT ${elapsed}ms`, "good");
    setPhase("ghost");
    playTone(560, 0.05, 0.026);
  }

  function toggleFreeProne() {
    if (state.mode !== "free") {
      return;
    }
    if (state.phase === "free-prone") {
      addEvent("起身", "neutral");
      setPhase("idle");
      return;
    }
    if (state.phase === "free-lean") {
      finishFreeLean();
    }
    addEvent("Z 自由趴伏", "neutral");
    setPhase("free-prone");
    playTone(360, 0.04, 0.022);
  }

  function beginFreeLean(side) {
    if (state.mode !== "free") {
      return;
    }
    if (!["idle", "free-prone"].includes(state.phase)) {
      return;
    }
    state.freeWasProne = state.phase === "free-prone";
    state.leanSide = side;
    state.leanStartedAt = performance.now();
    addEvent(`${side === "right" ? "E" : "Q"} 自由探身`, "neutral");
    setPhase("free-lean");
    playTone(620, 0.04, 0.022);
  }

  function finishFreeLean() {
    if (state.mode !== "free" || state.phase !== "free-lean") {
      return;
    }
    setPhase(state.freeWasProne ? "free-prone" : "idle");
  }

  function beginLean(side = "right", method = state.peekMethod) {
    if (state.phase === "ghost") {
      if (state.mode === "training" && method !== state.peekMethod) {
        failAttempt("探身方式不符", `本轮要求使用${state.peekMethod === "strafe" ? " A/D 闪身" : " E/Q 探身"}。`, "peek");
        return;
      }
      if (state.mode === "training" && side !== state.requiredSide) {
        failAttempt("方向不符", `本轮提示向${state.requiredSide === "right" ? "右" : "左"}侧出掩体。`, "peek");
        return;
      }
      const reaction = Math.round(performance.now() - state.ghostStartedAt);
      const difficulty = getDifficulty();
      if (reaction > difficulty.peekWindow) {
        failAttempt("探身过晚", `本次响应 ${reaction} ms，超过 ${difficulty.peekWindow} ms 窗口。`, "peek");
        return;
      }
      state.leanStartedAt = performance.now();
      state.leanSide = side;
      state.lastReaction = reaction;
      addEvent(`${peekKeyForSide(side, method)} ${method === "strafe" ? "闪身" : "探身"}`, "good");
      setPhase("lean");
      playTone(640, 0.05, 0.024);
      return;
    }

    if (state.phase === "idle" || state.phase === "sprint") {
      state.directLean = true;
      state.leanSide = side;
      state.attempts += 1;
      state.combo = 0;
      state.lastCancel = null;
      state.lastReaction = null;
      state.lastHold = null;
      state.lastScore = 0;
      addEvent(`${side === "right" ? "E" : "Q"} 直接探身`, "bad");
      setPhase("direct");
      elements.resultRating.textContent = "DIRECT";
      elements.resultCopy.textContent = "直接探身能练枪线，但没有断趴带来的姿态错位。";
      elements.ratingValue.textContent = "直接";
      playTone(230, 0.06, 0.022, "triangle");
    }
  }

  function finishLean() {
    if (state.phase === "free-lean") {
      finishFreeLean();
      return;
    }
    if (state.phase !== "lean") {
      if (state.phase === "direct") {
        const token = ++state.resultToken;
        window.clearTimeout(state.resetTimer);
        state.resetTimer = window.setTimeout(() => {
          if (state.resultToken === token && state.phase === "direct") {
            resetCycle();
          }
        }, 700);
      }
      return;
    }

    const hold = Math.round(performance.now() - state.leanStartedAt);
    const difficulty = getDifficulty();
    state.lastHold = hold;

    if (hold < difficulty.holdMin) {
      failAttempt("停留过短", `本次 ${hold} ms，低于 ${difficulty.holdMin} ms，信息还没拿稳就回位了。`, "hold");
      return;
    }

    if (hold > difficulty.holdMax) {
      failAttempt("停留过长", `本次 ${hold} ms，超过 ${difficulty.holdMax} ms，暴露时间被拉长。`, "hold");
      return;
    }

    completeAttempt(hold);
  }

  function failAttempt(title, detail, type) {
    if (state.mode === "free") {
      return;
    }
    if (!["idle", "sprint", "prone", "ghost", "lean", "direct"].includes(state.phase)) {
      return;
    }

    state.combo = 0;
    elements.body.classList.add("phase-error");
    elements.resultRating.textContent = title;
    elements.resultCopy.textContent = detail;
    elements.ratingValue.textContent = "失误";
    addEvent(title, "bad");
    setPhase("result");
    elements.body.classList.add("phase-error");
    elements.resultRating.textContent = title;
    elements.resultCopy.textContent = detail;
    state.lastScore = 0;
    playTone(180, 0.08, 0.03, "triangle");
    scheduleReset(1100);
  }

  function completeAttempt(hold) {
    const difficulty = getDifficulty();
    const cancelQuality = windowQuality(state.lastCancel, difficulty.cancelMin, difficulty.cancelMax);
    const reactionQuality = 1 - clamp(state.lastReaction / difficulty.peekWindow, 0, 1);
    const holdQuality = windowQuality(hold, difficulty.holdMin, difficulty.holdMax);
    const score = Math.round(45 + cancelQuality * 25 + reactionQuality * 15 + holdQuality * 15);
    const rating = score >= 94 ? "PERFECT" : score >= 82 ? "CLEAN" : "ROUGH";

    state.successes += 1;
    state.combo += 1;
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    state.score += score;
    state.lastScore = score;

    state.bestScore = Math.max(state.bestScore, state.score);
    if (state.bestScore === state.score) {
      saveBestScore(state.bestScore);
    }

    elements.body.classList.add("phase-success");
    elements.resultRating.textContent = `${rating} +${score}`;
    elements.resultCopy.textContent = `断趴 ${state.lastCancel} ms，响应 ${state.lastReaction} ms，停留 ${hold} ms`;
    elements.ratingValue.textContent = String(score);
    addEvent(`${rating} +${score}`, "good");
    setPhase("result");
    elements.body.classList.add("phase-success");
    elements.resultRating.textContent = `${rating} +${score}`;
    elements.resultCopy.textContent = `断趴 ${state.lastCancel} ms，响应 ${state.lastReaction} ms，停留 ${hold} ms`;
    playTone(rating === "PERFECT" ? 880 : 760, 0.11, 0.032);
    scheduleReset(1000);
  }

  function windowQuality(value, min, max) {
    if (value === null || Number.isNaN(value)) {
      return 0;
    }
    const middle = (min + max) / 2;
    const half = Math.max((max - min) / 2, 1);
    return 1 - clamp(Math.abs(value - middle) / half, 0, 1);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function actionFromButton(action) {
    if (state.mode === "free") {
      if (action === "move") {
        state.movement.add("forward");
        addEvent("游龙步", "neutral");
        return;
      }
      if (action === "prone") {
        toggleFreeProne();
        return;
      }
      if (action === "sprint") {
        addEvent("冲刺", "neutral");
        return;
      }
      if (action === "strafe-left") {
        state.touchDirections.add("left");
        addEvent("A 横移", "neutral");
        return;
      }
      if (action === "strafe-right") {
        state.touchDirections.add("right");
        addEvent("D 横移", "neutral");
        return;
      }
      if (action === "lean") {
        beginFreeLean("right");
      }
      return;
    }

    if (action === "move") {
      state.movement.add("forward");
      state.keys.add("ShiftLeft");
      if (state.phase === "idle") {
        state.sprintEligible = true;
        setPhase("sprint");
        addEvent("W + Shift", "neutral");
      }
      return;
    }
    if (action === "prone") {
      beginProne();
      return;
    }
    if (action === "sprint") {
      if (state.phase === "prone") {
        interruptProne();
      } else if (state.phase === "idle") {
        state.sprintEligible = true;
        setPhase("sprint");
        addEvent("Shift 冲刺", "neutral");
      }
      return;
    }
    if (action === "lean") {
      if (state.peekMethod === "lean") {
        beginLean(state.requiredSide, "lean");
      } else if (state.phase === "ghost") {
        failAttempt("探身方式不符", "本轮要求使用 A/D 闪身。", "peek");
      }
      return;
    }
    if (action === "strafe-left" || action === "strafe-right") {
      const side = action === "strafe-right" ? "right" : "left";
      if (state.peekMethod === "strafe") {
        state.touchDirections.add(side);
        beginLean(side, "strafe");
      } else if (state.phase === "ghost") {
        failAttempt("探身方式不符", "本轮要求使用 E/Q 探身。", "peek");
      }
    }
  }

  function setTouchButtonState(button, held) {
    button.classList.toggle("is-held", held);
  }

  function handleKeyDown(event) {
    const code = event.code;
    const relevant = [
      "KeyW", "KeyA", "KeyS", "KeyD",
      "ShiftLeft", "ShiftRight", "KeyZ", "KeyC", "KeyE", "KeyQ"
    ];
    if (!relevant.includes(code)) {
      return;
    }

    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    event.preventDefault();
    if (state.keys.has(code)) {
      return;
    }
    state.keys.add(code);

    if (state.mode === "free") {
      if (["KeyW", "KeyA", "KeyS", "KeyD"].includes(code)) {
        state.movement.add(code);
        if (["KeyA", "KeyD"].includes(code)) {
          addEvent(`${code === "KeyD" ? "D" : "A"} 横移`, "neutral");
        }
        return;
      }
      if (code === "ShiftLeft" || code === "ShiftRight") {
        addEvent("Shift 冲刺", "neutral");
        return;
      }
      if (code === "KeyZ" || code === "KeyC") {
        toggleFreeProne();
        return;
      }
      if (code === "KeyE") {
        beginFreeLean("right");
        return;
      }
      if (code === "KeyQ") {
        beginFreeLean("left");
      }
      return;
    }

    if (["KeyW", "KeyA", "KeyS", "KeyD"].includes(code)) {
      const startsStrafePeek = (code === "KeyA" || code === "KeyD") &&
        state.phase === "ghost" &&
        state.peekMethod === "strafe";
      if (!startsStrafePeek) {
        state.movement.add(code);
        if (code === "KeyW" && state.phase === "idle" && (state.keys.has("ShiftLeft") || state.keys.has("ShiftRight"))) {
          state.sprintEligible = true;
          setPhase("sprint");
          addEvent("W + Shift", "neutral");
        }
        return;
      }
    }

    if (code === "ShiftLeft" || code === "ShiftRight") {
      if (state.phase === "prone") {
        interruptProne();
      } else if (state.phase === "idle") {
        state.sprintEligible = true;
        setPhase("sprint");
        addEvent("Shift 冲刺", "neutral");
      }
      return;
    }

    if (code === "KeyZ" || code === "KeyC") {
      beginProne();
      return;
    }

    if (code === "KeyE") {
      if (state.phase === "ghost" && state.peekMethod !== "lean") {
        failAttempt("探身方式不符", "本轮要求使用 A/D 闪身。", "peek");
      } else {
        beginLean("right", "lean");
      }
      return;
    }

    if (code === "KeyQ") {
      if (state.phase === "ghost" && state.peekMethod !== "lean") {
        failAttempt("探身方式不符", "本轮要求使用 A/D 闪身。", "peek");
      } else {
        beginLean("left", "lean");
      }
      return;
    }

    if (code === "KeyA" || code === "KeyD") {
      const side = code === "KeyD" ? "right" : "left";
      if (state.phase === "ghost" && state.peekMethod !== "strafe") {
        failAttempt("探身方式不符", "本轮要求使用 E/Q 探身。", "peek");
      } else {
        beginLean(side, "strafe");
      }
    }
  }

  function handleKeyUp(event) {
    const code = event.code;
    if (["KeyW", "KeyA", "KeyS", "KeyD"].includes(code)) {
      state.movement.delete(code);
    }
    if (state.mode === "free" && (code === "KeyE" || code === "KeyQ")) {
      finishFreeLean();
    } else if (state.mode === "training" && (code === "KeyE" || code === "KeyQ" || code === "KeyA" || code === "KeyD")) {
      finishLean();
    }
    state.keys.delete(code);
  }

  function updatePlayerMotion(delta) {
    let lateral = 0;
    if (state.keys.has("KeyA") || state.touchDirections.has("left")) {
      lateral -= 1;
    }
    if (state.keys.has("KeyD") || state.touchDirections.has("right")) {
      lateral += 1;
    }

    const canMove = state.mode === "free" ||
      (state.mode === "training" && state.phase === "lean" && state.peekMethod === "strafe");
    if (canMove && lateral !== 0) {
      state.playerX = clamp(state.playerX + lateral * delta * 0.00155, -1.6, 1.6);
      updateTacticalHud();
    }

    const moving = state.movement.size > 0 ||
      state.touchDirections.size > 0 ||
      state.keys.has("ShiftLeft") ||
      state.keys.has("ShiftRight");
    const poseActive = ["sprint", "prone", "ghost", "lean", "free-prone", "free-lean"].includes(state.phase);
    elements.body.classList.toggle("is-running", moving || poseActive);
  }

  function updateLiveTiming(now) {
    let ratio = 0;
    let label = "--";
    let active = false;
    const difficulty = getDifficulty();

    if (state.phase === "prone") {
      const elapsed = now - state.proneStartedAt;
      ratio = clamp(elapsed / (difficulty.cancelMax + 450), 0, 1);
      label = `${Math.round(elapsed)} ms`;
      active = true;
      elements.timingGood.style.left = `${(difficulty.cancelMin / (difficulty.cancelMax + 450)) * 100}%`;
      elements.timingGood.style.width = `${((difficulty.cancelMax - difficulty.cancelMin) / (difficulty.cancelMax + 450)) * 100}%`;
    } else if (state.phase === "ghost") {
      const elapsed = now - state.ghostStartedAt;
      ratio = clamp(elapsed / difficulty.peekWindow, 0, 1);
      label = `${Math.round(elapsed)} ms`;
      active = true;
      elements.timingGood.style.left = "0%";
      elements.timingGood.style.width = "100%";
    } else if (state.phase === "lean") {
      const elapsed = now - state.leanStartedAt;
      ratio = clamp(elapsed / difficulty.holdMax, 0, 1);
      label = `${Math.round(elapsed)} ms`;
      active = true;
      elements.timingGood.style.left = `${(difficulty.holdMin / difficulty.holdMax) * 100}%`;
      elements.timingGood.style.width = `${((difficulty.holdMax - difficulty.holdMin) / difficulty.holdMax) * 100}%`;
    }

    if (active) {
      elements.timingPointer.style.left = `${ratio * 100}%`;
      if (state.phase === "prone") {
        elements.peekHold.textContent = label;
      }
    }
  }

  function checkTimeouts(now) {
    if (state.mode !== "training") {
      return;
    }
    if (state.challenge.active) {
      const remaining = Math.max(0, state.challenge.endsAt - now);
      elements.clockValue.textContent = `${(remaining / 1000).toFixed(1)}s`;
      if (remaining <= 0) {
        endChallenge();
      }
    }

    const difficulty = getDifficulty();
    if (state.phase === "prone" && now - state.proneStartedAt > difficulty.cancelMax + 420) {
      failAttempt("完整趴伏", `超过 ${difficulty.cancelMax} ms 仍未打断，Shift 需要更早接上。`, "cancel");
    }
    if (state.phase === "ghost" && now - state.ghostStartedAt > difficulty.peekWindow + 180) {
      failAttempt("错位窗口消失", `超过 ${difficulty.peekWindow} ms 未探身，GHOST 窗口已经关闭。`, "peek");
    }
  }

  function resizeCanvas() {
    const rect = elements.arena.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    state.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    state.canvas.dpr = dpr;
    elements.canvas.width = state.canvas.width;
    elements.canvas.height = state.canvas.height;
  }

  function getCanvasColors() {
    if (state.theme === "light") {
      return {
        sky: "#c9d2bd",
        skyTop: "#aebba4",
        floor: "#9ea992",
        floorLine: "rgba(27, 39, 22, 0.18)",
        wall: "#71806a",
        wallDark: "#5d6957",
        cover: "#737f68",
        coverLight: "#88957b",
        cargo: "#b8c2ac",
        cargoLine: "rgba(27, 39, 22, 0.22)",
        accent: "#607f0b",
        danger: "#a34832",
        text: "rgba(24, 32, 20, 0.76)",
        weapon: "#303a2b",
        weaponLight: "#65705d",
        glow: "rgba(96, 127, 11, 0.12)"
      };
    }
    return {
      sky: "#20291f",
      skyTop: "#151a14",
      floor: "#20261f",
      floorLine: "rgba(224, 236, 206, 0.08)",
      wall: "#30382d",
      wallDark: "#242b21",
      cover: "#323b2d",
      coverLight: "#404a38",
      cargo: "#485045",
      cargoLine: "rgba(224, 236, 206, 0.11)",
      accent: "#c9ef70",
      danger: "#ff9476",
      text: "rgba(237, 242, 230, 0.72)",
      weapon: "#171c15",
      weaponLight: "#4c5745",
      glow: "rgba(201, 239, 112, 0.07)"
    };
  }

  function drawScene(now) {
    const ctx = elements.canvas.getContext("2d");
    const dpr = state.canvas.dpr;
    const width = state.canvas.width / dpr;
    const height = state.canvas.height / dpr;
    const colors = getCanvasColors();
    const elapsed = state.phase === "prone" ? now - state.proneStartedAt : 0;
    const proneProgress = state.phase === "prone"
      ? clamp(elapsed / Math.max(getDifficulty().cancelMax + 200, 1), 0, 1)
      : state.phase === "free-prone" ? 0.62
      : state.phase === "ghost" ? 0.24 : 0;
    const leanAmount = state.phase === "lean" || state.phase === "free-lean"
      ? (state.leanSide === "right" ? 1 : -1) * clamp((now - state.leanStartedAt) / 150, 0, 1)
      : state.phase === "direct"
        ? (state.leanSide === "right" ? 1 : -1) * 0.65
        : 0;
    const movingFreely = state.mode === "free" && (
      state.keys.has("KeyW") ||
      state.keys.has("KeyA") ||
      state.keys.has("KeyS") ||
      state.keys.has("KeyD") ||
      state.keys.has("ShiftLeft") ||
      state.keys.has("ShiftRight") ||
      state.touchDirections.size > 0
    );
    const sprintBob = (state.phase === "sprint" || movingFreely) && !state.reducedMotion
      ? Math.sin(now / 90) * 2.2
      : 0;

    state.camera.targetX = -(state.playerX * 72 + leanAmount * 42);
    state.camera.targetY = proneProgress * 28 + sprintBob;
    state.camera.targetRoll = leanAmount * 0.012;
    const ease = state.reducedMotion ? 1 : 0.16;
    state.camera.x += (state.camera.targetX - state.camera.x) * ease;
    state.camera.y += (state.camera.targetY - state.camera.y) * ease;
    state.camera.roll += (state.camera.targetRoll - state.camera.roll) * ease;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, colors.skyTop);
    gradient.addColorStop(0.64, colors.sky);
    gradient.addColorStop(1, colors.floor);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const horizon = height * 0.43;

    const farX = state.camera.x * 0.46;
    const farY = state.camera.y * 0.48;
    ctx.save();
    ctx.translate(width / 2 + farX, height / 2 + farY);
    ctx.rotate(state.camera.roll * 0.58);
    ctx.translate(-width / 2, -height / 2);

    drawCeiling(ctx, width, height, colors);
    drawWalls(ctx, width, height, horizon, colors);
    drawFloor(ctx, width, height, horizon, colors);
    drawCargo(ctx, width, height, horizon, colors);
    drawEnemy(ctx, width, height, horizon, colors, farX, now);
    drawOpposingCover(ctx, width, height, horizon, colors);
    ctx.restore();

    const vignette = ctx.createRadialGradient(
      width * 0.5, height * 0.45, Math.min(width, height) * 0.16,
      width * 0.5, height * 0.45, Math.max(width, height) * 0.68
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(0.7, "rgba(0,0,0,0.08)");
    vignette.addColorStop(1, "rgba(0,0,0,0.48)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    if (state.exposed) {
      drawExposureWarning(ctx, width, height, colors);
    }

    const nearX = state.camera.x * 1.22;
    const nearY = state.camera.y * 1.08;
    ctx.save();
    ctx.translate(width / 2 + nearX, height / 2 + nearY);
    ctx.rotate(state.camera.roll * 1.35);
    ctx.translate(-width / 2, -height / 2);

    drawCover(ctx, width, height, horizon, colors, leanAmount);
    drawWeapon(ctx, width, height, colors, now);
    ctx.restore();

    if (state.phase === "ghost" || state.phase === "free-lean") {
      drawGhostGlow(ctx, width, height, colors, now);
    }
  }

  function drawCeiling(ctx, width, height, colors) {
    ctx.fillStyle = colors.wallDark;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(width, 0);
    ctx.lineTo(width * 0.72, height * 0.31);
    ctx.lineTo(width * 0.28, height * 0.31);
    ctx.closePath();
    ctx.fill();

    for (let i = 0; i < 5; i += 1) {
      const x = width * (0.25 + i * 0.125);
      const y = height * (0.055 + i * 0.018);
      ctx.fillStyle = i % 2 ? "rgba(232, 244, 212, 0.06)" : "rgba(232, 244, 212, 0.12)";
      ctx.fillRect(x, y, width * 0.08, 2);
    }
  }

  function drawWalls(ctx, width, height, horizon, colors) {
    ctx.fillStyle = colors.wall;
    ctx.beginPath();
    ctx.moveTo(0, horizon * 0.52);
    ctx.lineTo(width * 0.19, horizon * 0.80);
    ctx.lineTo(width * 0.30, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = colors.wallDark;
    ctx.beginPath();
    ctx.moveTo(width, horizon * 0.52);
    ctx.lineTo(width * 0.81, horizon * 0.80);
    ctx.lineTo(width * 0.70, height);
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = colors.floorLine;
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i += 1) {
      const y = height * (0.25 + i * 0.10);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width * (0.20 + i * 0.024), y + height * 0.02);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(width, y);
      ctx.lineTo(width * (0.80 - i * 0.024), y + height * 0.02);
      ctx.stroke();
    }
  }

  function drawFloor(ctx, width, height, horizon, colors) {
    ctx.fillStyle = colors.floor;
    ctx.beginPath();
    ctx.moveTo(width * 0.19, horizon);
    ctx.lineTo(width * 0.81, horizon);
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = colors.floorLine;
    const vanishingX = width * 0.52;
    for (let i = -5; i <= 5; i += 1) {
      ctx.beginPath();
      ctx.moveTo(vanishingX + i * width * 0.035, horizon);
      ctx.lineTo(width / 2 + i * width * 0.19, height);
      ctx.stroke();
    }
    for (let i = 0; i < 7; i += 1) {
      const t = (i + 1) / 8;
      const y = horizon + Math.pow(t, 1.7) * (height - horizon);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  function drawCargo(ctx, width, height, horizon, colors) {
    const baseY = horizon + height * 0.08;
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        const boxW = width * (0.09 - row * 0.008);
        const boxH = height * (0.12 - row * 0.012);
        const x = width * 0.49 + col * boxW * 0.87;
        const y = baseY - row * boxH * 0.48 - boxH;
        ctx.fillStyle = colors.cargo;
        ctx.fillRect(x, y, boxW, boxH);
        ctx.strokeStyle = colors.cargoLine;
        ctx.strokeRect(x, y, boxW, boxH);
        ctx.beginPath();
        ctx.moveTo(x, y + boxH * 0.22);
        ctx.lineTo(x + boxW, y + boxH * 0.22);
        ctx.stroke();
      }
    }
  }

  function drawCover(ctx, width, height, horizon, colors, leanAmount) {
    const coverX = width * 0.34 - leanAmount * 5;
    const coverY = horizon - height * 0.12;
    const coverW = width * 0.30;
    const coverH = height * 0.60;
    const gradient = ctx.createLinearGradient(coverX, coverY, coverX + coverW, coverY + coverH);
    gradient.addColorStop(0, colors.coverLight);
    gradient.addColorStop(0.26, colors.cover);
    gradient.addColorStop(1, colors.wallDark);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(coverX, coverY + height * 0.04);
    ctx.lineTo(coverX + coverW * 0.42, coverY);
    ctx.lineTo(coverX + coverW, coverY + height * 0.10);
    ctx.lineTo(coverX + coverW * 0.72, coverY + coverH);
    ctx.lineTo(coverX + coverW * 0.12, coverY + coverH * 0.94);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = colors.floorLine;
    ctx.stroke();

    ctx.strokeStyle = colors.cargoLine;
    ctx.beginPath();
    ctx.moveTo(coverX + coverW * 0.30, coverY + height * 0.10);
    ctx.lineTo(coverX + coverW * 0.58, coverY + coverH * 0.84);
    ctx.stroke();

    ctx.strokeStyle = state.exposed
      ? `${colors.danger}66`
      : colors.cargoLine;
    ctx.beginPath();
    ctx.moveTo(coverX + coverW * 0.06, coverY + height * 0.36);
    ctx.lineTo(coverX + coverW * 0.92, coverY + height * 0.29);
    ctx.stroke();
  }

  function drawOpposingCover(ctx, width, height, horizon, colors) {
    const x = width * 0.60;
    const y = horizon + height * 0.035;
    const coverW = width * 0.27;
    const coverH = height * 0.14;
    const gradient = ctx.createLinearGradient(x, y - coverH, x + coverW, y);
    gradient.addColorStop(0, colors.coverLight);
    gradient.addColorStop(1, colors.wallDark);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(x, y - coverH * 0.72);
    ctx.lineTo(x + coverW * 0.16, y - coverH);
    ctx.lineTo(x + coverW, y - coverH * 0.52);
    ctx.lineTo(x + coverW * 0.91, y);
    ctx.lineTo(x + coverW * 0.08, y + coverH * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = colors.cargoLine;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + coverW * 0.08, y - coverH * 0.50);
    ctx.lineTo(x + coverW * 0.92, y - coverH * 0.38);
    ctx.stroke();

    ctx.fillStyle = colors.text;
    ctx.font = "8px 'Cascadia Mono', 'Consolas', monospace";
    ctx.fillText("OPPOSING COVER", x + coverW * 0.08, y - coverH * 0.22);
  }

  function drawEnemy(ctx, width, height, horizon, colors, farX, now) {
    const x = width * 0.71;
    const y = horizon - height * 0.018;
    const size = height * 0.205;
    const muzzleX = x - size * 0.30;
    const muzzleY = y - size * 0.25;
    const targetX = width * 0.50 - farX;
    const targetY = height * 0.47;

    if (state.exposed) {
      const cone = ctx.createLinearGradient(muzzleX, muzzleY, targetX, targetY);
      cone.addColorStop(0, `${colors.danger}5c`);
      cone.addColorStop(1, `${colors.danger}00`);
      ctx.strokeStyle = cone;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(muzzleX, muzzleY);
      ctx.lineTo(targetX, targetY);
      ctx.stroke();

      ctx.strokeStyle = `${colors.danger}33`;
      ctx.beginPath();
      ctx.moveTo(muzzleX, muzzleY);
      ctx.lineTo(targetX - width * 0.05, targetY + height * 0.12);
      ctx.moveTo(muzzleX, muzzleY);
      ctx.lineTo(targetX + width * 0.05, targetY - height * 0.08);
      ctx.stroke();
    } else {
      ctx.strokeStyle = `${colors.contact || colors.text}30`;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 8]);
      ctx.beginPath();
      ctx.moveTo(muzzleX, muzzleY);
      ctx.lineTo(targetX, targetY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.strokeStyle = state.exposed ? colors.danger : colors.text;
    ctx.lineWidth = state.exposed ? 1.6 : 1.2;
    ctx.fillStyle = colors.wallDark;

    // Helmet and visor.
    ctx.beginPath();
    ctx.arc(x, y - size * 0.73, size * 0.135, Math.PI, Math.PI * 2);
    ctx.lineTo(x + size * 0.16, y - size * 0.64);
    ctx.lineTo(x - size * 0.15, y - size * 0.65);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Torso and plate carrier.
    ctx.beginPath();
    ctx.moveTo(x - size * 0.18, y - size * 0.56);
    ctx.lineTo(x + size * 0.18, y - size * 0.56);
    ctx.lineTo(x + size * 0.22, y - size * 0.04);
    ctx.lineTo(x - size * 0.20, y - size * 0.04);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = state.exposed ? `${colors.danger}aa` : `${colors.text}6b`;
    ctx.beginPath();
    ctx.moveTo(x - size * 0.12, y - size * 0.50);
    ctx.lineTo(x + size * 0.12, y - size * 0.50);
    ctx.moveTo(x - size * 0.13, y - size * 0.31);
    ctx.lineTo(x + size * 0.13, y - size * 0.31);
    ctx.stroke();

    // Arms and rifle held ready toward the player.
    ctx.strokeStyle = state.exposed ? colors.danger : colors.text;
    ctx.lineWidth = Math.max(1.4, size * 0.035);
    ctx.beginPath();
    ctx.moveTo(x - size * 0.19, y - size * 0.44);
    ctx.lineTo(x - size * 0.40, y - size * 0.28);
    ctx.lineTo(x - size * 0.50, y - size * 0.24);
    ctx.moveTo(x + size * 0.19, y - size * 0.44);
    ctx.lineTo(x - size * 0.12, y - size * 0.28);
    ctx.moveTo(x - size * 0.54, y - size * 0.26);
    ctx.lineTo(x + size * 0.22, y - size * 0.32);
    ctx.stroke();

    // Keep the lower body behind the opposing cover.
    ctx.strokeStyle = `${colors.text}85`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - size * 0.10, y - size * 0.05);
    ctx.lineTo(x - size * 0.24, y + size * 0.34);
    ctx.moveTo(x + size * 0.10, y - size * 0.05);
    ctx.lineTo(x + size * 0.25, y + size * 0.33);
    ctx.stroke();

    if (state.exposed) {
      const pulse = state.reducedMotion ? 0 : Math.sin(now / 180) * 1.5;
      ctx.strokeStyle = colors.danger;
      ctx.globalAlpha = 0.58;
      ctx.beginPath();
      ctx.arc(x, y - size * 0.35, size * 0.42 + pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = state.exposed ? colors.danger : colors.text;
    ctx.font = "9px 'Cascadia Mono', 'Consolas', monospace";
    ctx.textAlign = "center";
    ctx.fillText(state.exposed ? "LOCK" : "HOLD", x, y - size * 0.94);
    ctx.textAlign = "start";
  }

  function drawWeapon(ctx, width, height, colors, now) {
    const moving = state.phase === "sprint" ||
      (state.mode === "free" && (state.keys.has("KeyW") || state.keys.has("ShiftLeft") || state.keys.has("ShiftRight")));
    const sway = moving && !state.reducedMotion ? Math.sin(now / 110) * 4 : 0;
    const x = width * 0.68 + sway;
    const y = height * 0.76;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.19);
    ctx.fillStyle = colors.weapon;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(width * 0.36, -height * 0.10);
    ctx.lineTo(width * 0.39, -height * 0.055);
    ctx.lineTo(width * 0.09, height * 0.10);
    ctx.lineTo(0, height * 0.09);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = colors.weaponLight;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.fillStyle = colors.weaponLight;
    ctx.fillRect(width * 0.10, -height * 0.01, width * 0.25, Math.max(5, height * 0.012));
    ctx.fillRect(width * 0.20, -height * 0.048, width * 0.07, height * 0.065);
    ctx.fillStyle = colors.accent;
    ctx.globalAlpha = 0.52;
    ctx.fillRect(width * 0.205, -height * 0.043, width * 0.018, Math.max(2, height * 0.006));
    ctx.globalAlpha = 1;

    ctx.fillStyle = colors.weapon;
    ctx.beginPath();
    ctx.ellipse(width * 0.04, height * 0.105, width * 0.095, height * 0.055, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = colors.weaponLight;
    ctx.stroke();
    ctx.restore();
  }

  function drawGhostGlow(ctx, width, height, colors, now) {
    const pulse = state.reducedMotion ? 0.18 : 0.14 + Math.sin(now / 220) * 0.04;
    const gradient = ctx.createRadialGradient(
      width * 0.52, height * 0.46, 0,
      width * 0.52, height * 0.46, Math.min(width, height) * 0.46
    );
    gradient.addColorStop(0, `rgba(201, 239, 112, ${pulse})`);
    gradient.addColorStop(0.6, `rgba(201, 239, 112, ${pulse * 0.25})`);
    gradient.addColorStop(1, "rgba(201, 239, 112, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  function drawExposureWarning(ctx, width, height, colors) {
    const edge = Math.min(width, height) * 0.24;
    const leftGradient = ctx.createLinearGradient(0, 0, edge, 0);
    leftGradient.addColorStop(0, `${colors.danger}24`);
    leftGradient.addColorStop(1, `${colors.danger}00`);
    ctx.fillStyle = leftGradient;
    ctx.fillRect(0, 0, edge, height);

    const rightGradient = ctx.createLinearGradient(width, 0, width - edge, 0);
    rightGradient.addColorStop(0, `${colors.danger}24`);
    rightGradient.addColorStop(1, `${colors.danger}00`);
    ctx.fillStyle = rightGradient;
    ctx.fillRect(width - edge, 0, edge, height);
  }

  function frame(now) {
    const delta = Math.min(50, now - (state.lastFrame || now));
    state.lastFrame = now;
    state.animationTime += delta;
    updatePlayerMotion(delta);
    checkTimeouts(now);
    updateLiveTiming(now);
    drawScene(now);
    if (now - state.lastUiPaint > 120) {
      state.lastUiPaint = now;
      elements.scoreValue.textContent = String(state.score);
      elements.comboValue.textContent = String(state.combo);
      elements.bestValue.textContent = String(Math.max(state.bestScore, state.score));
      updateTacticalHud();
    }
    requestAnimationFrame(frame);
  }

  function bindEvents() {
    window.addEventListener("keydown", handleKeyDown, { passive: false });
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", () => {
      state.keys.clear();
      state.movement.clear();
      state.touchDirections.clear();
      elements.touchButtons.forEach((button) => button.classList.remove("is-held"));
    });

    elements.modeButtons.forEach((button) => {
      button.addEventListener("click", () => setMode(button.dataset.mode));
    });

    elements.peekMethodButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.peekMethod = button.dataset.peekMethod;
        applyPeekMethod();
        saveSettings();
        renderAll();
        showToast(`探身方式切换为${state.peekMethod === "lean" ? " E/Q" : " A/D"}`);
      });
    });

    elements.difficultyButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.difficulty = button.dataset.difficulty;
        saveSettings();
        applyDifficulty();
        renderAll();
        showToast(`判定切换为${getDifficulty().label}`);
      });
    });

    elements.challengeButton.addEventListener("click", beginChallenge);
    elements.resetButton.addEventListener("click", resetSession);

    elements.soundToggle.addEventListener("click", () => {
      state.sound = !state.sound;
      applySoundLabel();
      saveSettings();
      if (state.sound) {
        playTone(620, 0.08, 0.03);
        showToast("训练提示音已开启");
      } else {
        showToast("训练提示音已关闭");
      }
    });

    elements.themeToggle.addEventListener("click", () => {
      state.theme = state.theme === "dark" ? "light" : "dark";
      applyTheme();
      saveSettings();
    });

    elements.touchButtons.forEach((button) => {
      const start = (event) => {
        event.preventDefault();
        setTouchButtonState(button, true);
        actionFromButton(button.dataset.action);
      };
      const end = (event) => {
        event.preventDefault();
        setTouchButtonState(button, false);
        const action = button.dataset.action;
        if (action === "move") {
          state.movement.delete("forward");
        }
        if (action === "strafe-left") {
          state.touchDirections.delete("left");
          if (state.mode === "training" && state.phase === "lean" && state.peekMethod === "strafe" && state.leanSide === "left") {
            finishLean();
          }
        }
        if (action === "strafe-right") {
          state.touchDirections.delete("right");
          if (state.mode === "training" && state.phase === "lean" && state.peekMethod === "strafe" && state.leanSide === "right") {
            finishLean();
          }
        }
        if (action === "lean") {
          finishLean();
        }
      };
      button.addEventListener("pointerdown", start);
      button.addEventListener("pointerup", end);
      button.addEventListener("pointercancel", end);
      button.addEventListener("pointerleave", (event) => {
        if (button.classList.contains("is-held")) {
          end(event);
        }
      });
    });

    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(elements.arena);
    window.addEventListener("resize", resizeCanvas);
  }

  function init() {
    loadSettings();
    applyTheme();
    applySoundLabel();
    applyMode();
    applyPeekMethod();
    applyDifficulty();
    elements.soundToggle.setAttribute("aria-pressed", String(state.sound));
    resizeCanvas();
    bindEvents();
    renderAll();
    updateEventTrack();
    requestAnimationFrame(frame);
  }

  init();
})();

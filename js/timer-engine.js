/* 計時狀態機：以系統時間差精準倒數、提醒語音與超時進度計算 */

import { cancelSoundPreview, playTimeUpCue, Voice, Wake, WARN_VOICE_VOLUME } from './audio.js';
import { Store } from './store.js';

export const WARN_SECONDS = 20;
const LATE_BELL_LIMIT_MS = 5000;
const TICK_MS = 180;

export function fmtClock(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

export function createTimerEngine({ onTick, onStateChange, announce }) {
  const state = {
    slotIndex: null, // 0..11
    running: false,
    accumulated: 0,
    runStart: 0,
    spoke20: false,
    rang0: false,
    intervalId: null,
  };

  Wake.isRunningFn = () => state.running;

  function isActive() {
    return state.slotIndex !== null;
  }

  function currentSeat() {
    if (state.slotIndex === null) return null;
    const g = Store.getActiveGroup();
    const s = g.seats[state.slotIndex];
    return s && s.name ? s : null;
  }

  function elapsedMs() {
    return state.accumulated + (state.running ? Date.now() - state.runStart : 0);
  }

  function checkCues() {
    if (!isActive()) return;
    const g = Store.getActiveGroup();
    const overMs = elapsedMs() - g.duration * 1000;
    const lateBy20 = overMs + WARN_SECONDS * 1000;

    if (!state.spoke20 && lateBy20 >= 0) {
      state.spoke20 = true;
      if (g.duration > WARN_SECONDS && lateBy20 < LATE_BELL_LIMIT_MS && overMs < 0) {
        Voice.speak('剩下 20 秒', WARN_VOICE_VOLUME);
        announce('剩下 20 秒');
      }
    }

    if (!state.rang0 && overMs >= 0) {
      state.rang0 = true;
      if (overMs < LATE_BELL_LIMIT_MS) playTimeUpCue();
      announce('時間到，開始計算超時');
    }
  }

  function tick() {
    checkCues();
    onTick();
  }

  function startLoop() {
    if (state.intervalId === null) state.intervalId = setInterval(tick, TICK_MS);
  }

  function stopLoop() {
    if (state.intervalId !== null) {
      clearInterval(state.intervalId);
      state.intervalId = null;
    }
  }

  function clear() {
    stopLoop();
    state.slotIndex = null;
    state.running = false;
    state.accumulated = 0;
    state.runStart = 0;
    state.spoke20 = false;
    state.rang0 = false;
    cancelSoundPreview();
    Wake.sync();
  }

  function startSeat(slotIndex) {
    const g = Store.getActiveGroup();
    const seat = g.seats[slotIndex];
    if (!seat || !seat.name) return;

    const prev = currentSeat();
    if (prev && state.slotIndex !== slotIndex) {
      prev.done = true;
    }

    clear();
    state.slotIndex = slotIndex;
    state.running = true;
    state.runStart = Date.now();
    seat.done = false;
    Store.save();
    startLoop();
    Wake.sync();
    onStateChange();
    announce(`${seat.name} 開始分享`);
  }

  function toggleSeatOrStart(slotIndex) {
    const g = Store.getActiveGroup();
    const seat = g.seats[slotIndex];
    if (!seat || !seat.name) return false;
    if (state.slotIndex === slotIndex) return false;

    if (seat.done) {
      seat.done = false;
      Store.save();
      onStateChange();
      announce(`${seat.name} 已恢復為未分享`);
      return false;
    }
    startSeat(slotIndex);
    return true;
  }

  function pause() {
    if (!isActive() || !state.running) return;
    state.accumulated = elapsedMs();
    state.running = false;
    stopLoop();
    Wake.sync();
    onStateChange();
    announce('已暫停');
  }

  function resume() {
    if (!isActive() || state.running) return;
    state.runStart = Date.now();
    state.running = true;
    startLoop();
    Wake.sync();
    onStateChange();
    announce('繼續計時');
  }

  function endCurrent() {
    const seat = currentSeat();
    if (seat) seat.done = true;
    clear();
    Store.save();
    onStateChange();
    if (seat) announce(`${seat.name} 分享結束`);
  }

  function computeClock() {
    const g = Store.getActiveGroup();
    const seat = currentSeat();
    if (!seat) {
      return {
        mode: 'idle',
        paused: false,
        speaker: '',
        statusLabel: '',
        clockText: fmtClock(g.duration),
        pct: 0,
      };
    }
    const totalMs = g.duration * 1000;
    const remMs = totalMs - elapsedMs();
    const paused = !state.running;

    if (remMs > 0) {
      const secs = Math.ceil(remMs / 1000);
      return {
        mode: secs <= WARN_SECONDS ? 'warn' : 'ok',
        paused,
        speaker: seat.name,
        statusLabel: paused ? '已暫停' : '發言中',
        clockText: fmtClock(secs),
        pct: (remMs / totalMs) * 100,
      };
    }

    const overMs = -remMs;
    const fullMs = (g.overtimeFullSec || 30) * 1000;
    return {
      mode: 'over',
      paused,
      speaker: seat.name,
      statusLabel: paused ? '已暫停' : '已超時',
      clockText: '+' + fmtClock(Math.floor(overMs / 1000)),
      pct: Math.min(100, (overMs / fullMs) * 100),
    };
  }

  return {
    isActive,
    isRunning: () => state.running,
    activeSlotIndex: () => state.slotIndex,
    currentSeat,
    toggleSeatOrStart,
    pause,
    resume,
    endCurrent,
    clear,
    tick,
    computeClock,
  };
}

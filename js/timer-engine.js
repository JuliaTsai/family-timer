/* 計時狀態機：同時支援「桌次座位模式（依人名）」與「就地圍圈純計時模式（以家長為中心順／逆時針，不看人名）」 */

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

/** 計算圍圈模式下第 pos 個圓點對應的分享順位標籤（以 0=家長 為第 1 位，依順／逆時針編號） */
export function circleTurnNumber(posIndex, total, direction) {
  if (posIndex === 0) return 1;
  return direction === 'cw' ? posIndex + 1 : total - posIndex + 1;
}

export function createTimerEngine({ onTick, onStateChange, announce }) {
  const state = {
    targetKind: null, // 'table' | 'circle' | null
    slotIndex: null,  // table: 0..11; circle: 0..total-1 (0 = 6點鐘家長起點，順時針遞增角度)
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
    if (state.targetKind !== 'table' || state.slotIndex === null) return null;
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

  function tick() { checkCues(); onTick(); }
  function startLoop() { if (state.intervalId === null) state.intervalId = setInterval(tick, TICK_MS); }
  function stopLoop() {
    if (state.intervalId !== null) { clearInterval(state.intervalId); state.intervalId = null; }
  }

  function clear() {
    stopLoop();
    Object.assign(state, { targetKind: null, slotIndex: null, running: false, accumulated: 0, runStart: 0, spoke20: false, rang0: false });
    cancelSoundPreview();
    Wake.sync();
  }

  function markCurrentDoneInternal(g) {
    if (state.slotIndex === null) return;
    if (state.targetKind === 'table') {
      const prev = g.seats[state.slotIndex];
      if (prev?.name) prev.done = true;
    } else if (state.targetKind === 'circle' && !g.circle.done.includes(state.slotIndex)) {
      g.circle.done.push(state.slotIndex);
    }
  }

  // ===== 桌次座位模式操作 =====
  function startSeat(slotIndex) {
    const g = Store.getActiveGroup();
    const seat = g.seats[slotIndex];
    if (!seat || !seat.name) return;

    if (state.slotIndex !== slotIndex || state.targetKind !== 'table') {
      markCurrentDoneInternal(g);
    }

    clear();
    state.targetKind = 'table';
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
    if (state.targetKind === 'table' && state.slotIndex === slotIndex) return false;

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

  // ===== 就地圍圈純計時操作（不看人名，以家長 0 為起點，順／逆時針推進） =====
  function startCircleIndex(posIndex) {
    const g = Store.getActiveGroup();
    const total = g.circle.total;
    const idx = ((posIndex % total) + total) % total;

    if (state.targetKind === 'circle' && state.slotIndex !== null && state.slotIndex !== idx) {
      markCurrentDoneInternal(g);
    }

    clear();
    state.targetKind = 'circle';
    state.slotIndex = idx;
    state.running = true;
    state.runStart = Date.now();
    g.circle.done = g.circle.done.filter((x) => x !== idx);
    Store.save();
    startLoop();
    Wake.sync();
    onStateChange();
    const turn = circleTurnNumber(idx, total, g.circle.direction);
    announce(`第 ${turn} 位開始分享`);
  }

  function toggleCircleDotOrStart(posIndex) {
    const g = Store.getActiveGroup();
    if (state.targetKind === 'circle' && state.slotIndex === posIndex) return;
    if (g.circle.done.includes(posIndex)) {
      g.circle.done = g.circle.done.filter((x) => x !== posIndex);
      Store.save();
      onStateChange();
      return;
    }
    startCircleIndex(posIndex);
  }

  /** 圍圈模式：開始第一位，或結束目前這位並自動沿順／逆時針跳下一位未分享者 */
  function startOrAdvanceCircle() {
    const g = Store.getActiveGroup();
    const { total, direction } = g.circle;
    const step = direction === 'cw' ? 1 : -1;

    if (state.targetKind === 'circle' && state.slotIndex !== null) {
      const from = state.slotIndex;
      markCurrentDoneInternal(g);
      clear();
      // 尋找順／逆時針下一顆尚未分享的圓點
      for (let k = 1; k < total; k++) {
        const cand = (((from + step * k) % total) + total) % total;
        if (!g.circle.done.includes(cand)) {
          startCircleIndex(cand);
          return;
        }
      }
      // 全部皆已分享完畢
      Store.save();
      onStateChange();
      announce('全組圍圈分享完畢');
      return;
    }

    // 尚未有人計時中：從家長 (0) 起算找第一位尚未分享者（若已全滿則清零重來）
    if (g.circle.done.length >= total) {
      g.circle.done = [];
    }
    for (let k = 0; k < total; k++) {
      const cand = (((0 + step * k) % total) + total) % total;
      if (!g.circle.done.includes(cand)) {
        startCircleIndex(cand);
        return;
      }
    }
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
    const g = Store.getActiveGroup();
    markCurrentDoneInternal(g);
    clear();
    Store.save();
    onStateChange();
    announce('分享結束');
  }

  function computeClock() {
    const g = Store.getActiveGroup();
    const isCircle = g.shareMode === 'circle';
    let speakerLabel = '';

    if (isCircle && state.targetKind === 'circle' && state.slotIndex !== null) {
      const turn = circleTurnNumber(state.slotIndex, g.circle.total, g.circle.direction);
      speakerLabel = state.slotIndex === 0 ? '家長（第 1 位）' : `第 ${turn} 位`;
    } else if (!isCircle) {
      const seat = currentSeat();
      if (seat) speakerLabel = seat.name;
    }

    if (!speakerLabel) {
      return { mode: 'idle', paused: false, speaker: '', statusLabel: '', clockText: fmtClock(g.duration), pct: 0 };
    }

    const totalMs = g.duration * 1000;
    const remMs = totalMs - elapsedMs();
    const paused = !state.running;

    if (remMs > 0) {
      const secs = Math.ceil(remMs / 1000);
      return {
        mode: secs <= WARN_SECONDS ? 'warn' : 'ok',
        paused,
        speaker: speakerLabel,
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
      speaker: speakerLabel,
      statusLabel: paused ? '已暫停' : '已超時',
      clockText: '+' + fmtClock(Math.floor(overMs / 1000)),
      pct: Math.min(100, (overMs / fullMs) * 100),
    };
  }

  return {
    isActive,
    isRunning: () => state.running,
    activeSlotIndex: () => state.slotIndex,
    activeTargetKind: () => state.targetKind,
    toggleSeatOrStart,
    toggleCircleDotOrStart,
    startOrAdvanceCircle,
    pause,
    resume,
    endCurrent,
    clear,
    tick,
    computeClock,
  };
}

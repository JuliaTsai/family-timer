/* 家庭分享計時 — 主程式入口：URL Hash 載入、視圖切換、快捷鍵、離線狀態與 Service Worker */

import { Bell, bindAudioUnlockGestures, Wake } from './audio.js';
import { decodeUrlHashPayload } from './codec.js';
import { initOcrModal } from './ocr.js';
import { initSetupView } from './setup-view.js';
import { formatGroupTitle, STORAGE_KEY, Store } from './store.js';
import { createTimerEngine } from './timer-engine.js';
import { initTimerView } from './timer-view.js';

const appEl = document.getElementById('app');
const setupRoot = document.getElementById('setupView');
const timerRoot = document.getElementById('timerView');
const drawerEl = document.getElementById('settingsDrawer');
const pasteModal = document.getElementById('pasteModal');
const ocrModal = document.getElementById('ocrModal');
const importModal = document.getElementById('importModal');
const announcer = document.getElementById('announcer');

function announce(msg) {
  announcer.textContent = '';
  setTimeout(() => { announcer.textContent = msg; }, 40);
}

bindAudioUnlockGestures();

let currentView = 'timer';

function switchView(view) {
  currentView = view;
  appEl.dataset.view = view;
  setupRoot.hidden = view !== 'setup';
  timerRoot.hidden = view !== 'timer';
  if (view === 'setup') {
    appEl.dataset.mode = 'idle';
    setupView.render();
  } else {
    timerView.renderAll();
  }
}

const engine = createTimerEngine({
  onTick: () => {
    if (currentView === 'timer') timerView.renderClockOnly();
  },
  onStateChange: () => {
    if (currentView === 'timer') timerView.renderAll();
  },
  announce,
});

const ocrCtrl = initOcrModal({
  modal: ocrModal,
  onApplyText: (txt) => setupView.applyBulkRosterText(txt),
});

const setupView = initSetupView({
  root: setupRoot,
  pasteModal,
  onOpenOcr: () => ocrCtrl.open(),
  onStartTable: () => switchView('timer'),
  onStartCircle: () => switchView('timer'),
  announce,
});

const timerView = initTimerView({
  appEl,
  root: timerRoot,
  drawer: drawerEl,
  engine,
  onEditSetup: () => switchView('setup'),
  announce,
});

function consumeIncomingHash() {
  const payload = decodeUrlHashPayload(window.location.hash);
  if (!payload) return false;

  try {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch { /* ignore */ }

  const existing = Store.findGroupByIdentity(payload.course, payload.family);
  const existingHasProgress = Boolean(existing && existing.seats.some((s) => s.done));

  if (existing && existingHasProgress) {
    const titleEl = importModal.querySelector('#importModalTitle');
    const keepBtn = importModal.querySelector('#importKeepBtn');
    const resetBtn = importModal.querySelector('#importResetBtn');
    titleEl.textContent = `這台裝置已有「${formatGroupTitle(existing)}」的分享紀錄`;

    const finishImport = (keepDone) => {
      importModal.hidden = true;
      Store.applyImportedGroup(payload, { keepDone, targetGroupId: existing.id });
      switchView('setup');
      announce('已載入排組雷達名單，第 1 格為家長、第 2 格為副家長');
    };
    keepBtn.onclick = () => finishImport(true);
    resetBtn.onclick = () => finishImport(false);
    importModal.hidden = false;
    switchView('setup');
    return true;
  }

  Store.applyImportedGroup(payload, { keepDone: false });
  switchView('setup');
  announce('已載入排組雷達小組名單');
  return true;
}

window.addEventListener('hashchange', () => {
  engine.clear();
  consumeIncomingHash();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!ocrModal.hidden) { ocrCtrl.close(); return; }
    if (!pasteModal.hidden) { pasteModal.hidden = true; return; }
    if (timerView.isDrawerOpen()) { timerView.closeDrawer(); return; }
  }
  if (currentView === 'timer' && e.code === 'Space' && engine.isActive()) {
    if (e.target && e.target.matches('input, textarea, select, button')) return;
    e.preventDefault();
    if (engine.isRunning()) engine.pause();
    else engine.resume();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (Bell.ctx && Bell.ctx.state !== 'running') Bell.ctx.resume().catch(() => {});
    engine.tick();
  }
  Wake.sync();
});

window.addEventListener('pagehide', () => {
  Wake.release();
  Store.save();
});

window.addEventListener('storage', (e) => {
  if (e.key !== STORAGE_KEY || engine.isActive()) return;
  Store.reloadFromStorage();
  if (currentView === 'setup') setupView.render();
  else timerView.renderAll();
});

function syncOfflineBadges() {
  const text = !navigator.onLine ? '離線運作中' : '可離線';
  document.querySelectorAll('[data-offline-label]').forEach((node) => {
    node.textContent = node.dataset.withPrivacy === 'true'
      ? `${text} · 資料只存在這台裝置`
      : text;
  });
}

window.addEventListener('online', syncOfflineBadges);
window.addEventListener('offline', syncOfflineBadges);

if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then(() => syncOfflineBadges())
      .catch(() => {});
  });
  navigator.serviceWorker.addEventListener('controllerchange', syncOfflineBadges);
}

if (!consumeIncomingHash()) {
  const active = Store.getActiveGroup();
  if (Store.hasActiveMembers(active) || active.shareMode === 'circle') {
    switchView('timer');
  } else {
    switchView('setup');
  }
}
syncOfflineBadges();

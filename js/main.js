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
  onStartSharing: () => switchView('timer'),
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

// 處理從「排組雷達」開啟的 #g=... 免後端名單連結
function consumeIncomingHash() {
  const payload = decodeUrlHashPayload(window.location.hash);
  if (!payload) return false;

  // 立即清除網址列上的 #g=...，避免重新整理覆蓋現場進度，也不殘留長網址
  try {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch { /* ignore */ }

  const existing = Store.findGroupByIdentity(payload.course, payload.family);
  const existingHasProgress = Boolean(existing && existing.seats.some((s) => s.done));

  if (existing && existingHasProgress) {
    // 已有分享紀錄：詢問要保留已分享狀態更新名單，或重頭開始
    const titleEl = importModal.querySelector('#importModalTitle');
    const keepBtn = importModal.querySelector('#importKeepBtn');
    const resetBtn = importModal.querySelector('#importResetBtn');
    titleEl.textContent = `這台裝置已有「${formatGroupTitle(existing)}」的分享紀錄`;

    const finishImport = (keepDone) => {
      importModal.hidden = true;
      Store.applyImportedGroup(payload, { keepDone, targetGroupId: existing.id });
      switchView('setup');
      announce('已載入排組雷達名單，確認座位後即可開始分享');
    };
    keepBtn.onclick = () => finishImport(true);
    resetBtn.onclick = () => finishImport(false);
    importModal.hidden = false;
    switchView('setup');
    return true;
  }

  Store.applyImportedGroup(payload, { keepDone: false });
  // 依現場流程：從排組雷達打開後，先進到「名單設定」畫面讓家長確認／微調座位後按「完成，開始分享」
  switchView('setup');
  announce('已自動載入排組雷達小組名單');
  return true;
}

window.addEventListener('hashchange', () => {
  engine.clear();
  consumeIncomingHash();
});

// 鍵盤快捷鍵：空白鍵暫停／繼續、Esc 關閉彈窗或抽屜
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

// 頁面可見度與背景恢復
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

// 同瀏覽器多分頁同步
window.addEventListener('storage', (e) => {
  if (e.key !== STORAGE_KEY || engine.isActive()) return;
  Store.reloadFromStorage();
  if (currentView === 'setup') setupView.render();
  else timerView.renderAll();
});

// 離線快取與連線燈號顯示
function syncOfflineBadges() {
  const ready = Boolean(navigator.serviceWorker && navigator.serviceWorker.controller);
  const text = !navigator.onLine ? '離線運作中' : ready ? '可離線' : '可離線';
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

// 初始啟動路由：若帶 #g=... 則進入名單設定確認；若無名單也直接進入名單設定（不產生假資料）
if (!consumeIncomingHash()) {
  if (Store.hasActiveMembers()) {
    switchView('timer');
  } else {
    switchView('setup');
  }
}
syncOfflineBadges();

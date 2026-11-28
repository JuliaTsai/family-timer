/* 組別分享連結產生器、網址列 Hash 即時同步與「分享此組／複製連結」動作管理
   解決痛點：使用者修改名單、換座位或新增另一組後，隨時點「分享此組／複製連結」或複製瀏覽器網址列，
   發出去的 100% 是目前畫面上最新的組別與座位順序，不會殘留舊組別網址。 */

import {
  cleanPersonName, cleanText, normalizeGender, normalizeMeta, normalizeRole,
  PARENT_INDEX, SUB_PARENT_INDEX, TOTAL_SEATS,
} from './codec.js';
import { createIcon } from './icons.js';
import { formatGroupTitle, Store } from './store.js';

const SELF_HASH_KEY = 'familyTimer.selfHash';

/** 將目前組別（含修改後姓名、性別、角色標籤與排好的 12 座位順序）編碼為 #g=<Base64URL>；空白組回傳 '' */
export function encodeGroupToHash(group) {
  if (!group) return '';
  const course = cleanText(group.course, 30);
  const family = cleanText(group.family, 30);
  const hasAnyName = Array.isArray(group.seats) && group.seats.some((s) => cleanPersonName(s?.name));
  if (!course && !family && !hasAnyName) return '';

  const s = Array.from({ length: TOTAL_SEATS }, (_, idx) => {
    const seat = group.seats?.[idx] || {};
    const name = cleanPersonName(seat.name);
    const gender = name ? normalizeGender(seat.gender) : '';
    const role = idx === PARENT_INDEX ? 'P' : idx === SUB_PARENT_INDEX ? 'S' : normalizeRole(seat.role);
    const meta = name ? normalizeMeta(seat.meta) : null;
    return meta ? [name, gender, role, meta] : [name, gender, role];
  });

  const payload = { v: 1, c: course, f: family, ...(group.isAdvanced ? { adv: 1 } : {}), s };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64url = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `#g=${b64url}`;
}

function getSessionHash() {
  try { return window.sessionStorage.getItem(SELF_HASH_KEY) || ''; } catch { return ''; }
}

function setSessionHash(h) {
  try {
    if (h) window.sessionStorage.setItem(SELF_HASH_KEY, h);
    else window.sessionStorage.removeItem(SELF_HASH_KEY);
  } catch { /* ignore */ }
}

/** 判斷目前網址列上的 #g=... 是否為本分頁自己剛同步寫入的（避免重新整理時誤彈覆寫詢問） */
export function isSelfSyncedHash(hashStr) {
  const cur = String(hashStr || '');
  return Boolean(cur && cur === getSessionHash());
}

/** 將目前啟用組別即時同步至瀏覽器網址列 #g=...，讓瀏覽器原生分享或複製網址永遠拿到最新名單 */
export function syncUrlHashWithActiveGroup() {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  const g = Store.getActiveGroup();
  const hash = encodeGroupToHash(g);
  const base = window.location.pathname + window.location.search;
  try {
    setSessionHash(hash);
    window.history.replaceState(null, '', hash ? `${base}${hash}` : base);
  } catch { /* ignore */ }
}

/** 產生目前組別可供分享的完整絕對網址 */
export function buildActiveGroupShareUrl() {
  const g = Store.getActiveGroup();
  const hash = encodeGroupToHash(g);
  const originBase = window.location.origin + window.location.pathname + window.location.search;
  return { group: g, hash, url: hash ? `${originBase}${hash}` : originBase };
}

async function copyTextSafe(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch { /* fallback below */ }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', 'true');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export function createToastController(toastEl) {
  let timer = null;
  return function showToast(message, durationMs = 3800) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.hidden = false;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      toastEl.hidden = true;
    }, durationMs);
  };
}

/** 綁定全站「分享此組」與「複製連結」按鈕（支援 iOS/Android 原生分享、LINE 內建瀏覽器防舊連結提示與剪貼簿備援） */
export function initShareActions({ showToast, announce }) {
  const shareBtns = document.querySelectorAll('[data-action="share-group"]');
  const copyBtns = document.querySelectorAll('[data-action="copy-group-link"]');

  shareBtns.forEach((btn) => btn.prepend(createIcon('share', { size: 17, className: 'btn-ico' })));
  copyBtns.forEach((btn) => btn.prepend(createIcon('link', { size: 17, className: 'btn-ico' })));

  const isLineInApp = () => /\bLine\//i.test(navigator.userAgent || '');

  const notifyMsg = (msg) => {
    showToast(msg);
    if (announce) announce(msg);
  };

  async function doCopy() {
    if (document.activeElement instanceof HTMLElement && document.activeElement.matches('input, textarea')) {
      document.activeElement.dispatchEvent(new Event('input', { bubbles: true }));
    }
    syncUrlHashWithActiveGroup();
    const { group, hash, url } = buildActiveGroupShareUrl();
    if (!hash) {
      notifyMsg('請先輸入課程組別或至少一位成員姓名，再分享連結');
      return;
    }
    const title = formatGroupTitle(group);
    const ok = await copyTextSafe(url);
    if (ok) {
      notifyMsg(
        isLineInApp()
          ? `已複製「${title}」最新連結！請直接回聊天室貼上（勿用 LINE 右上角選單分享舊網址）`
          : `已複製「${title}」最新名單連結，可直接貼到 LINE 分享！`
      );
    } else {
      notifyMsg('無法自動複製，請長按複製網址列連結');
    }
  }

  async function doShare() {
    if (document.activeElement instanceof HTMLElement && document.activeElement.matches('input, textarea')) {
      document.activeElement.dispatchEvent(new Event('input', { bubbles: true }));
    }
    syncUrlHashWithActiveGroup();
    const { group, hash, url } = buildActiveGroupShareUrl();
    if (!hash) {
      notifyMsg('請先輸入課程組別或至少一位成員姓名，再分享連結');
      return;
    }
    const title = `${formatGroupTitle(group)}｜家庭分享計時`;

    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        notifyMsg(`已分享「${formatGroupTitle(group)}」最新名單`);
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    await doCopy();
  }

  shareBtns.forEach((btn) => btn.addEventListener('click', doShare));
  copyBtns.forEach((btn) => btn.addEventListener('click', doCopy));
}

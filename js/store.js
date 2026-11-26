/* 本機狀態管理（localStorage 多組別獨立存檔，無伺服器、零預設假名單） */

import { cleanPersonName, cleanText, emptySeats, normalizeGender, TOTAL_SEATS } from './codec.js';

export const STORAGE_KEY = 'familyTimer.v2';
export const DEFAULT_DURATION = 60;
export const MIN_DURATION = 5;
export const MAX_DURATION = 59 * 60 + 55;
export const DEFAULT_OVERTIME_FULL = 30;

const storage = (() => {
  try {
    const k = '__family_timer_probe__';
    window.localStorage.setItem(k, k);
    window.localStorage.removeItem(k);
    return window.localStorage;
  } catch {
    return null;
  }
})();

let seq = 0;
function makeId() {
  return 'grp_' + Date.now().toString(36) + '_' + (seq++).toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

export function clampDuration(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n)) return DEFAULT_DURATION;
  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(n)));
}

export function clampOvertimeFull(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n) || n < 10) return DEFAULT_OVERTIME_FULL;
  return Math.min(1800, Math.round(n));
}

export function normalizeGroupIdentity(course, family) {
  const c = cleanText(course, 30).toLowerCase();
  const f = cleanText(family, 30).toLowerCase();
  if (!c && !f) return '';
  return `${c}::${f}`;
}

export function formatGroupTitle(group) {
  const c = cleanText(group?.course, 30);
  const f = cleanText(group?.family, 30);
  if (c && f) return `${c} · ${f}`;
  return f || c || '未命名小組';
}

function sanitizeSeats(rawSeats) {
  const base = emptySeats();
  if (!Array.isArray(rawSeats)) return base;
  rawSeats.slice(0, TOTAL_SEATS).forEach((s, idx) => {
    if (!s || typeof s !== 'object') return;
    const name = cleanPersonName(s.name);
    base[idx] = {
      slot: idx + 1,
      name,
      gender: name ? normalizeGender(s.gender) : '',
      done: Boolean(name && s.done === true),
    };
  });
  return base;
}

function sanitizeGroup(raw, fallbackId) {
  const id = typeof raw?.id === 'string' && raw.id ? raw.id : fallbackId || makeId();
  return {
    id,
    course: cleanText(raw?.course, 30),
    family: cleanText(raw?.family, 30),
    duration: clampDuration(raw?.duration),
    overtimeFullSec: clampOvertimeFull(raw?.overtimeFullSec),
    updatedAt: Number(raw?.updatedAt) || Date.now(),
    seats: sanitizeSeats(raw?.seats),
  };
}

export function createBlankGroup(course = '', family = '') {
  return sanitizeGroup({ id: makeId(), course, family, seats: emptySeats() });
}

function loadStoreData() {
  if (!storage) {
    const g = createBlankGroup();
    return { activeGroupId: g.id, groups: { [g.id]: g } };
  }
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.groups === 'object' && parsed.groups !== null) {
        const groups = {};
        for (const [k, v] of Object.entries(parsed.groups)) {
          const g = sanitizeGroup(v, k);
          groups[g.id] = g;
        }
        const ids = Object.keys(groups);
        if (ids.length > 0) {
          const activeId = groups[parsed.activeGroupId] ? parsed.activeGroupId : ids[0];
          return { activeGroupId: activeId, groups };
        }
      }
    }
  } catch {
    /* ignore corrupted data */
  }
  const blank = createBlankGroup();
  return { activeGroupId: blank.id, groups: { [blank.id]: blank } };
}

const db = loadStoreData();

export const Store = {
  save() {
    if (!storage) return;
    try {
      const active = this.getActiveGroup();
      if (active) active.updatedAt = Date.now();
      storage.setItem(STORAGE_KEY, JSON.stringify({
        version: 2,
        activeGroupId: db.activeGroupId,
        groups: db.groups,
      }));
    } catch {
      /* quota / private browsing */
    }
  },

  reloadFromStorage() {
    const fresh = loadStoreData();
    db.activeGroupId = fresh.activeGroupId;
    db.groups = fresh.groups;
  },

  getActiveGroup() {
    if (!db.groups[db.activeGroupId]) {
      const firstId = Object.keys(db.groups)[0];
      if (firstId) db.activeGroupId = firstId;
      else {
        const g = createBlankGroup();
        db.groups[g.id] = g;
        db.activeGroupId = g.id;
      }
    }
    return db.groups[db.activeGroupId];
  },

  listGroups() {
    return Object.values(db.groups).sort((a, b) => b.updatedAt - a.updatedAt);
  },

  hasActiveMembers(group = this.getActiveGroup()) {
    return Boolean(group && group.seats.some((s) => s.name.length > 0));
  },

  activeSeats(group = this.getActiveGroup()) {
    return group ? group.seats.filter((s) => s.name.length > 0) : [];
  },

  findGroupByIdentity(course, family) {
    const target = normalizeGroupIdentity(course, family);
    if (!target) return null;
    return Object.values(db.groups).find((g) => normalizeGroupIdentity(g.course, g.family) === target) || null;
  },

  switchGroup(groupId) {
    if (!db.groups[groupId]) return false;
    db.activeGroupId = groupId;
    this.save();
    return true;
  },

  createAndSwitchGroup(course = '', family = '') {
    const g = createBlankGroup(course, family);
    db.groups[g.id] = g;
    db.activeGroupId = g.id;
    this.save();
    return g;
  },

  deleteGroup(groupId) {
    const ids = Object.keys(db.groups);
    if (!db.groups[groupId]) return;
    if (ids.length <= 1) {
      // 只剩最後一組時清空成新空白組
      const blank = createBlankGroup();
      db.groups = { [blank.id]: blank };
      db.activeGroupId = blank.id;
    } else {
      delete db.groups[groupId];
      if (db.activeGroupId === groupId) {
        db.activeGroupId = this.listGroups()[0].id;
      }
    }
    this.save();
  },

  /**
   * 套用外部（排組雷達連結 / 貼上 / OCR）載入的名單：
   * keepDone = true 時，同名成員保留原本的已分享狀態
   */
  applyImportedGroup({ course, family, seats }, { keepDone = false, targetGroupId = null } = {}) {
    let target = (targetGroupId && db.groups[targetGroupId]) || this.findGroupByIdentity(course, family);
    if (!target) {
      // 若目前作用中組別是全空的草稿，直接覆用該草稿，不製造多餘空組
      const cur = this.getActiveGroup();
      if (!this.hasActiveMembers(cur) && !cur.course && !cur.family) {
        target = cur;
      } else {
        target = createBlankGroup(course, family);
        db.groups[target.id] = target;
      }
    }
    const prevDoneByName = new Map();
    if (keepDone) {
      target.seats.forEach((s) => {
        if (s.name && s.done) prevDoneByName.set(s.name, true);
      });
    }
    if (course) target.course = cleanText(course, 30);
    if (family) target.family = cleanText(family, 30);
    target.seats = sanitizeSeats(seats).map((s) => ({
      ...s,
      done: Boolean(keepDone && s.name && prevDoneByName.get(s.name)),
    }));
    db.activeGroupId = target.id;
    this.save();
    return target;
  },

  resetDoneStatus() {
    const g = this.getActiveGroup();
    g.seats.forEach((s) => { s.done = false; });
    this.save();
  },
};

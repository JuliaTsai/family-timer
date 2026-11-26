/* 本機狀態管理（localStorage 多組別獨立存檔）
   - seats[0] 永遠為「家長」，seats[1] 永遠為「副家長」，seats[2..11] 為 10 個可拖曳換位之組員槽
   - 支援「桌次座位 (table)」與「就地圍圈純計時 (circle：以家長為起點，順時針／逆時針，不看人名)」雙模式 */

import { cleanPersonName, cleanText, emptySeats, normalizeGender, PARENT_INDEX, SUB_PARENT_INDEX, TOTAL_SEATS } from './codec.js';

export const STORAGE_KEY = 'familyTimer.v2';
export const DEFAULT_DURATION = 60;
export const MIN_DURATION = 5;
export const MAX_DURATION = 59 * 60 + 55;
export const DEFAULT_OVERTIME_FULL = 30;
const SEAT_SCHEMA_VERSION = 2; // v2: 0=家長, 1=副家長

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

export function clampCircleTotal(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return TOTAL_SEATS;
  return Math.min(24, Math.max(2, v));
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

export function isLockedRoleIndex(idx) {
  return idx === PARENT_INDEX || idx === SUB_PARENT_INDEX;
}

function sanitizeSeats(rawSeats, rawSchemaVersion) {
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
  // 相容升級：舊版 schema (家長在 index 7) 自動將 index 7 與 index 0 對調
  if (rawSchemaVersion !== SEAT_SCHEMA_VERSION && (base[7].name || base[0].name)) {
    const oldZero = { ...base[0], slot: 8 };
    const oldParent = { ...base[7], slot: 1 };
    base[0] = oldParent;
    base[7] = oldZero;
  }
  return base;
}

function sanitizeCircle(rawCircle, activeMemberCount) {
  const defaultTotal = activeMemberCount >= 2 ? activeMemberCount : TOTAL_SEATS;
  const total = clampCircleTotal(rawCircle?.total ?? defaultTotal);
  const direction = rawCircle?.direction === 'ccw' ? 'ccw' : 'cw';
  const done = Array.isArray(rawCircle?.done)
    ? rawCircle.done.filter((i) => Number.isInteger(i) && i >= 0 && i < total)
    : [];
  return { direction, total, done: [...new Set(done)] };
}

function sanitizeGroup(raw, fallbackId) {
  const id = typeof raw?.id === 'string' && raw.id ? raw.id : fallbackId || makeId();
  const seats = sanitizeSeats(raw?.seats, raw?.seatSchema);
  const activeCount = seats.filter((s) => s.name).length;
  const shareMode = raw?.shareMode === 'circle' ? 'circle' : 'table';
  return {
    id,
    seatSchema: SEAT_SCHEMA_VERSION,
    course: cleanText(raw?.course, 30),
    family: cleanText(raw?.family, 30),
    duration: clampDuration(raw?.duration),
    overtimeFullSec: clampOvertimeFull(raw?.overtimeFullSec),
    shareMode,
    circle: sanitizeCircle(raw?.circle, activeCount),
    updatedAt: Number(raw?.updatedAt) || Date.now(),
    seats,
  };
}

export function createBlankGroup(course = '', family = '') {
  return sanitizeGroup({ id: makeId(), seatSchema: SEAT_SCHEMA_VERSION, course, family, seats: emptySeats() });
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
    /* ignore */
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
      const blank = createBlankGroup();
      db.groups = { [blank.id]: blank };
      db.activeGroupId = blank.id;
    } else {
      delete db.groups[groupId];
      if (db.activeGroupId === groupId) db.activeGroupId = this.listGroups()[0].id;
    }
    this.save();
  },

  /**
   * 交換兩個組員座位（第 3~12 格，即 index 2..11）：
   * 家長 (index 0) 與副家長 (index 1) 固定鎖定不可交換。
   */
  swapMemberSeats(idxA, idxB) {
    if (idxA === idxB) return false;
    if (isLockedRoleIndex(idxA) || isLockedRoleIndex(idxB)) return false;
    const g = this.getActiveGroup();
    if (!g.seats[idxA] || !g.seats[idxB]) return false;
    const a = { ...g.seats[idxA], slot: idxB + 1 };
    const b = { ...g.seats[idxB], slot: idxA + 1 };
    g.seats[idxA] = b;
    g.seats[idxB] = a;
    this.save();
    return true;
  },

  syncCircleTotalFromRoster(group = this.getActiveGroup()) {
    const count = this.activeSeats(group).length;
    if (count >= 2) {
      group.circle.total = clampCircleTotal(count);
      group.circle.done = group.circle.done.filter((i) => i < group.circle.total);
    }
  },

  applyImportedGroup({ course, family, seats }, { keepDone = false, targetGroupId = null } = {}) {
    let target = (targetGroupId && db.groups[targetGroupId]) || this.findGroupByIdentity(course, family);
    if (!target) {
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
    target.seatSchema = SEAT_SCHEMA_VERSION;
    target.seats = sanitizeSeats(seats, SEAT_SCHEMA_VERSION).map((s) => ({
      ...s,
      done: Boolean(keepDone && s.name && prevDoneByName.get(s.name)),
    }));
    this.syncCircleTotalFromRoster(target);
    db.activeGroupId = target.id;
    this.save();
    return target;
  },

  resetDoneStatus() {
    const g = this.getActiveGroup();
    if (g.shareMode === 'circle') {
      g.circle.done = [];
    } else {
      g.seats.forEach((s) => { s.done = false; });
    }
    this.save();
  },
};

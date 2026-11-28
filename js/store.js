/* 本機狀態管理（localStorage 多組別獨立存檔）
   - seats[0] 永遠為「家長」('P')，seats[1] 永遠為「副家長」('S')
   - 大堂課預設 seats[2] 為「小天使{}」('A1')、seats[3] 為「小天使{}.」('A2')；拖曳換座位時 role 跟著人一起移動 */

import {
  ANGEL1_INDEX, ANGEL2_INDEX, cleanPersonName, cleanText, emptySeats,
  normalizeGender, normalizeMeta, normalizeRole, PARENT_INDEX, SUB_PARENT_INDEX, TOTAL_SEATS,
} from './codec.js';

export const STORAGE_KEY = 'familyTimer.v2';
export const DEFAULT_DURATION = 60;
export const MIN_DURATION = 5;
export const MAX_DURATION = 59 * 60 + 55;
export const DEFAULT_OVERTIME_FULL = 30;
const SEAT_SCHEMA_VERSION = 3; // v3: 保留每位組員的 A1(小天使{}) / A2(小天使{}.) 角色標籤

const storage = (() => {
  try {
    const k = '__family_timer_probe__';
    window.localStorage.setItem(k, k);
    window.localStorage.removeItem(k);
    return window.localStorage;
  } catch { return null; }
})();

let seq = 0;
const makeId = () => 'grp_' + Date.now().toString(36) + '_' + (seq++).toString(36) + '_' + Math.random().toString(36).slice(2, 6);

export function clampDuration(sec) {
  const n = Number(sec);
  return Number.isFinite(n) ? Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(n))) : DEFAULT_DURATION;
}

export function clampOvertimeFull(sec) {
  const n = Number(sec);
  return Number.isFinite(n) && n >= 10 ? Math.min(1800, Math.round(n)) : DEFAULT_OVERTIME_FULL;
}

export function clampCircleTotal(n) {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(24, Math.max(2, v)) : TOTAL_SEATS;
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

function sanitizeSeats(rawSeats, rawSchemaVersion, isAdvanced) {
  const base = emptySeats({ isAdvanced });
  if (!Array.isArray(rawSeats)) return base;
  rawSeats.slice(0, TOTAL_SEATS).forEach((s, idx) => {
    if (!s || typeof s !== 'object') return;
    const name = cleanPersonName(s.name);
    const savedRole = normalizeRole(s.role);
    const role = idx === PARENT_INDEX ? 'P'
      : idx === SUB_PARENT_INDEX ? 'S'
      : savedRole === 'A1' || savedRole === 'A2' ? savedRole
      : '';
    base[idx] = {
      slot: idx + 1,
      name,
      gender: name ? normalizeGender(s.gender) : '',
      role,
      meta: name ? normalizeMeta(s.meta) : null,
      done: Boolean(name && s.done === true),
    };
  });
  if ((!rawSchemaVersion || rawSchemaVersion < 2) && (base[7].name || base[0].name)) {
    const oldZero = { ...base[0], slot: 8, role: '' };
    base[0] = { ...base[7], slot: 1, role: 'P' };
    base[7] = oldZero;
  }
  if (!isAdvanced && (!rawSchemaVersion || rawSchemaVersion < 3)) {
    if (!base.some((s) => s.role === 'A1' || s.role === 'A2')) {
      base[ANGEL1_INDEX].role = 'A1';
      base[ANGEL2_INDEX].role = 'A2';
    }
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
  const isAdvanced = Boolean(raw?.isAdvanced);
  const seats = sanitizeSeats(raw?.seats, raw?.seatSchema, isAdvanced);
  const activeCount = seats.filter((s) => s.name).length;
  const shareMode = raw?.shareMode === 'circle' ? 'circle' : 'table';
  return {
    id,
    seatSchema: SEAT_SCHEMA_VERSION,
    isAdvanced,
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

let onSaveListener = null;

export const Store = {
  onSave(fn) { onSaveListener = fn; },

  save() {
    if (storage) {
      try {
        const active = this.getActiveGroup();
        if (active) active.updatedAt = Date.now();
        storage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, activeGroupId: db.activeGroupId, groups: db.groups }));
      } catch { /* quota / private browsing */ }
    }
    if (onSaveListener) onSaveListener();
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

  /** 交換兩個組員座位（index 2..11），小天使標籤隨人一起移動；正副家長 (0, 1) 固定鎖定 */
  swapMemberSeats(idxA, idxB) {
    if (idxA === idxB || isLockedRoleIndex(idxA) || isLockedRoleIndex(idxB)) return false;
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

  applyImportedGroup({ course, family, isAdvanced = false, seats }, { keepDone = false, targetGroupId = null } = {}) {
    let target = (targetGroupId && db.groups[targetGroupId]) || this.findGroupByIdentity(course, family);
    if (!target) {
      const cur = this.getActiveGroup();
      if (!this.hasActiveMembers(cur) && !cur.course && !cur.family) target = cur;
      else {
        target = createBlankGroup(course, family);
        db.groups[target.id] = target;
      }
    }
    const prevDoneByName = new Map();
    if (keepDone) {
      target.seats.forEach((s) => { if (s.name && s.done) prevDoneByName.set(s.name, true); });
    }
    if (course) target.course = cleanText(course, 30);
    if (family) target.family = cleanText(family, 30);
    target.isAdvanced = Boolean(isAdvanced);
    target.seatSchema = SEAT_SCHEMA_VERSION;
    target.seats = sanitizeSeats(seats, SEAT_SCHEMA_VERSION, target.isAdvanced).map((s) => ({
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
    if (g.shareMode === 'circle') g.circle.done = [];
    else g.seats.forEach((s) => { s.done = false; });
    this.save();
  },
};

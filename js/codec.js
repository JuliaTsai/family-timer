/* URL Hash (#g=...) 免後端名單解碼器 ＋ 一次貼上／紙本 OCR 智慧姓名座位解析
   預設名單順序（大堂課）：
   - 第 1 格 (index 0)：家長 ('P')
   - 第 2 格 (index 1)：副家長 ('S')
   - 第 3 格 (index 2)：小天使{} ('A1')
   - 第 4 格 (index 3)：小天使{}. ('A2')
   - 第 5~12 格 (index 4..11)：組員 ('') */

export const TOTAL_SEATS = 12;
export const PARENT_INDEX = 0;
export const SUB_PARENT_INDEX = 1;
export const ANGEL1_INDEX = 2;
export const ANGEL2_INDEX = 3;
export const MEMBER_SEAT_INDICES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const STUDENT_FIRST_INDICES = [4, 5, 6, 7, 8, 9, 10, 11, 2, 3];

const MAX_NAME_LEN = 24;
const HEADER_NOISE_RE = /^(?:(?:執事|學員姓名|姓名|介紹人|介紹人電話|公司名稱|職稱|電話|手機|Line[- ]?ID|性別|生日|年齡|關懷體系|聯誼會籍|便當|備註)(?:\s+(?:執事|學員姓名|姓名|介紹人|介紹人電話|公司名稱|職稱|電話|手機|Line[- ]?ID|性別|生日|年齡|小天使|關懷員|關懷體系|關懷長|聯誼會籍|便當|備註))*|人數[:：].*)$/i;

export function cleanText(str, maxLen = 40) {
  return String(str || '').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

export function cleanPersonName(str) {
  return cleanText(str, MAX_NAME_LEN);
}

export function normalizeGender(raw) {
  const s = String(raw || '').trim().toUpperCase();
  if (s === 'F' || s === '女' || s === '♀' || s === '◯') return 'F';
  if (s === 'M' || s === '男' || s === '♂' || s === '▢') return 'M';
  return '';
}

export function normalizeRole(raw) {
  const s = String(raw || '').trim();
  if (s === 'P' || s === 'parent') return 'P';
  if (s === 'S' || s === 'sub_parent') return 'S';
  if (s === 'A1' || s === 'senior1') return 'A1';
  if (s === 'A2' || s === 'senior2') return 'A2';
  return '';
}

/** 從「第 16 家庭 / 16 / 第 3 組」擷取編號數字，組出 小天使{16} 與 小天使{16}. */
export function extractFamilyNo(familyStr) {
  const m = String(familyStr || '').match(/\d+/);
  return m ? m[0] : '';
}

export function formatRoleLabel(role, familyStr = '') {
  if (role === 'P') return '家長';
  if (role === 'S') return '副家長';
  const no = extractFamilyNo(familyStr);
  if (role === 'A1') return `小天使${no}`;
  if (role === 'A2') return `小天使${no}.`;
  return '';
}

/** 正規化排座位背景資訊（公司、職稱、介紹人、關懷員、小天使、年齡、生命數字、主命數；全空回傳 null） */
export function normalizeMeta(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  const co = cleanText(raw.co, 40);
  const ti = cleanText(raw.ti, 28);
  const intro = cleanText(raw.in, 32);
  const cm = cleanText(raw.cm, 32);
  const la = cleanText(raw.la, 32);
  const ag = Number(raw.ag);
  const ln = cleanText(raw.ln, 24);
  const mn = cleanText(raw.mn, 8);
  if (co) out.co = co;
  if (ti) out.ti = ti;
  if (intro) out.in = intro;
  if (cm) out.cm = cm;
  if (la) out.la = la;
  if (Number.isFinite(ag) && ag > 0 && ag <= 120) out.ag = Math.round(ag);
  if (ln) out.ln = ln;
  if (mn) out.mn = mn;
  return Object.keys(out).length ? out : null;
}

export function emptySeats({ isAdvanced = false } = {}) {
  return Array.from({ length: TOTAL_SEATS }, (_, i) => ({
    slot: i + 1,
    name: '',
    gender: '',
    role: i === PARENT_INDEX ? 'P'
      : i === SUB_PARENT_INDEX ? 'S'
      : !isAdvanced && i === ANGEL1_INDEX ? 'A1'
      : !isAdvanced && i === ANGEL2_INDEX ? 'A2'
      : '',
    meta: null,
    done: false,
  }));
}

/**
 * 將「角色成員清單」排入 12 格名單：
 * - 'P' -> index 0, 'S' -> index 1, 'A1' -> index 2, 'A2' -> index 3
 * - 一般學員優先填入 index 4..11（進階課無小天使時由 index 2 起填）
 */
export function assignMembersTo12Seats(items, { isAdvanced = false } = {}) {
  const seats = emptySeats({ isAdvanced });
  const others = [];

  for (const item of items) {
    const name = cleanPersonName(item.name);
    if (!name) continue;
    const gender = normalizeGender(item.gender);
    const role = normalizeRole(item.role);
    const meta = normalizeMeta(item.meta);
    if (role === 'P' && !seats[PARENT_INDEX].name) {
      Object.assign(seats[PARENT_INDEX], { name, gender, role: 'P', meta });
    } else if (role === 'S' && !seats[SUB_PARENT_INDEX].name) {
      Object.assign(seats[SUB_PARENT_INDEX], { name, gender, role: 'S', meta });
    } else if (role === 'A1' && !seats[ANGEL1_INDEX].name) {
      Object.assign(seats[ANGEL1_INDEX], { name, gender, role: 'A1', meta });
    } else if (role === 'A2' && !seats[ANGEL2_INDEX].name) {
      Object.assign(seats[ANGEL2_INDEX], { name, gender, role: 'A2', meta });
    } else {
      others.push({ name, gender, role, meta });
    }
  }

  const fillOrder = isAdvanced
    ? [...MEMBER_SEAT_INDICES, PARENT_INDEX, SUB_PARENT_INDEX]
    : [...STUDENT_FIRST_INDICES, PARENT_INDEX, SUB_PARENT_INDEX];
  let cursor = 0;
  for (const person of others) {
    while (cursor < fillOrder.length && seats[fillOrder[cursor]].name) cursor++;
    if (cursor >= fillOrder.length) break;
    const targetIdx = fillOrder[cursor];
    seats[targetIdx].name = person.name;
    seats[targetIdx].gender = person.gender;
    seats[targetIdx].meta = person.meta;
    if (person.role && targetIdx >= 2) seats[targetIdx].role = person.role;
    cursor++;
  }
  return seats;
}

/** Base64URL → UTF-8 JSON 解碼（支援排組雷達傳入的 #g=...） */
export function decodeUrlHashPayload(hashStr) {
  const raw = String(hashStr || '').replace(/^#/, '');
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const encoded = params.get('g');
  if (!encoded) return null;

  try {
    const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const bin = atob(pad);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const json = JSON.parse(new TextDecoder('utf-8').decode(bytes));
    if (!json || typeof json !== 'object') return null;

    const course = cleanText(json.c || json.course || '', 30);
    const family = cleanText(json.f || json.family || '', 30);
    const isAdvanced = Boolean(json.adv);

    if (Array.isArray(json.s)) {
      const seats = emptySeats({ isAdvanced });
      json.s.slice(0, TOTAL_SEATS).forEach((row, idx) => {
        if (Array.isArray(row)) {
          seats[idx].name = cleanPersonName(row[0]);
          seats[idx].gender = normalizeGender(row[1]);
          if (row[2] !== undefined && idx >= 2) seats[idx].role = normalizeRole(row[2]);
          if (row[3] !== undefined) seats[idx].meta = normalizeMeta(row[3]);
        }
      });
      return { course, family, isAdvanced, seats };
    }

    if (Array.isArray(json.p)) {
      const items = json.p
        .filter((r) => Array.isArray(r) && r[0])
        .map(([name, gender, role, meta]) => ({
          name: cleanPersonName(String(name).replace(/^\d+[_\s]+/, '').replace(/\(.*?\)|（.*?）/g, '')),
          gender: normalizeGender(gender),
          role: normalizeRole(role),
          meta: normalizeMeta(meta),
        }));
      return { course, family, isAdvanced, seats: assignMembersTo12Seats(items, { isAdvanced }) };
    }
    return null;
  } catch {
    return null;
  }
}

/** 解析「一次貼上多個名字」或「紙本名單 OCR 結果」 */
export function parseRosterText(rawText, { isAdvanced = false } = {}) {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/[|｜\t]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  let detectedCourse = '';
  let detectedFamily = '';
  const parsedRows = [];
  let hasExplicitRole = false;
  let angelSeenCount = 0;

  for (const line of lines) {
    if (HEADER_NOISE_RE.test(line)) continue;

    const cohortMatch = line.match(/\b(\d{1,2}\s*-\s*\d{1,3})\s*期?\b/);
    const familyMatch = line.match(/(第\s*\d+\s*(?:家庭|組))/);
    if ((cohortMatch || familyMatch) && (line.includes('家庭') || line.includes('人數') || line.endsWith('期') || line === cohortMatch?.[0])) {
      if (cohortMatch && !detectedCourse) detectedCourse = cohortMatch[1].replace(/\s+/g, '');
      if (familyMatch && !detectedFamily) detectedFamily = familyMatch[1].replace(/\s+/g, ' ').replace(/第\s*(\d+)\s*/, '第 $1 ');
      continue;
    }

    let rest = line;
    let role = '';

    if (/(?:^|\s)副家長\d*\.?(?:\s|$|:|：)/.test(rest) || /^副家長\d*/.test(rest)) {
      role = 'S';
      hasExplicitRole = true;
      rest = rest.replace(/^.*?副家長\d*\.?[:：\s]*/, '');
    } else if (/(?:^|\s)(?:家長|組長)\d*\.?(?:\s|$|:|：)/.test(rest) || /^(?:家長|組長)\d*/.test(rest)) {
      role = 'P';
      hasExplicitRole = true;
      rest = rest.replace(/^.*?(?:家長|組長)\d*\.?[:：\s]*/, '');
    } else if (/^(?:小天使\d*\.|複訓\s*2)/.test(rest)) {
      role = 'A2';
      hasExplicitRole = true;
      rest = rest.replace(/^(?:小天使\d*\.|複訓\s*2)[:：\s]*/, '');
    } else if (/^(?:小天使\d*|複訓\s*1?)/.test(rest)) {
      angelSeenCount++;
      role = angelSeenCount >= 2 ? 'A2' : 'A1';
      hasExplicitRole = true;
      rest = rest.replace(/^(?:小天使\d*|複訓\s*1?)[:：\s]*/, '');
    } else {
      rest = rest
        .replace(/^(?:新生|組員)\d*\.?[:：\s]*/, '')
        .replace(/^\d{1,3}\s*[-–—.]\s*\d{1,2}\s*/, '')
        .replace(/^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫\d]{1,2}[.、)）:：\s]+/, '');
    }

    let gender = '';
    if (/(?:^|\s|[（(])([♀◯]|女)(?:$|\s|[)）])/.test(rest)) {
      gender = 'F';
      rest = rest.replace(/(?:^|\s|[（(])([♀◯]|女)(?:$|\s|[)）])/g, ' ');
    } else if (/(?:^|\s|[（(])([♂▢]|男)(?:$|\s|[)）])/.test(rest)) {
      gender = 'M';
      rest = rest.replace(/(?:^|\s|[（(])([♂▢]|男)(?:$|\s|[)）])/g, ' ');
    }

    rest = rest
      .replace(/^\d{3,6}[_\s]+/, '')
      .replace(/09\d{2}[-\s]?\d{3}[-\s]?\d{3}.*$/, '')
      .replace(/\([^)]*\)|（[^）]*）/g, ' ')
      .trim();

    const tokens = rest.split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    let candidate = tokens[0];
    if (/^[\u4e00-\u9fff]$/.test(candidate) && tokens[1] && /^[\u4e00-\u9fff]{1,2}$/.test(tokens[1])) {
      candidate += tokens[1];
      if (candidate.length === 2 && tokens[2] && /^[\u4e00-\u9fff]$/.test(tokens[2])) candidate += tokens[2];
    }

    const name = cleanPersonName(candidate.replace(/^[^\u4e00-\u9fffA-Za-z]+|[^\u4e00-\u9fffA-Za-z·•-]+$/g, ''));
    if (!name || /^\d+$/.test(name)) continue;
    parsedRows.push({ name, gender, role });
  }

  const seats = hasExplicitRole
    ? assignMembersTo12Seats(parsedRows, { isAdvanced })
    : (() => {
        const s = emptySeats({ isAdvanced });
        parsedRows.slice(0, TOTAL_SEATS).forEach((p, idx) => {
          s[idx].name = p.name;
          s[idx].gender = p.gender;
        });
        return s;
      })();

  return { course: detectedCourse, family: detectedFamily, seats, count: seats.filter((s) => s.name).length };
}

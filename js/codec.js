/* URL Hash (#g=...) 免後端名單解碼器 ＋ 一次貼上／紙本 OCR 智慧姓名座位解析
   名單順序規則：第 1 格永遠是「家長」(index 0)，第 2 格永遠是「副家長」(index 1)，第 3~12 格為組員 (index 2..11) */

export const TOTAL_SEATS = 12;
export const PARENT_INDEX = 0;     // 第 1 格永遠是「家長」（桌次模式下固定在正下方中央）
export const SUB_PARENT_INDEX = 1; // 第 2 格永遠是「副家長」（桌次模式下固定在正上方中央）

// 第 3~12 格一般組員索引（可在名單設定與桌次座位上自由拖曳換位）
export const MEMBER_SEAT_INDICES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

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

export function emptySeats() {
  return Array.from({ length: TOTAL_SEATS }, (_, i) => ({
    slot: i + 1,
    name: '',
    gender: '',
    done: false,
  }));
}

/**
 * 將「角色成員清單」排入 12 格名單：
 * - role === 'P'（家長）固定放入第 1 格 (index 0)
 * - role === 'S'（副家長）固定放入第 2 格 (index 1)
 * - 其餘成員依序填入第 3~12 格 (index 2..11)；若正副家長未標示則最後補入空缺
 */
export function assignMembersTo12Seats(items) {
  const seats = emptySeats();
  const others = [];

  for (const item of items) {
    const name = cleanPersonName(item.name);
    if (!name) continue;
    const gender = normalizeGender(item.gender);
    const role = item.role || '';
    if (role === 'P' && !seats[PARENT_INDEX].name) {
      seats[PARENT_INDEX].name = name;
      seats[PARENT_INDEX].gender = gender;
    } else if (role === 'S' && !seats[SUB_PARENT_INDEX].name) {
      seats[SUB_PARENT_INDEX].name = name;
      seats[SUB_PARENT_INDEX].gender = gender;
    } else {
      others.push({ name, gender });
    }
  }

  const fillOrder = [...MEMBER_SEAT_INDICES, PARENT_INDEX, SUB_PARENT_INDEX];
  let cursor = 0;
  for (const person of others) {
    while (cursor < fillOrder.length && seats[fillOrder[cursor]].name) cursor++;
    if (cursor >= fillOrder.length) break;
    seats[fillOrder[cursor]].name = person.name;
    seats[fillOrder[cursor]].gender = person.gender;
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

    if (Array.isArray(json.s)) {
      const seats = emptySeats();
      json.s.slice(0, TOTAL_SEATS).forEach((row, idx) => {
        if (Array.isArray(row)) {
          seats[idx].name = cleanPersonName(row[0]);
          seats[idx].gender = normalizeGender(row[1]);
        }
      });
      return { course, family, seats };
    }

    if (Array.isArray(json.p)) {
      const items = json.p
        .filter((r) => Array.isArray(r) && r[0])
        .map(([name, gender, role]) => ({
          name: cleanPersonName(String(name).replace(/^\d+[_\s]+/, '').replace(/\(.*?\)|（.*?）/g, '')),
          gender: normalizeGender(gender),
          role: role === 'P' || role === 'parent' ? 'P' : role === 'S' || role === 'sub_parent' ? 'S' : '',
        }));
      return { course, family, seats: assignMembersTo12Seats(items) };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 解析「一次貼上多個名字」或「紙本名單 OCR 結果」：
 * - 若內文含有「家長 / 副家長」標籤，自動對位第 1 格（家長）、第 2 格（副家長），其餘排入第 3~12 格
 * - 若為純名字清單，第 1 行填第 1 格（家長）、第 2 行填第 2 格（副家長）、第 3~12 行填組員
 */
export function parseRosterText(rawText) {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/[|｜\t]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  let detectedCourse = '';
  let detectedFamily = '';
  const parsedRows = [];
  let hasExplicitRole = false;

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
    } else {
      rest = rest
        .replace(/^(?:小天使|複訓|新生|組員)\d*\.?[:：\s]*/, '')
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
      if (candidate.length === 2 && tokens[2] && /^[\u4e00-\u9fff]$/.test(tokens[2])) {
        candidate += tokens[2];
      }
    }

    const name = cleanPersonName(candidate.replace(/^[^\u4e00-\u9fffA-Za-z]+|[^\u4e00-\u9fffA-Za-z·•-]+$/g, ''));
    if (!name || /^\d+$/.test(name)) continue;
    parsedRows.push({ name, gender, role });
  }

  let seats;
  if (hasExplicitRole) {
    seats = assignMembersTo12Seats(parsedRows);
  } else {
    seats = emptySeats();
    parsedRows.slice(0, TOTAL_SEATS).forEach((p, idx) => {
      seats[idx].name = p.name;
      seats[idx].gender = p.gender;
    });
  }

  return {
    course: detectedCourse,
    family: detectedFamily,
    seats,
    count: seats.filter((s) => s.name).length,
  };
}

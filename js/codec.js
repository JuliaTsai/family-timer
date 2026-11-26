/* URL Hash (#g=...) 免後端名單解碼器 ＋ 一次貼上／紙本 OCR 智慧姓名座位解析 */

export const TOTAL_SEATS = 12;
export const SUB_PARENT_INDEX = 1; // 第 2 號座位（上中）：副家長
export const PARENT_INDEX = 7;     // 第 8 號座位（下中）：家長

// 除正副家長外的其餘 10 個一般座位索引（對應座號 1, 3, 4, 5, 6, 7, 9, 10, 11, 12）
export const MEMBER_SEAT_INDICES = [0, 2, 3, 4, 5, 6, 8, 9, 10, 11];

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
 * 將「角色成員清單」排入 12 座位：
 * - role === 'P'（家長）放入第 8 號座位 (index 7)
 * - role === 'S'（副家長）放入第 2 號座位 (index 1)
 * - 其餘成員依序填入 1, 3, 4, 5, 6, 7, 9, 10, 11, 12 號空座位；若連正副家長位也空著則最後補入
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

  const fillOrder = [...MEMBER_SEAT_INDICES, SUB_PARENT_INDEX, PARENT_INDEX];
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

    // 格式 1：已排好 12 座位的陣列 json.s = [[name, gender], ...]
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

    // 格式 2：排組雷達角色清單 json.p = [[name, gender, role], ...]
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
  } catch (err) {
    return null;
  }
}

/**
 * 解析「一次貼上多個名字」或「紙本名單 OCR 結果」：
 * - 若內文含有「家長 / 副家長」標籤，自動對位第 8 / 第 2 號座位
 * - 若為純名字清單，依行號直接填入座位 1～12
 * - 同時嘗試擷取紙本頂部的課程代號（如 2-50）與家庭編號（如 第 16 家庭）
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

    // 偵測單獨的期別／家庭標題列（例如「2-50期  第 16 家庭  人數：5 男 7 女」）
    const cohortMatch = line.match(/\b(\d{1,2}\s*-\s*\d{1,3})\s*期?\b/);
    const familyMatch = line.match(/(第\s*\d+\s*(?:家庭|組))/);
    if ((cohortMatch || familyMatch) && (line.includes('家庭') || line.includes('人數') || line.endsWith('期') || line === cohortMatch?.[0])) {
      if (cohortMatch && !detectedCourse) detectedCourse = cohortMatch[1].replace(/\s+/g, '');
      if (familyMatch && !detectedFamily) detectedFamily = familyMatch[1].replace(/\s+/g, ' ').replace(/第\s*(\d+)\s*/, '第 $1 ');
      continue;
    }

    let rest = line;
    let role = '';

    // 1. 角色識別（先判副家長，再判家長）
    if (/(?:^|\s)副家長\d*\.?(?:\s|$|:|：)/.test(rest) || /^副家長\d*/.test(rest)) {
      role = 'S';
      hasExplicitRole = true;
      rest = rest.replace(/^.*?副家長\d*\.?[:：\s]*/, '');
    } else if (/(?:^|\s)(?:家長|組長)\d*\.?(?:\s|$|:|：)/.test(rest) || /^(?:家長|組長)\d*/.test(rest)) {
      role = 'P';
      hasExplicitRole = true;
      rest = rest.replace(/^.*?(?:家長|組長)\d*\.?[:：\s]*/, '');
    } else {
      // 剝除小天使、複訓、新生、座號（如 小天使18. / 18-1 / 01. / ① / 4599_）
      rest = rest
        .replace(/^(?:小天使|複訓|新生|組員)\d*\.?[:：\s]*/, '')
        .replace(/^\d{1,3}\s*[-–—.]\s*\d{1,2}\s*/, '')
        .replace(/^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫\d]{1,2}[.、)）:：\s]+/, '');
    }

    // 2. 性別識別
    let gender = '';
    if (/(?:^|\s|[（(])([♀◯]|女)(?:$|\s|[)）])/.test(rest)) {
      gender = 'F';
      rest = rest.replace(/(?:^|\s|[（(])([♀◯]|女)(?:$|\s|[)）])/g, ' ');
    } else if (/(?:^|\s|[（(])([♂▢]|男)(?:$|\s|[)）])/.test(rest)) {
      gender = 'M';
      rest = rest.replace(/(?:^|\s|[（(])([♂▢]|男)(?:$|\s|[)）])/g, ' ');
    }

    // 3. 剝除系統編號前綴、電話號碼與跨體系括號備註，若同行有多欄只取第一個姓名詞
    rest = rest
      .replace(/^\d{3,6}[_\s]+/, '')
      .replace(/09\d{2}[-\s]?\d{3}[-\s]?\d{3}.*$/, '')
      .replace(/\([^)]*\)|（[^）]*）/g, ' ')
      .trim();

    // 若整列來自多欄表格 OCR（例如「林志威 王大明 0912...」），取第一組姓名 token
    const tokens = rest.split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    let candidate = tokens[0];
    // 若中文單姓與名字中間被 OCR 多切一個空白（如「林 志威」或「吳 珮 綺」），自動合併短中文字
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

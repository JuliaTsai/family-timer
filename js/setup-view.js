/* 名單設定畫面：課程名稱、家庭／組別、12 座位輸入與性別切換、一次貼上、多組切換 */

import { cleanPersonName, cleanText, PARENT_INDEX, parseRosterText, SUB_PARENT_INDEX, TOTAL_SEATS } from './codec.js';
import { createIcon } from './icons.js';
import { formatGroupTitle, Store } from './store.js';

const IME_SETTLE_MS = 100;

export function initSetupView({ root, pasteModal, onOpenOcr, onStartSharing, announce }) {
  const courseInput = root.querySelector('#courseInput');
  const familyInput = root.querySelector('#familyInput');
  const seatCountLabel = root.querySelector('#setupSeatCount');
  const seatsGrid = root.querySelector('#setupSeatsGrid');
  const pasteBtn = root.querySelector('#openPasteBtn');
  const ocrBtn = root.querySelector('#openOcrBtn');
  const finishBtn = root.querySelector('#finishSetupBtn');
  const backToTimerBtn = root.querySelector('#backToTimerBtn');
  const groupSelect = root.querySelector('#setupGroupSelect');
  const newGroupBtn = root.querySelector('#setupNewGroupBtn');

  // 一次貼上彈窗元素
  const pasteTextarea = pasteModal.querySelector('#pasteTextarea');
  const pasteApplyBtn = pasteModal.querySelector('#pasteApplyBtn');
  const pasteCloseBtns = pasteModal.querySelectorAll('[data-paste-close]');

  // 注入按鈕 SVG 圖示
  ocrBtn.prepend(createIcon('camera', { size: 20, className: 'btn-ico' }));
  pasteBtn.prepend(createIcon('paste', { size: 20, className: 'btn-ico' }));
  newGroupBtn.prepend(createIcon('plus', { size: 16, className: 'btn-ico' }));

  let composing = false;
  let compEndedAt = 0;
  const isImeBusy = (e) =>
    composing || Boolean(e && (e.isComposing || e.keyCode === 229)) || Date.now() - compEndedAt < IME_SETTLE_MS;

  root.addEventListener('compositionstart', () => { composing = true; });
  root.addEventListener('compositionend', () => { composing = false; compEndedAt = Date.now(); });

  // 建立 12 個固定座位列 DOM（左欄 1~6、右欄 7~12，第 2 位副家長、第 8 位家長）
  const rowRefs = [];
  const frag = document.createDocumentFragment();

  for (let idx = 0; idx < TOTAL_SEATS; idx++) {
    const slotNum = idx + 1;
    const isSub = idx === SUB_PARENT_INDEX;
    const isParent = idx === PARENT_INDEX;
    const roleText = isSub ? '副家長' : isParent ? '家長' : '';

    const row = document.createElement('div');
    row.className = 'setup-seat-row';
    row.dataset.index = String(idx);

    const lead = document.createElement('span');
    lead.className = 'setup-seat-lead';
    if (roleText) {
      const pill = document.createElement('span');
      pill.className = 'role-pill';
      pill.textContent = roleText;
      lead.appendChild(pill);
    } else {
      lead.textContent = String(slotNum);
    }

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'setup-name-input';
    input.maxLength = 24;
    input.autocomplete = 'off';
    input.enterKeyHint = idx === TOTAL_SEATS - 1 ? 'done' : 'next';
    input.placeholder = roleText ? `${roleText}姓名` : '輸入姓名';
    input.setAttribute('aria-label', roleText ? `${roleText} 姓名` : `座位 ${slotNum} 姓名`);

    const genderWrap = document.createElement('div');
    genderWrap.className = 'setup-gender-group';

    const btnF = document.createElement('button');
    btnF.type = 'button';
    btnF.className = 'gender-toggle gender-f';
    btnF.dataset.gender = 'F';
    btnF.setAttribute('aria-label', `${roleText || '座位 ' + slotNum} 女`);
    btnF.setAttribute('aria-pressed', 'false');
    btnF.appendChild(createIcon('female', { size: 22 }));

    const btnM = document.createElement('button');
    btnM.type = 'button';
    btnM.className = 'gender-toggle gender-m';
    btnM.dataset.gender = 'M';
    btnM.setAttribute('aria-label', `${roleText || '座位 ' + slotNum} 男`);
    btnM.setAttribute('aria-pressed', 'false');
    btnM.appendChild(createIcon('male', { size: 22 }));

    genderWrap.append(btnF, btnM);
    row.append(lead, input, genderWrap);
    frag.appendChild(row);
    rowRefs.push({ row, input, btnF, btnM });

    input.addEventListener('input', () => {
      const g = Store.getActiveGroup();
      const cleaned = cleanPersonName(input.value);
      g.seats[idx].name = cleaned;
      if (!cleaned) g.seats[idx].done = false;
      Store.save();
      syncHeaderStats();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !isImeBusy(e)) {
        e.preventDefault();
        const next = rowRefs[idx + 1];
        if (next) next.input.focus();
        else input.blur();
      }
    });

    genderWrap.addEventListener('click', (e) => {
      const btn = e.target.closest('button.gender-toggle');
      if (!btn) return;
      const g = Store.getActiveGroup();
      const targetG = btn.dataset.gender;
      g.seats[idx].gender = g.seats[idx].gender === targetG ? '' : targetG;
      Store.save();
      syncRowGender(idx, g.seats[idx].gender);
    });
  }
  seatsGrid.replaceChildren(frag);

  function syncRowGender(idx, gender) {
    const { btnF, btnM } = rowRefs[idx];
    const isF = gender === 'F';
    const isM = gender === 'M';
    btnF.classList.toggle('is-active', isF);
    btnM.classList.toggle('is-active', isM);
    btnF.setAttribute('aria-pressed', String(isF));
    btnM.setAttribute('aria-pressed', String(isM));
  }

  function syncGroupSelect() {
    const all = Store.listGroups();
    const active = Store.getActiveGroup();
    groupSelect.replaceChildren();
    all.forEach((grp) => {
      const opt = document.createElement('option');
      opt.value = grp.id;
      const n = Store.activeSeats(grp).length;
      opt.textContent = `${formatGroupTitle(grp)}（${n} 人）`;
      opt.selected = grp.id === active.id;
      groupSelect.appendChild(opt);
    });
    groupSelect.hidden = all.length <= 1 && !Store.hasActiveMembers(active);
  }

  function syncHeaderStats() {
    const g = Store.getActiveGroup();
    const filled = Store.activeSeats(g).length;
    seatCountLabel.textContent = filled > 0 ? `座位名單 · ${filled} 人` : `座位名單 · ${TOTAL_SEATS} 座位`;
    backToTimerBtn.hidden = filled === 0;
    syncGroupSelect();
  }

  function render() {
    const g = Store.getActiveGroup();
    if (document.activeElement !== courseInput) courseInput.value = g.course;
    if (document.activeElement !== familyInput) familyInput.value = g.family;
    g.seats.forEach((seat, idx) => {
      const ref = rowRefs[idx];
      if (document.activeElement !== ref.input) ref.input.value = seat.name;
      syncRowGender(idx, seat.gender);
    });
    syncHeaderStats();
  }

  courseInput.addEventListener('input', () => {
    const g = Store.getActiveGroup();
    g.course = cleanText(courseInput.value, 30);
    Store.save();
    syncGroupSelect();
  });

  familyInput.addEventListener('input', () => {
    const g = Store.getActiveGroup();
    g.family = cleanText(familyInput.value, 30);
    Store.save();
    syncGroupSelect();
  });

  groupSelect.addEventListener('change', () => {
    if (Store.switchGroup(groupSelect.value)) render();
  });

  newGroupBtn.addEventListener('click', () => {
    Store.createAndSwitchGroup('', '');
    render();
    courseInput.focus();
    announce('已建立新空白組別');
  });

  function applyBulkRosterText(rawText) {
    const parsed = parseRosterText(rawText);
    if (!parsed.count) {
      announce('未解析到有效姓名，請確認每行一個名字');
      return;
    }
    const g = Store.getActiveGroup();
    Store.applyImportedGroup(
      {
        course: parsed.course || g.course,
        family: parsed.family || g.family,
        seats: parsed.seats,
      },
      { keepDone: true, targetGroupId: g.id }
    );
    render();
    announce(`已填入 ${parsed.count} 位成員名單`);
  }

  pasteBtn.addEventListener('click', () => {
    const g = Store.getActiveGroup();
    pasteTextarea.value = g.seats.map((s) => s.name).filter(Boolean).join('\n');
    pasteModal.hidden = false;
    pasteTextarea.focus();
  });

  pasteApplyBtn.addEventListener('click', () => {
    applyBulkRosterText(pasteTextarea.value);
    pasteModal.hidden = true;
  });

  pasteCloseBtns.forEach((b) => b.addEventListener('click', () => { pasteModal.hidden = true; }));
  pasteModal.addEventListener('click', (e) => { if (e.target === pasteModal) pasteModal.hidden = true; });

  ocrBtn.addEventListener('click', () => onOpenOcr());

  const tryFinish = () => {
    const g = Store.getActiveGroup();
    if (!Store.hasActiveMembers(g)) {
      rowRefs[0].input.focus();
      announce('請至少輸入一位成員姓名再開始分享');
      return;
    }
    Store.save();
    onStartSharing();
  };

  finishBtn.addEventListener('click', tryFinish);
  backToTimerBtn.addEventListener('click', tryFinish);

  return { render, applyBulkRosterText };
}

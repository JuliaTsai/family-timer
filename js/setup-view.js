/* 名單設定畫面：
   - 第 1 格固定「家長」，第 2 格固定「副家長」
   - 大堂課第 3、4 格標示「小天使{}」、「小天使{}.」（隨家庭／組別編號即時連動，且換座位時標籤跟著人走） */

import { cleanPersonName, cleanText, formatRoleLabel, parseRosterText, TOTAL_SEATS } from './codec.js';
import { createIcon } from './icons.js';
import { formatGroupTitle, isLockedRoleIndex, Store } from './store.js';

const IME_SETTLE_MS = 100;

export function initSetupView({ root, pasteModal, onOpenOcr, onStartTable, onStartCircle, announce }) {
  const courseInput = root.querySelector('#courseInput');
  const familyInput = root.querySelector('#familyInput');
  const seatCountLabel = root.querySelector('#setupSeatCount');
  const seatsGrid = root.querySelector('#setupSeatsGrid');
  const pasteBtn = root.querySelector('#openPasteBtn');
  const ocrBtn = root.querySelector('#openOcrBtn');
  const circleDirectBtn = root.querySelector('#startCircleDirectBtn');
  const finishBtn = root.querySelector('#finishSetupBtn');
  const backToTimerBtn = root.querySelector('#backToTimerBtn');
  const groupSelect = root.querySelector('#setupGroupSelect');
  const newGroupBtn = root.querySelector('#setupNewGroupBtn');

  const pasteTextarea = pasteModal.querySelector('#pasteTextarea');
  const pasteApplyBtn = pasteModal.querySelector('#pasteApplyBtn');
  const pasteCloseBtns = pasteModal.querySelectorAll('[data-paste-close]');

  ocrBtn.prepend(createIcon('camera', { size: 20, className: 'btn-ico' }));
  pasteBtn.prepend(createIcon('paste', { size: 20, className: 'btn-ico' }));
  circleDirectBtn.prepend(createIcon('cw', { size: 18, className: 'btn-ico' }));
  newGroupBtn.prepend(createIcon('plus', { size: 16, className: 'btn-ico' }));

  let composing = false;
  let compEndedAt = 0;
  const isImeBusy = (e) =>
    composing || Boolean(e && (e.isComposing || e.keyCode === 229)) || Date.now() - compEndedAt < IME_SETTLE_MS;

  root.addEventListener('compositionstart', () => { composing = true; });
  root.addEventListener('compositionend', () => { composing = false; compEndedAt = Date.now(); });

  const rowRefs = [];
  const frag = document.createDocumentFragment();

  for (let idx = 0; idx < TOTAL_SEATS; idx++) {
    const slotNum = idx + 1;
    const lockedRole = isLockedRoleIndex(idx);

    const row = document.createElement('div');
    row.className = 'setup-seat-row' + (lockedRole ? ' is-role-locked' : ' is-draggable-member');
    row.dataset.index = String(idx);

    const lead = document.createElement('span');
    lead.className = 'setup-seat-lead';
    let grip = null;
    if (!lockedRole) {
      grip = document.createElement('span');
      grip.className = 'setup-drag-grip';
      grip.title = '拖曳調整組員座位順序';
      grip.dataset.dragHandle = 'true';
      grip.appendChild(createIcon('grip', { size: 14 }));
    }
    const leadLabel = document.createElement('span');
    leadLabel.className = 'setup-lead-slot';
    if (grip) lead.append(grip, leadLabel);
    else lead.appendChild(leadLabel);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'setup-name-input';
    input.maxLength = 24;
    input.autocomplete = 'off';
    input.enterKeyHint = idx === TOTAL_SEATS - 1 ? 'done' : 'next';

    const genderWrap = document.createElement('div');
    genderWrap.className = 'setup-gender-group';

    const btnF = document.createElement('button');
    btnF.type = 'button';
    btnF.className = 'gender-toggle gender-f';
    btnF.dataset.gender = 'F';
    btnF.setAttribute('aria-pressed', 'false');
    btnF.appendChild(createIcon('female', { size: 22 }));

    const btnM = document.createElement('button');
    btnM.type = 'button';
    btnM.className = 'gender-toggle gender-m';
    btnM.dataset.gender = 'M';
    btnM.setAttribute('aria-pressed', 'false');
    btnM.appendChild(createIcon('male', { size: 22 }));

    genderWrap.append(btnF, btnM);
    row.append(lead, input, genderWrap);
    frag.appendChild(row);
    rowRefs.push({ row, leadLabel, input, btnF, btnM, slotNum });

    input.addEventListener('input', () => {
      const g = Store.getActiveGroup();
      const cleaned = cleanPersonName(input.value);
      g.seats[idx].name = cleaned;
      if (!cleaned) g.seats[idx].done = false;
      Store.syncCircleTotalFromRoster(g);
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

  // 第 3~12 格支援拖曳互換順序（含小天使標籤跟著人一起換位）
  let rowDrag = null;
  seatsGrid.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('[data-drag-handle]');
    if (!handle) return;
    const row = handle.closest('.setup-seat-row');
    const fromIdx = Number(row?.dataset.index);
    if (!Number.isInteger(fromIdx) || isLockedRoleIndex(fromIdx)) return;

    e.preventDefault();
    seatsGrid.setPointerCapture(e.pointerId);
    row.classList.add('is-dragging');
    rowDrag = { pointerId: e.pointerId, fromIdx, overIdx: fromIdx };
  });

  seatsGrid.addEventListener('pointermove', (e) => {
    if (!rowDrag || e.pointerId !== rowDrag.pointerId) return;
    const targetRow = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.setup-seat-row');
    const idx = targetRow ? Number(targetRow.dataset.index) : -1;
    const validIdx = Number.isInteger(idx) && idx >= 2 ? idx : rowDrag.fromIdx;
    if (validIdx !== rowDrag.overIdx) {
      rowRefs.forEach((r, i) => r.row.classList.toggle('is-drop-target', i === validIdx && i !== rowDrag.fromIdx));
      rowDrag.overIdx = validIdx;
    }
  });

  const finishRowDrag = (e) => {
    if (!rowDrag || e.pointerId !== rowDrag.pointerId) return;
    const { fromIdx, overIdx } = rowDrag;
    rowDrag = null;
    rowRefs.forEach((r) => r.row.classList.remove('is-dragging', 'is-drop-target'));
    if (fromIdx !== overIdx && Store.swapMemberSeats(fromIdx, overIdx)) {
      render();
      announce(`已將座位 ${fromIdx + 1} 與座位 ${overIdx + 1} 互換`);
    }
  };
  seatsGrid.addEventListener('pointerup', finishRowDrag);
  seatsGrid.addEventListener('pointercancel', finishRowDrag);

  function syncRowRoleBadge(idx, seat, familyStr) {
    const { leadLabel, input, btnF, btnM, slotNum } = rowRefs[idx];
    const roleText = formatRoleLabel(seat.role, familyStr);
    leadLabel.replaceChildren();
    if (roleText) {
      const pill = document.createElement('span');
      pill.className = 'role-pill' + (seat.role.startsWith('A') ? ' role-pill-angel' : '');
      pill.textContent = roleText;
      leadLabel.appendChild(pill);
    } else {
      leadLabel.textContent = String(slotNum);
    }
    const labelBase = roleText || `座位 ${slotNum}`;
    input.placeholder = roleText ? `${roleText}姓名` : '輸入姓名';
    input.setAttribute('aria-label', `${labelBase} 姓名`);
    btnF.setAttribute('aria-label', `${labelBase} 女`);
    btnM.setAttribute('aria-label', `${labelBase} 男`);
  }

  function syncRowGender(idx, gender) {
    const { btnF, btnM } = rowRefs[idx];
    btnF.classList.toggle('is-active', gender === 'F');
    btnM.classList.toggle('is-active', gender === 'M');
    btnF.setAttribute('aria-pressed', String(gender === 'F'));
    btnM.setAttribute('aria-pressed', String(gender === 'M'));
  }

  function syncGroupSelect() {
    const all = Store.listGroups();
    const active = Store.getActiveGroup();
    groupSelect.replaceChildren();
    all.forEach((grp) => {
      const opt = document.createElement('option');
      opt.value = grp.id;
      opt.textContent = `${formatGroupTitle(grp)}（${Store.activeSeats(grp).length} 人）`;
      opt.selected = grp.id === active.id;
      groupSelect.appendChild(opt);
    });
    groupSelect.hidden = all.length <= 1 && !Store.hasActiveMembers(active);
  }

  function syncHeaderStats() {
    const g = Store.getActiveGroup();
    const filled = Store.activeSeats(g).length;
    seatCountLabel.textContent = filled > 0 ? `座位名單 · ${filled} 人` : `座位名單 · ${TOTAL_SEATS} 座位（可免填直接計時）`;
    finishBtn.textContent = filled > 0 ? '完成，開始分享' : '不填名字，依序號開始計時';
    backToTimerBtn.hidden = filled === 0 && g.shareMode !== 'circle';
    syncGroupSelect();
  }

  function render() {
    const g = Store.getActiveGroup();
    if (document.activeElement !== courseInput) courseInput.value = g.course;
    if (document.activeElement !== familyInput) familyInput.value = g.family;
    g.seats.forEach((seat, idx) => {
      const ref = rowRefs[idx];
      if (document.activeElement !== ref.input) ref.input.value = seat.name;
      syncRowRoleBadge(idx, seat, g.family);
      syncRowGender(idx, seat.gender);
    });
    syncHeaderStats();
  }

  courseInput.addEventListener('input', () => {
    Store.getActiveGroup().course = cleanText(courseInput.value, 30);
    Store.save();
    syncGroupSelect();
  });

  familyInput.addEventListener('input', () => {
    const g = Store.getActiveGroup();
    g.family = cleanText(familyInput.value, 30);
    Store.save();
    g.seats.forEach((seat, idx) => syncRowRoleBadge(idx, seat, g.family));
    syncGroupSelect();
  });

  groupSelect.addEventListener('change', () => { if (Store.switchGroup(groupSelect.value)) render(); });

  newGroupBtn.addEventListener('click', () => {
    Store.createAndSwitchGroup('', '');
    render();
    courseInput.focus();
    announce('已建立新空白組別');
  });

  function applyBulkRosterText(rawText) {
    const g = Store.getActiveGroup();
    const parsed = parseRosterText(rawText, { isAdvanced: g.isAdvanced });
    if (!parsed.count) { announce('未解析到有效姓名，請確認每行一個名字'); return; }
    Store.applyImportedGroup(
      { course: parsed.course || g.course, family: parsed.family || g.family, isAdvanced: g.isAdvanced, seats: parsed.seats },
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
  pasteApplyBtn.addEventListener('click', () => { applyBulkRosterText(pasteTextarea.value); pasteModal.hidden = true; });
  pasteCloseBtns.forEach((b) => b.addEventListener('click', () => { pasteModal.hidden = true; }));
  pasteModal.addEventListener('click', (e) => { if (e.target === pasteModal) pasteModal.hidden = true; });
  ocrBtn.addEventListener('click', () => onOpenOcr());

  circleDirectBtn.addEventListener('click', () => {
    const g = Store.getActiveGroup();
    g.shareMode = 'circle';
    Store.syncCircleTotalFromRoster(g);
    Store.save();
    onStartCircle();
  });
  finishBtn.addEventListener('click', () => {
    const g = Store.getActiveGroup();
    if (!Store.hasActiveMembers(g)) {
      g.shareMode = 'circle';
      Store.save();
      onStartCircle();
      announce('未輸入姓名，直接以 1、2、3 序號模式開始計時');
      return;
    }
    g.shareMode = 'table';
    Store.syncCircleTotalFromRoster(g);
    Store.save();
    onStartTable();
  });
  backToTimerBtn.addEventListener('click', () => (Store.getActiveGroup().shareMode === 'circle' ? onStartCircle() : onStartTable()));

  return { render, applyBulkRosterText };
}

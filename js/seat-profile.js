/* 排座位專屬：學員背景資訊提示卡（公司名稱、職稱、介紹人、關懷員、小天使、年齡、生命數字、主命數）
   隱私保護原則：僅於「名單設定」與「排座位」模式渲染顯示，進入正式分享計時畫面時一律隱藏。 */

import { formatRoleLabel } from './codec.js';
import { createIcon } from './icons.js';
import { isLockedRoleIndex } from './store.js';

export function hasGroupProfileMeta(group) {
  return Boolean(group?.seats?.some((s) => s.name && s.meta));
}

export function createProfileInspector({ onChange }) {
  let pinnedIdx = null;
  let hoverIdx = null;

  return {
    activeIdx: () => (pinnedIdx !== null ? pinnedIdx : hoverIdx),
    pinnedIdx: () => pinnedIdx,
    isPinned: () => pinnedIdx !== null,
    pin(idx) {
      if (!Number.isInteger(idx) || idx < 0) return;
      pinnedIdx = idx;
      onChange();
    },
    togglePin(idx) {
      if (!Number.isInteger(idx) || idx < 0) return;
      pinnedIdx = pinnedIdx === idx ? null : idx;
      onChange();
    },
    unpin() {
      if (pinnedIdx === null && hoverIdx === null) return;
      pinnedIdx = null;
      hoverIdx = null;
      onChange();
    },
    hover(idx) {
      const next = Number.isInteger(idx) && idx >= 0 ? idx : null;
      if (hoverIdx === next) return;
      hoverIdx = next;
      if (pinnedIdx === null) onChange();
    },
    followSwap(idxA, idxB) {
      if (pinnedIdx === idxA) pinnedIdx = idxB;
      else if (pinnedIdx === idxB) pinnedIdx = idxA;
      if (hoverIdx === idxA) hoverIdx = idxB;
      else if (hoverIdx === idxB) hoverIdx = idxA;
    },
    reset() {
      pinnedIdx = null;
      hoverIdx = null;
    },
  };
}

function makeChip(label, val, highlight = false) {
  const chip = document.createElement('span');
  chip.className = 'prof-chip' + (highlight ? ' is-highlight' : '');
  const k = document.createElement('span');
  k.className = 'prof-chip-k';
  k.textContent = label;
  const v = document.createElement('strong');
  v.className = 'prof-chip-v';
  v.textContent = val || '—';
  chip.append(k, v);
  return chip;
}

function makeField(label, val, wide = false) {
  const item = document.createElement('div');
  item.className = 'prof-field' + (wide ? ' is-wide' : '');
  const dt = document.createElement('span');
  dt.className = 'prof-label';
  dt.textContent = label;
  const dd = document.createElement('span');
  dd.className = 'prof-val' + (!val ? ' is-empty' : '');
  dd.textContent = val || '—';
  item.append(dt, dd);
  return item;
}

export function renderProfileCard(container, seat, familyStr, { pinned = false, compact = false, onUnpin = null } = {}) {
  if (!seat || !seat.name) {
    container.hidden = true;
    container.replaceChildren();
    return false;
  }
  container.hidden = false;

  const card = document.createElement('div');
  card.className = 'seat-profile-card' + (compact ? ' is-compact' : '');

  const head = document.createElement('div');
  head.className = 'prof-head';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'prof-title-wrap';
  const roleText = formatRoleLabel(seat.role, familyStr);
  if (roleText) {
    const pill = document.createElement('span');
    pill.className = 'role-pill prof-role-pill' + (seat.role?.startsWith('A') ? ' role-pill-angel' : '');
    pill.textContent = roleText;
    titleWrap.appendChild(pill);
  }
  const nameEl = document.createElement('strong');
  nameEl.className = 'prof-name';
  nameEl.textContent = seat.name;
  titleWrap.appendChild(nameEl);
  if (seat.gender === 'F') titleWrap.appendChild(createIcon('female', { size: 18, className: 'seat-gender is-f' }));
  if (seat.gender === 'M') titleWrap.appendChild(createIcon('male', { size: 18, className: 'seat-gender is-m' }));

  const actionsWrap = document.createElement('div');
  actionsWrap.className = 'prof-actions';
  const stateTag = document.createElement('span');
  stateTag.className = 'prof-state-badge' + (pinned ? ' is-pinned' : '');
  stateTag.textContent = pinned ? '已固定' : '預覽';
  actionsWrap.appendChild(stateTag);

  if (pinned && onUnpin) {
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'prof-close-btn';
    closeBtn.setAttribute('aria-label', '取消固定學員資訊');
    closeBtn.appendChild(createIcon('close', { size: 15 }));
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onUnpin();
    });
    actionsWrap.appendChild(closeBtn);
  }
  head.append(titleWrap, actionsWrap);
  card.appendChild(head);

  const m = seat.meta;
  if (m) {
    const chips = document.createElement('div');
    chips.className = 'prof-chips';
    chips.append(
      makeChip('年齡', m.ag ? `${m.ag} 歲` : ''),
      makeChip('主命數', m.mn ? String(m.mn) : '', true),
      makeChip('生命數字', m.ln || '')
    );

    const grid = document.createElement('div');
    grid.className = 'prof-grid';
    grid.append(
      makeField('公司名稱', m.co, true),
      makeField('職稱', m.ti),
      makeField('介紹人', m.in),
      makeField('關懷員', m.cm),
      makeField('小天使', m.la)
    );
    card.append(chips, grid);
  } else {
    const empty = document.createElement('p');
    empty.className = 'prof-empty';
    empty.textContent = '此成員為手動輸入，尚無排組雷達背景資料';
    card.appendChild(empty);
  }

  if (!compact) {
    const foot = document.createElement('p');
    foot.className = 'prof-foot-hint';
    foot.textContent = isLockedRoleIndex((seat.slot || 1) - 1)
      ? '正副家長主位固定 · 點其他組員可切換查看'
      : '拖曳姓名可換座位 · 點其他組員切換固定';
    card.appendChild(foot);
  }

  container.replaceChildren(card);
  return true;
}

/** 同步計時主畫面「排座位」模式的學員資訊卡（非排座位模式或正式計時中一律隱藏） */
export function syncArrangeProfileSlots({ arranging, group, inspector, dialInner, dialProfileWrap, mobileProfileSlot }) {
  const inspectedIdx = arranging ? inspector.activeIdx() : null;
  const seat = inspectedIdx !== null ? group.seats[inspectedIdx] : null;
  const show = Boolean(arranging && seat?.name);
  const narrow = window.innerWidth <= 700;

  dialInner.hidden = show && !narrow;
  if (show && !narrow) {
    renderProfileCard(dialProfileWrap, seat, group.family, {
      pinned: inspector.isPinned(),
      onUnpin: () => inspector.unpin(),
    });
  } else {
    dialProfileWrap.hidden = true;
    dialProfileWrap.replaceChildren();
  }
  if (show && narrow) {
    renderProfileCard(mobileProfileSlot, seat, group.family, {
      pinned: inspector.isPinned(),
      compact: true,
      onUnpin: () => inspector.unpin(),
    });
  } else {
    mobileProfileSlot.hidden = true;
    mobileProfileSlot.replaceChildren();
  }
  return inspectedIdx;
}

/** 綁定「名單設定」12 列輸入格的游標預覽／點選固定資訊卡 */
export function bindSetupProfileBar({ slotEl, seatsGrid, rowRefs, getGroup }) {
  const inspector = createProfileInspector({ onChange: sync });

  function sync() {
    const g = getGroup();
    if (!slotEl || !hasGroupProfileMeta(g)) {
      if (slotEl) { slotEl.hidden = true; slotEl.replaceChildren(); }
      rowRefs.forEach((r) => r.row.classList.remove('is-inspected'));
      return;
    }
    const idx = inspector.activeIdx();
    rowRefs.forEach((r, i) => r.row.classList.toggle('is-inspected', i === idx));
    if (idx === null || !g.seats[idx]?.name) {
      slotEl.hidden = false;
      const hint = document.createElement('div');
      hint.className = 'setup-prof-guide';
      hint.textContent = '排座位提示：將游標移到或點選下方任一成員，即可固定查看公司、職稱、介紹人、關懷員、小天使、年齡、生命數字與主命數。';
      slotEl.replaceChildren(hint);
      return;
    }
    renderProfileCard(slotEl, g.seats[idx], g.family, {
      pinned: inspector.isPinned(),
      compact: true,
      onUnpin: () => inspector.unpin(),
    });
  }

  seatsGrid.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const row = e.target.closest('.setup-seat-row');
    if (row) inspector.hover(Number(row.dataset.index));
  });
  seatsGrid.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') inspector.hover(null);
  });
  seatsGrid.addEventListener('focusin', (e) => {
    const row = e.target.closest('.setup-seat-row');
    if (row) inspector.pin(Number(row.dataset.index));
  });
  seatsGrid.addEventListener('click', (e) => {
    const row = e.target.closest('.setup-seat-row');
    if (row && !e.target.closest('button.gender-toggle')) inspector.pin(Number(row.dataset.index));
  });

  return { sync, followSwap: inspector.followSwap, reset: inspector.reset };
}

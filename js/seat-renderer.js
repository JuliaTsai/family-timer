/* 桌次座位卡片與清單卡片渲染器：支援顯示 家長、副家長、小天使{}、小天使{}. 角色標籤（四邊座位皆對齊顯示） */

import { formatRoleLabel } from './codec.js';
import { createIcon } from './icons.js';
import { isLockedRoleIndex, Store } from './store.js';

export const TABLE_SEAT_COORDS = [
  { side: 'bottom', x: 370, y: 656, locked: true }, // index 0: 家長（下中固定）
  { side: 'top', x: 370, y: 22, locked: true },     // index 1: 副家長（上中固定）
  { side: 'bottom', x: 130, y: 656 },               // index 2: 預設小天使{}（下左，可拖曳換位）
  { side: 'left', x: 12, y: 482 },                  // index 3: 預設小天使{}.（左下，可拖曳換位）
  { side: 'left', x: 12, y: 362 },
  { side: 'left', x: 12, y: 242 },
  { side: 'top', x: 130, y: 22 },
  { side: 'top', x: 610, y: 22 },
  { side: 'right', x: 736, y: 242 },
  { side: 'right', x: 736, y: 362 },
  { side: 'right', x: 736, y: 482 },
  { side: 'bottom', x: 610, y: 656 },
];

export function renderRingSeatButton(btn, seat, idx, { isTableActive, activeIdx, mode, arranging }) {
  const cfg = TABLE_SEAT_COORDS[idx];
  const g = Store.getActiveGroup();
  if (g.shareMode === 'circle') {
    btn.hidden = true;
    return;
  }

  const isEmpty = !seat.name;
  if (isEmpty && (!arranging || cfg.locked)) {
    btn.hidden = true;
    return;
  }
  btn.hidden = false;

  if (isEmpty && arranging) {
    btn.className = `ring-seat ring-seat-${cfg.side} is-empty-slot`;
    btn.textContent = '空座位（可拖入）';
    btn.setAttribute('aria-label', '空座位，可將其他組員拖曳至此');
    return;
  }

  const isCurrent = isTableActive && idx === activeIdx;
  const isDone = seat.done && !isCurrent && !arranging;
  const roleLabel = formatRoleLabel(seat.role, g.family);

  btn.className = `ring-seat ring-seat-${cfg.side}` +
    (cfg.locked ? ' is-locked-seat' : ' is-movable-seat') +
    (arranging ? ' is-arranging' : '') +
    (isCurrent ? ' is-current' : '') +
    (isDone ? ' is-done' : '') +
    (isCurrent && mode === 'over' ? ' is-over' : '');

  const dot = document.createElement('i');
  dot.className = 'seat-dot';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'seat-name-text';
  nameSpan.textContent = seat.name;
  if (seat.name.length >= 5) nameSpan.dataset.long = 'true';

  const genderIcon = seat.gender === 'F'
    ? createIcon('female', { size: 25, className: 'seat-gender is-f', label: '女' })
    : seat.gender === 'M'
    ? createIcon('male', { size: 25, className: 'seat-gender is-m', label: '男' })
    : null;

  const makePill = () => {
    if (!roleLabel) return null;
    const pill = document.createElement('span');
    pill.className = 'role-pill' + (seat.role?.startsWith('A') ? ' role-pill-angel' : '');
    pill.textContent = arranging && cfg.locked ? `${roleLabel} · 固定` : roleLabel;
    return pill;
  };

  if (cfg.side === 'top' || cfg.side === 'bottom') {
    const roleSlot = document.createElement('span');
    roleSlot.className = 'seat-role-slot';
    const pill = makePill();
    if (pill) roleSlot.appendChild(pill);

    const line = document.createElement('span');
    line.className = 'seat-name-line';
    line.appendChild(nameSpan);
    if (genderIcon) line.appendChild(genderIcon);

    if (cfg.side === 'top') btn.replaceChildren(roleSlot, line, dot);
    else btn.replaceChildren(dot, line, roleSlot);
  } else if (cfg.side === 'left') {
    const stack = document.createElement('span');
    stack.className = 'seat-side-stack is-left';
    const pill = makePill();
    if (pill) stack.appendChild(pill);
    const line = document.createElement('span');
    line.className = 'seat-name-line';
    if (genderIcon) line.appendChild(genderIcon);
    line.appendChild(nameSpan);
    stack.appendChild(line);
    btn.replaceChildren(stack, dot);
  } else {
    const stack = document.createElement('span');
    stack.className = 'seat-side-stack is-right';
    const pill = makePill();
    if (pill) stack.appendChild(pill);
    const line = document.createElement('span');
    line.className = 'seat-name-line';
    line.appendChild(nameSpan);
    if (genderIcon) line.appendChild(genderIcon);
    stack.appendChild(line);
    btn.replaceChildren(dot, stack);
  }

  const rolePrefix = roleLabel ? `${roleLabel} ` : '';
  const stateDesc = arranging
    ? (cfg.locked ? '座位固定不變' : '拖曳可與其他組員換座位')
    : isCurrent ? '發言中' : isDone ? '已分享，點一下恢復未分享' : '點選計時（長按拖曳可換座位）';
  btn.setAttribute('aria-label', `${rolePrefix}${seat.name}，${stateDesc}`);
}

export function buildMemberListCard(seat, idx, isTableActive, activeIdx, running) {
  const g = Store.getActiveGroup();
  const isCurrent = isTableActive && idx === activeIdx;
  const isDone = seat.done && !isCurrent;
  const roleLabel = formatRoleLabel(seat.role, g.family);

  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'member-card' + (isCurrent ? ' is-current' : '') + (isDone ? ' is-done' : '');
  b.dataset.index = String(idx);

  const badge = document.createElement('span');
  badge.className = 'member-slot-badge' + (seat.role?.startsWith('A') ? ' is-angel-badge' : '');
  badge.textContent = roleLabel || String(idx + 1);

  const info = document.createElement('span');
  info.className = 'member-info';
  const nameRow = document.createElement('span');
  nameRow.className = 'member-name-row';
  const nm = document.createElement('span');
  nm.className = 'member-name';
  nm.textContent = seat.name;
  nameRow.appendChild(nm);
  if (seat.gender === 'F') nameRow.appendChild(createIcon('female', { size: 17, className: 'seat-gender is-f' }));
  if (seat.gender === 'M') nameRow.appendChild(createIcon('male', { size: 17, className: 'seat-gender is-m' }));

  const tag = document.createElement('span');
  tag.className = 'member-state-tag';
  if (isCurrent) tag.append(createIcon(running ? 'playSolid' : 'pauseSolid', { size: 12 }), running ? ' 分享中' : ' 已暫停');
  else if (isDone) tag.append(createIcon('check', { size: 14 }), ' 已分享');
  else tag.textContent = isLockedRoleIndex(idx) ? '固定主位 · 點選開始' : '點選開始';

  info.append(nameRow, tag);
  b.append(badge, info);
  return b;
}

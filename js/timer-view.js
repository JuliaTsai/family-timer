/* 計時主畫面：12 座位順時針環桌渲染、圓盤狀態更新與手機清單同步 */

import { PARENT_INDEX, SUB_PARENT_INDEX } from './codec.js';
import { initDrawerView } from './drawer-view.js';
import { createIcon } from './icons.js';
import { Store } from './store.js';

const SEAT_LAYOUT = [
  { side: 'top', x: 130, y: 22 },
  { side: 'top', x: 370, y: 22, role: '副家長' },
  { side: 'top', x: 610, y: 22 },
  { side: 'right', x: 736, y: 242 },
  { side: 'right', x: 736, y: 362 },
  { side: 'right', x: 736, y: 482 },
  { side: 'bottom', x: 610, y: 656 },
  { side: 'bottom', x: 370, y: 656, role: '家長' },
  { side: 'bottom', x: 130, y: 656 },
  { side: 'left', x: 12, y: 482 },
  { side: 'left', x: 12, y: 362 },
  { side: 'left', x: 12, y: 242 },
];

export function initTimerView({ appEl, root, drawer, engine, onEditSetup, announce }) {
  const courseBadge = root.querySelector('#topCourseBadge');
  const familyTitle = root.querySelector('#topFamilyTitle');
  const headerGroupTrigger = root.querySelector('#headerGroupTrigger');
  const menuBtn = root.querySelector('#openDrawerBtn');
  const stageOuter = root.querySelector('#stageOuter');
  const stageCanvas = root.querySelector('#stageCanvas');
  const dialProgress = root.querySelector('#dialProgress');
  const dialHint = root.querySelector('#dialHint');
  const dialSpeaker = root.querySelector('#dialSpeaker');
  const dialClock = root.querySelector('#dialClock');
  const dialControls = root.querySelector('#dialControls');
  const pauseBtn = root.querySelector('#pauseBtn');
  const pauseBtnText = root.querySelector('#pauseBtnText');
  const endBtn = root.querySelector('#endBtn');
  const endBtnText = root.querySelector('#endBtnText');
  const dotsWrap = root.querySelector('#progressDots');
  const progressText = root.querySelector('#progressSummary');
  const mobileSeatsWrap = root.querySelector('#mobileSeatList');

  menuBtn.appendChild(createIcon('menu', { size: 24 }));
  pauseBtn.prepend(createIcon('playSolid', { size: 18, className: 'ico-play' }));
  pauseBtn.prepend(createIcon('pauseSolid', { size: 18, className: 'ico-pause' }));
  endBtn.prepend(createIcon('stopSolid', { size: 18, className: 'ico-stop' }));

  const seatButtons = SEAT_LAYOUT.map((cfg, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `ring-seat ring-seat-${cfg.side}`;
    btn.style.left = `${cfg.x}px`;
    btn.style.top = `${cfg.y}px`;
    btn.dataset.index = String(idx);
    stageCanvas.appendChild(btn);
    return btn;
  });

  stageCanvas.addEventListener('click', (e) => {
    const btn = e.target.closest('button.ring-seat');
    if (!btn) return;
    engine.toggleSeatOrStart(Number(btn.dataset.index));
    if (e.detail > 0) btn.blur();
  });

  function buildSeatContent(btn, seat, idx, activeIdx, mode) {
    const cfg = SEAT_LAYOUT[idx];
    const isCurrent = idx === activeIdx;
    const isDone = seat.done && !isCurrent;
    btn.hidden = !seat.name;
    if (!seat.name) return;

    btn.className = `ring-seat ring-seat-${cfg.side}` +
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

    if (cfg.side === 'top' || cfg.side === 'bottom') {
      const roleSlot = document.createElement('span');
      roleSlot.className = 'seat-role-slot';
      if (cfg.role) {
        const pill = document.createElement('span');
        pill.className = 'role-pill';
        pill.textContent = cfg.role;
        roleSlot.appendChild(pill);
      }
      const line = document.createElement('span');
      line.className = 'seat-name-line';
      line.appendChild(nameSpan);
      if (genderIcon) line.appendChild(genderIcon);

      if (cfg.side === 'top') btn.replaceChildren(roleSlot, line, dot);
      else btn.replaceChildren(dot, line, roleSlot);
    } else if (cfg.side === 'left') {
      const children = [];
      if (genderIcon) children.push(genderIcon);
      children.push(nameSpan, dot);
      btn.replaceChildren(...children);
    } else {
      const children = [dot, nameSpan];
      if (genderIcon) children.push(genderIcon);
      btn.replaceChildren(...children);
    }

    const rolePrefix = cfg.role ? `${cfg.role} ` : `座位 ${idx + 1} `;
    const stateDesc = isCurrent ? '發言中' : isDone ? '已分享，點一下恢復未分享' : '點一下開始計時';
    btn.setAttribute('aria-label', `${rolePrefix}${seat.name}，${stateDesc}`);
  }

  function buildMemberCard(seat, idx, activeIdx, running) {
    const isCurrent = idx === activeIdx;
    const isDone = seat.done && !isCurrent;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'member-card' + (isCurrent ? ' is-current' : '') + (isDone ? ' is-done' : '');
    b.dataset.index = String(idx);

    const badge = document.createElement('span');
    badge.className = 'member-slot-badge';
    badge.textContent = idx === SUB_PARENT_INDEX ? '副家' : idx === PARENT_INDEX ? '家長' : String(idx + 1);

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
    if (isCurrent) {
      tag.append(createIcon(running ? 'playSolid' : 'pauseSolid', { size: 12 }), running ? ' 分享中' : ' 已暫停');
    } else if (isDone) {
      tag.append(createIcon('check', { size: 14 }), ' 已分享');
    } else {
      tag.textContent = '點選開始';
    }
    info.append(nameRow, tag);
    b.append(badge, info);
    return b;
  }

  function renderClockOnly() {
    const c = engine.computeClock();
    const g = Store.getActiveGroup();
    const activeMembers = Store.activeSeats(g);
    const doneCount = activeMembers.filter((s) => s.done).length;
    const allDone = activeMembers.length > 0 && doneCount === activeMembers.length && !engine.isActive();

    appEl.dataset.mode = c.mode;
    appEl.dataset.paused = String(c.paused);

    if (c.mode === 'idle') {
      dialHint.textContent = !activeMembers.length ? '請先設定名單' : allDone ? '全部分享完畢' : '點選名字開始';
      dialSpeaker.hidden = true;
      dialControls.hidden = true;
      dialProgress.style.strokeDasharray = '0 100';
      dialProgress.classList.add('is-hidden');
    } else {
      dialHint.textContent = c.statusLabel;
      dialSpeaker.hidden = false;
      dialSpeaker.textContent = c.speaker;
      dialControls.hidden = false;
      dialProgress.style.strokeDasharray = `${c.pct.toFixed(2)} 100`;
      dialProgress.classList.toggle('is-hidden', c.pct < 0.35);

      pauseBtn.hidden = c.mode === 'over' && !c.paused;
      pauseBtn.dataset.resume = String(c.paused);
      pauseBtnText.textContent = c.paused ? '繼續' : '暫停';
      endBtnText.textContent = c.mode === 'over' ? '結束分享' : '結束';
    }
    dialClock.textContent = c.clockText;
  }

  function updateStageScale() {
    if (stageOuter.offsetParent === null) return;
    const rect = stageOuter.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const scale = Math.min(1.15, rect.width / 960, rect.height / 800);
    stageCanvas.style.setProperty('--stage-scale', scale.toFixed(4));
  }

  const drawerCtrl = initDrawerView({
    drawer,
    menuBtn,
    headerGroupTrigger,
    engine,
    buildMemberCard,
    onChanged: () => renderAll(),
    onEditSetup,
    announce,
  });

  function renderAll() {
    const g = Store.getActiveGroup();
    const c = engine.computeClock();
    const activeIdx = engine.activeSlotIndex();
    const running = engine.isRunning();

    courseBadge.hidden = !g.course;
    courseBadge.textContent = g.course;
    familyTitle.textContent = g.family || (g.course ? '家庭分享' : '家庭分享計時');

    g.seats.forEach((seat, idx) => buildSeatContent(seatButtons[idx], seat, idx, activeIdx, c.mode));

    const activeMembers = Store.activeSeats(g);
    const doneCount = activeMembers.filter((s) => s.done).length;
    const dotFrag = document.createDocumentFragment();
    for (let i = 0; i < activeMembers.length; i++) {
      const d = document.createElement('i');
      d.className = 'prog-dot' + (i < doneCount ? ' is-filled' : '');
      dotFrag.appendChild(d);
    }
    dotsWrap.replaceChildren(dotFrag);
    progressText.textContent = `已分享 ${doneCount} / ${activeMembers.length}`;

    const mFrag = document.createDocumentFragment();
    g.seats.forEach((seat, idx) => {
      if (seat.name) mFrag.appendChild(buildMemberCard(seat, idx, activeIdx, running));
    });
    mobileSeatsWrap.replaceChildren(mFrag);

    drawerCtrl.renderDrawer();
    renderClockOnly();
    updateStageScale();
  }

  mobileSeatsWrap.addEventListener('click', (e) => {
    const b = e.target.closest('button.member-card');
    if (b) engine.toggleSeatOrStart(Number(b.dataset.index));
  });

  pauseBtn.addEventListener('click', () => (engine.isRunning() ? engine.pause() : engine.resume()));
  endBtn.addEventListener('click', () => engine.endCurrent());

  window.addEventListener('resize', () => requestAnimationFrame(updateStageScale));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', () => requestAnimationFrame(updateStageScale));

  return {
    renderAll,
    renderClockOnly,
    closeDrawer: drawerCtrl.closeDrawer,
    isDrawerOpen: drawerCtrl.isDrawerOpen,
  };
}

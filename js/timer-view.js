/* 計時主畫面：協調「桌次座位模式（正副家長固定＋組員拖曳換位）」與「就地圍圈模式（以家長為中心順／逆時針純計時）」 */

import { initCircleView } from './circle-view.js';
import { initDrawerView } from './drawer-view.js';
import { createIcon } from './icons.js';
import { initSeatDrag } from './seat-drag.js';
import { buildMemberListCard, renderRingSeatButton, TABLE_SEAT_COORDS } from './seat-renderer.js';
import { Store } from './store.js';

export function initTimerView({ appEl, root, drawer, engine, onEditSetup, announce }) {
  const courseBadge = root.querySelector('#topCourseBadge');
  const familyTitle = root.querySelector('#topFamilyTitle');
  const headerGroupTrigger = root.querySelector('#headerGroupTrigger');
  const modeTableBtn = root.querySelector('#modeTableBtn');
  const modeCircleBtn = root.querySelector('#modeCircleBtn');
  const arrangeSeatsBtn = root.querySelector('#arrangeSeatsBtn');
  const arrangeSeatsText = root.querySelector('#arrangeSeatsText');
  const menuBtn = root.querySelector('#openDrawerBtn');
  const stageOuter = root.querySelector('#stageOuter');
  const stageCanvas = root.querySelector('#stageCanvas');
  const dialProgress = root.querySelector('#dialProgress');
  const dialHint = root.querySelector('#dialHint');
  const dialSpeaker = root.querySelector('#dialSpeaker');
  const dialClock = root.querySelector('#dialClock');
  const circleIdleStartBtn = root.querySelector('#circleIdleStartBtn');
  const dialControls = root.querySelector('#dialControls');
  const pauseBtn = root.querySelector('#pauseBtn');
  const pauseBtnText = root.querySelector('#pauseBtnText');
  const nextCircleBtn = root.querySelector('#nextCircleBtn');
  const endBtn = root.querySelector('#endBtn');
  const endBtnText = root.querySelector('#endBtnText');
  const dotsWrap = root.querySelector('#progressDots');
  const progressText = root.querySelector('#progressSummary');
  const mobileSeatsWrap = root.querySelector('#mobileSeatList');

  menuBtn.appendChild(createIcon('menu', { size: 24 }));
  arrangeSeatsBtn.prepend(createIcon('swap', { size: 17 }));
  circleIdleStartBtn.prepend(createIcon('playSolid', { size: 18 }));
  pauseBtn.prepend(createIcon('playSolid', { size: 18, className: 'ico-play' }));
  pauseBtn.prepend(createIcon('pauseSolid', { size: 18, className: 'ico-pause' }));
  nextCircleBtn.prepend(createIcon('skipNext', { size: 18 }));
  endBtn.prepend(createIcon('stopSolid', { size: 18, className: 'ico-stop' }));

  let arranging = false;

  const seatButtons = TABLE_SEAT_COORDS.map((cfg, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `ring-seat ring-seat-${cfg.side}`;
    btn.style.left = `${cfg.x}px`;
    btn.style.top = `${cfg.y}px`;
    btn.dataset.index = String(idx);
    btn.dataset.side = cfg.side;
    stageCanvas.appendChild(btn);
    return btn;
  });

  const circleCtrl = initCircleView({ root, stageCanvas, engine, onChanged: () => renderAll(), announce });

  initSeatDrag({
    stageCanvas,
    seatButtons,
    isArrangeMode: () => arranging,
    onTapSeat: (idx) => engine.toggleSeatOrStart(idx),
    onSeatsSwapped: () => renderAll(),
    announce,
  });

  const buildMemberCard = (seat, idx, activeIdx, running) =>
    buildMemberListCard(seat, idx, engine.activeTargetKind() === 'table', activeIdx, running);

  function renderClockOnly() {
    const c = engine.computeClock();
    const g = Store.getActiveGroup();
    const isCircle = g.shareMode === 'circle';
    const totalCount = isCircle ? g.circle.total : Store.activeSeats(g).length;
    const doneCount = isCircle ? g.circle.done.length : Store.activeSeats(g).filter((s) => s.done).length;
    const allDone = totalCount > 0 && doneCount >= totalCount && !engine.isActive();

    appEl.dataset.mode = c.mode;
    appEl.dataset.paused = String(c.paused);
    appEl.dataset.shareMode = g.shareMode;

    if (c.mode === 'idle') {
      dialHint.textContent = arranging
        ? '拖曳名字換座位 · 正副家長固定'
        : isCircle
        ? (allDone ? '全組分享完畢' : `以家長為起點 · ${g.circle.direction === 'cw' ? '順時針' : '逆時針'}`)
        : (!totalCount ? '請先設定名單' : allDone ? '全部分享完畢' : '點選名字開始');
      dialSpeaker.hidden = true;
      dialControls.hidden = true;
      circleIdleStartBtn.hidden = !isCircle;
      circleIdleStartBtn.querySelector('span').textContent = allDone ? '重新開始第一輪' : '開始計時';
      dialProgress.style.strokeDasharray = '0 100';
      dialProgress.classList.add('is-hidden');
    } else {
      dialHint.textContent = c.statusLabel;
      dialSpeaker.hidden = false;
      dialSpeaker.textContent = c.speaker;
      circleIdleStartBtn.hidden = true;
      dialControls.hidden = false;
      dialProgress.style.strokeDasharray = `${c.pct.toFixed(2)} 100`;
      dialProgress.classList.toggle('is-hidden', c.pct < 0.35);

      pauseBtn.hidden = c.mode === 'over' && !c.paused;
      pauseBtn.dataset.resume = String(c.paused);
      pauseBtnText.textContent = c.paused ? '繼續' : '暫停';
      nextCircleBtn.hidden = !isCircle;
      endBtnText.textContent = c.mode === 'over' && !isCircle ? '結束分享' : '結束';
    }
    dialClock.textContent = c.clockText;
  }

  function updateStageScale() {
    if (stageOuter.offsetParent === null) return;
    const rect = stageOuter.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const scale = Math.min(1.12, rect.width / 960, rect.height / 800);
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
    const isCircle = g.shareMode === 'circle';
    if (isCircle && arranging) arranging = false;

    const c = engine.computeClock();
    const activeIdx = engine.activeSlotIndex();
    const running = engine.isRunning();
    const isTableActive = engine.activeTargetKind() === 'table';

    courseBadge.hidden = !g.course;
    courseBadge.textContent = g.course;
    familyTitle.textContent = g.family || (g.course ? '家庭分享' : '家庭分享計時');

    modeTableBtn.classList.toggle('is-active', !isCircle);
    modeCircleBtn.classList.toggle('is-active', isCircle);
    modeTableBtn.setAttribute('aria-pressed', String(!isCircle));
    modeCircleBtn.setAttribute('aria-pressed', String(isCircle));

    arrangeSeatsBtn.hidden = isCircle;
    arrangeSeatsBtn.classList.toggle('is-active', arranging);
    arrangeSeatsText.textContent = arranging ? '完成排位' : '排座位';

    g.seats.forEach((seat, idx) =>
      renderRingSeatButton(seatButtons[idx], seat, idx, { isTableActive, activeIdx, mode: c.mode, arranging })
    );
    circleCtrl.renderCircle();

    const totalCount = isCircle ? g.circle.total : Store.activeSeats(g).length;
    const doneCount = isCircle ? g.circle.done.length : Store.activeSeats(g).filter((s) => s.done).length;

    const dotFrag = document.createDocumentFragment();
    for (let i = 0; i < totalCount; i++) {
      const d = document.createElement('i');
      d.className = 'prog-dot' + (i < doneCount ? ' is-filled' : '');
      dotFrag.appendChild(d);
    }
    dotsWrap.replaceChildren(dotFrag);
    progressText.textContent = `已分享 ${doneCount} / ${totalCount}`;

    mobileSeatsWrap.hidden = isCircle;
    if (!isCircle) {
      const mFrag = document.createDocumentFragment();
      g.seats.forEach((seat, idx) => {
        if (seat.name) mFrag.appendChild(buildMemberCard(seat, idx, activeIdx, running));
      });
      mobileSeatsWrap.replaceChildren(mFrag);
    }

    drawerCtrl.renderDrawer();
    renderClockOnly();
    updateStageScale();
  }

  function setShareMode(nextMode) {
    const g = Store.getActiveGroup();
    if (g.shareMode === nextMode) return;
    if (nextMode === 'table' && !Store.hasActiveMembers(g)) {
      onEditSetup();
      announce('桌次座位模式需先輸入名單');
      return;
    }
    engine.clear();
    arranging = false;
    g.shareMode = nextMode;
    if (nextMode === 'circle') Store.syncCircleTotalFromRoster(g);
    Store.save();
    renderAll();
    announce(nextMode === 'circle' ? '已切換至就地圍圈純計時模式' : '已切換至桌次座位模式');
  }

  modeTableBtn.addEventListener('click', () => setShareMode('table'));
  modeCircleBtn.addEventListener('click', () => setShareMode('circle'));

  arrangeSeatsBtn.addEventListener('click', () => {
    engine.clear();
    arranging = !arranging;
    renderAll();
    announce(arranging ? '進入排座位模式，可拖曳組員調整位置，正副家長固定不變' : '已完成座位調整');
  });

  circleIdleStartBtn.addEventListener('click', () => engine.startOrAdvanceCircle());
  nextCircleBtn.addEventListener('click', () => engine.startOrAdvanceCircle());
  pauseBtn.addEventListener('click', () => (engine.isRunning() ? engine.pause() : engine.resume()));
  endBtn.addEventListener('click', () => engine.endCurrent());

  mobileSeatsWrap.addEventListener('click', (e) => {
    const b = e.target.closest('button.member-card');
    if (b) engine.toggleSeatOrStart(Number(b.dataset.index));
  });

  window.addEventListener('resize', () => requestAnimationFrame(updateStageScale));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', () => requestAnimationFrame(updateStageScale));

  return { renderAll, renderClockOnly, closeDrawer: drawerCtrl.closeDrawer, isDrawerOpen: drawerCtrl.isDrawerOpen };
}

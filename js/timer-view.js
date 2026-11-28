/* 計時主畫面：協調「桌次座位模式（正副家長固定＋組員拖曳／點選換位）」與「序號／就地圍圈模式（1,2,3 順／逆時針純計時）」 */

import { initCircleView } from './circle-view.js';
import { initDrawerView } from './drawer-view.js';
import { createIcon } from './icons.js';
import { initSeatDrag } from './seat-drag.js';
import { createProfileInspector, syncArrangeProfileSlots } from './seat-profile.js';
import { buildMemberListCard, renderRingSeatButton, TABLE_SEAT_COORDS } from './seat-renderer.js';
import { isLockedRoleIndex, Store } from './store.js';

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
  const dialInner = root.querySelector('#dialInner');
  const dialProfileWrap = root.querySelector('#dialProfileWrap');
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
  const mobileProfileSlot = root.querySelector('#mobileProfileSlot');
  const mobileSeatsWrap = root.querySelector('#mobileSeatList');
  const mobileCircleGrid = root.querySelector('#mobileCircleGrid');

  menuBtn.appendChild(createIcon('menu', { size: 22 }));
  arrangeSeatsBtn.prepend(createIcon('swap', { size: 16 }));
  circleIdleStartBtn.prepend(createIcon('playSolid', { size: 17 }));
  pauseBtn.prepend(createIcon('playSolid', { size: 17, className: 'ico-play' }));
  pauseBtn.prepend(createIcon('pauseSolid', { size: 17, className: 'ico-pause' }));
  nextCircleBtn.prepend(createIcon('skipNext', { size: 17 }));
  endBtn.prepend(createIcon('stopSolid', { size: 17, className: 'ico-stop' }));

  let arranging = false;
  let mobileSwapFirstIdx = null; // 手機排座位：點第 1 人再點第 2 人直接對調
  const profileInspector = createProfileInspector({ onChange: () => renderAll() });

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

  const circleCtrl = initCircleView({
    root,
    stageCanvas,
    mobileCircleGrid,
    engine,
    onChanged: () => renderAll(),
    announce,
  });

  initSeatDrag({
    stageCanvas,
    seatButtons,
    isArrangeMode: () => arranging,
    onTapSeat: (idx) => engine.toggleSeatOrStart(idx),
    onInspectSeat: (idx) => profileInspector.togglePin(idx),
    onHoverSeat: (idx) => profileInspector.hover(idx),
    onSeatsSwapped: (fromIdx, overIdx) => { profileInspector.followSwap(fromIdx, overIdx); renderAll(); },
    announce,
  });

  const buildMemberCard = (seat, idx, activeIdx, running) =>
    buildMemberListCard(seat, idx, engine.activeTargetKind() === 'table', activeIdx, running);

  function renderClockOnly() {
    const c = engine.computeClock();
    const g = Store.getActiveGroup();
    const isCircle = g.shareMode === 'circle';
    const hasRoster = Store.hasActiveMembers(g);
    const totalCount = isCircle ? g.circle.total : Store.activeSeats(g).length;
    const doneCount = isCircle ? g.circle.done.length : Store.activeSeats(g).filter((s) => s.done).length;
    const allDone = totalCount > 0 && doneCount >= totalCount && !engine.isActive();

    appEl.dataset.mode = c.mode;
    appEl.dataset.paused = String(c.paused);
    appEl.dataset.shareMode = g.shareMode;

    if (c.mode === 'idle') {
      const dirText = g.circle.direction === 'cw' ? '順時針' : '逆時針';
      dialHint.textContent = arranging
        ? '點選或拖曳組員換位 · 正副家長固定'
        : isCircle
        ? (allDone ? '全組分享完畢' : hasRoster ? `以家長為起點 · ${dirText}` : `依序號 1 → ${totalCount} 計時`)
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
    if (stageOuter.offsetParent === null || window.innerWidth <= 700) return;
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
    if (isCircle && arranging) { arranging = false; mobileSwapFirstIdx = null; profileInspector.reset(); }
    const inspectedIdx = syncArrangeProfileSlots({
      arranging, group: g, inspector: profileInspector, dialInner, dialProfileWrap, mobileProfileSlot,
    });

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

    g.seats.forEach((seat, idx) => {
      renderRingSeatButton(seatButtons[idx], seat, idx, { isTableActive, activeIdx, mode: c.mode, arranging });
      seatButtons[idx].classList.toggle('is-inspected', Boolean(arranging && idx === inspectedIdx && seat.name));
    });
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
        if (!seat.name && (!arranging || isLockedRoleIndex(idx))) return;
        const card = seat.name
          ? buildMemberCard(seat, idx, activeIdx, running)
          : (() => {
              const emptyBtn = document.createElement('button');
              emptyBtn.type = 'button';
              emptyBtn.className = 'member-card is-empty-card';
              emptyBtn.dataset.index = String(idx);
              emptyBtn.textContent = `座位 ${idx + 1}（空位）`;
              return emptyBtn;
            })();
        if (arranging) {
          card.classList.toggle('is-swap-picked', idx === mobileSwapFirstIdx);
          card.classList.toggle('is-inspected', idx === inspectedIdx && Boolean(seat.name));
          card.classList.toggle('is-locked-card', isLockedRoleIndex(idx));
        }
        mFrag.appendChild(card);
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
      announce('桌次座位模式需先輸入名單；若不填名單可直接使用序號計時');
      return;
    }
    engine.clear();
    arranging = false;
    mobileSwapFirstIdx = null;
    profileInspector.reset();
    g.shareMode = nextMode;
    if (nextMode === 'circle') Store.syncCircleTotalFromRoster(g);
    Store.save();
    renderAll();
  }

  modeTableBtn.addEventListener('click', () => setShareMode('table'));
  modeCircleBtn.addEventListener('click', () => setShareMode('circle'));

  arrangeSeatsBtn.addEventListener('click', () => {
    engine.clear();
    arranging = !arranging;
    mobileSwapFirstIdx = null;
    profileInspector.reset();
    renderAll();
    announce(arranging ? '排座位模式：點選學員可固定查看背景資訊，拖曳可換座位' : '已完成排位');
  });

  circleIdleStartBtn.addEventListener('click', () => engine.startOrAdvanceCircle());
  nextCircleBtn.addEventListener('click', () => engine.startOrAdvanceCircle());
  pauseBtn.addEventListener('click', () => (engine.isRunning() ? engine.pause() : engine.resume()));
  endBtn.addEventListener('click', () => engine.endCurrent());

  mobileSeatsWrap.addEventListener('click', (e) => {
    const b = e.target.closest('button.member-card');
    if (!b) return;
    const idx = Number(b.dataset.index);
    if (!arranging) {
      engine.toggleSeatOrStart(idx);
      return;
    }
    if (isLockedRoleIndex(idx)) {
      profileInspector.pin(idx);
      announce('家長與副家長的座位固定不變');
      return;
    }
    if (mobileSwapFirstIdx === null) {
      if (!Store.getActiveGroup().seats[idx]?.name) return;
      mobileSwapFirstIdx = idx;
      profileInspector.pin(idx);
    } else if (mobileSwapFirstIdx === idx) {
      mobileSwapFirstIdx = null;
      profileInspector.unpin();
    } else {
      const fromIdx = mobileSwapFirstIdx;
      Store.swapMemberSeats(fromIdx, idx);
      profileInspector.followSwap(fromIdx, idx);
      mobileSwapFirstIdx = null;
      renderAll();
      announce('已互換組員座位');
    }
  });

  window.addEventListener('resize', () => requestAnimationFrame(updateStageScale));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', () => requestAnimationFrame(updateStageScale));

  return { renderAll, renderClockOnly, closeDrawer: drawerCtrl.closeDrawer, isDrawerOpen: drawerCtrl.isDrawerOpen };
}

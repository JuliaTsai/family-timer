/* 設定抽屜互動：組別切換、每人分享時間調整器、超時緩衝設定、重設已分享 */

import { previewAllSounds } from './audio.js';
import { createIcon } from './icons.js';
import { clampDuration, clampOvertimeFull, formatGroupTitle, Store } from './store.js';

export function initDrawerView({ drawer, menuBtn, headerGroupTrigger, engine, buildMemberCard, onChanged, onEditSetup, announce }) {
  const drawerBackdrop = document.querySelector('#drawerBackdrop');
  const closeDrawerBtn = drawer.querySelector('#closeDrawerBtn');
  const drawerGroupSelect = drawer.querySelector('#drawerGroupSelect');
  const drawerNewGroupBtn = drawer.querySelector('#drawerNewGroupBtn');
  const drawerDeleteGroupBtn = drawer.querySelector('#drawerDeleteGroupBtn');
  const drawerEditSetupBtn = drawer.querySelector('#drawerEditSetupBtn');
  const drawerResetDoneBtn = drawer.querySelector('#drawerResetDoneBtn');
  const durationCard = drawer.querySelector('#durationCard');
  const durationMin = drawer.querySelector('#durationMin');
  const durationSec = drawer.querySelector('#durationSec');
  const durationGroup = drawer.querySelector('#durationStepper');
  const presetsWrap = drawer.querySelector('#durationPresets');
  const overtimePresets = drawer.querySelector('#overtimePresets');
  const testBellBtn = drawer.querySelector('#testBellBtn');
  const drawerPeopleList = drawer.querySelector('#drawerPeopleList');

  closeDrawerBtn.appendChild(createIcon('close', { size: 20 }));
  testBellBtn.prepend(createIcon('bell', { size: 18 }));
  drawerEditSetupBtn.prepend(createIcon('edit', { size: 18 }));
  drawerResetDoneBtn.prepend(createIcon('reset', { size: 18 }));
  drawerNewGroupBtn.prepend(createIcon('plus', { size: 16 }));
  drawerDeleteGroupBtn.prepend(createIcon('trash', { size: 16 }));

  function setDrawerOpen(open) {
    drawer.hidden = !open;
    drawerBackdrop.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
  }

  function renderDrawer() {
    const g = Store.getActiveGroup();
    const activeIdx = engine.activeSlotIndex();
    const running = engine.isRunning();

    const dFrag = document.createDocumentFragment();
    g.seats.forEach((seat, idx) => {
      if (seat.name) dFrag.appendChild(buildMemberCard(seat, idx, activeIdx, running));
    });
    drawerPeopleList.replaceChildren(dFrag);

    const groups = Store.listGroups();
    drawerGroupSelect.replaceChildren();
    groups.forEach((grp) => {
      const opt = document.createElement('option');
      opt.value = grp.id;
      opt.textContent = `${formatGroupTitle(grp)}（${Store.activeSeats(grp).length} 人）`;
      opt.selected = grp.id === g.id;
      drawerGroupSelect.appendChild(opt);
    });

    const locked = engine.isActive();
    durationCard.classList.toggle('is-locked', locked);
    durationMin.textContent = String(Math.floor(g.duration / 60));
    durationSec.textContent = String(g.duration % 60).padStart(2, '0');
    presetsWrap.querySelectorAll('button[data-preset]').forEach((b) => {
      b.disabled = locked;
      b.classList.toggle('is-active', Number(b.dataset.preset) === g.duration);
    });
    overtimePresets.querySelectorAll('button[data-overtime]').forEach((b) => {
      b.classList.toggle('is-active', Number(b.dataset.overtime) === (g.overtimeFullSec || 30));
    });
  }

  menuBtn.addEventListener('click', () => setDrawerOpen(drawer.hidden));
  headerGroupTrigger.addEventListener('click', () => setDrawerOpen(true));
  closeDrawerBtn.addEventListener('click', () => setDrawerOpen(false));
  drawerBackdrop.addEventListener('click', () => setDrawerOpen(false));

  drawerPeopleList.addEventListener('click', (e) => {
    const b = e.target.closest('button.member-card');
    if (!b) return;
    if (engine.toggleSeatOrStart(Number(b.dataset.index))) setDrawerOpen(false);
  });

  testBellBtn.addEventListener('click', previewAllSounds);

  durationGroup.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-step]');
    if (!b || engine.isActive()) return;
    const g = Store.getActiveGroup();
    g.duration = clampDuration(g.duration + Number(b.dataset.step));
    Store.save();
    onChanged();
  });

  presetsWrap.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-preset]');
    if (!b || engine.isActive()) return;
    const g = Store.getActiveGroup();
    g.duration = clampDuration(Number(b.dataset.preset));
    Store.save();
    onChanged();
  });

  overtimePresets.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-overtime]');
    if (!b) return;
    const g = Store.getActiveGroup();
    g.overtimeFullSec = clampOvertimeFull(Number(b.dataset.overtime));
    Store.save();
    onChanged();
  });

  drawerGroupSelect.addEventListener('change', () => {
    engine.clear();
    Store.switchGroup(drawerGroupSelect.value);
    onChanged();
    announce(`已切換至 ${formatGroupTitle(Store.getActiveGroup())}`);
  });

  drawerNewGroupBtn.addEventListener('click', () => {
    engine.clear();
    Store.createAndSwitchGroup('', '');
    setDrawerOpen(false);
    onEditSetup();
  });

  drawerDeleteGroupBtn.addEventListener('click', () => {
    const g = Store.getActiveGroup();
    if (!window.confirm(`確定要刪除「${formatGroupTitle(g)}」的本機紀錄嗎？`)) return;
    engine.clear();
    Store.deleteGroup(g.id);
    setDrawerOpen(false);
    if (!Store.hasActiveMembers()) onEditSetup();
    else onChanged();
  });

  drawerEditSetupBtn.addEventListener('click', () => {
    engine.clear();
    setDrawerOpen(false);
    onEditSetup();
  });

  drawerResetDoneBtn.addEventListener('click', () => {
    const g = Store.getActiveGroup();
    const anyDone = g.seats.some((s) => s.done);
    if ((anyDone || engine.isActive()) && !window.confirm('確定要重設本組所有人的「已分享」狀態嗎？（名單保留）')) return;
    engine.clear();
    Store.resetDoneStatus();
    onChanged();
    announce('已重設本組分享進度');
  });

  return {
    renderDrawer,
    closeDrawer: () => setDrawerOpen(false),
    isDrawerOpen: () => !drawer.hidden,
  };
}

/* 就地圍圈純計時視圖（活動結束小組就地圍圈：隱藏所有人名，以家長為中心起點，支援順時針／逆時針與一鍵下一位） */

import { createIcon } from './icons.js';
import { clampCircleTotal, Store } from './store.js';
import { circleTurnNumber } from './timer-engine.js';

export function initCircleView({ root, stageCanvas, engine, onChanged, announce }) {
  const circleToolbar = root.querySelector('#circleToolbar');
  const dirCwBtn = root.querySelector('#circleDirCwBtn');
  const dirCcwBtn = root.querySelector('#circleDirCcwBtn');
  const countMinusBtn = root.querySelector('#circleCountMinus');
  const countPlusBtn = root.querySelector('#circleCountPlus');
  const countLabel = root.querySelector('#circleCountLabel');
  const resetCircleBtn = root.querySelector('#circleResetBtn');

  dirCwBtn.prepend(createIcon('cw', { size: 17 }));
  dirCcwBtn.prepend(createIcon('ccw', { size: 17 }));
  resetCircleBtn.prepend(createIcon('reset', { size: 16 }));

  // 建立圓盤四周圍圈純圓點層（960×800 畫布圓心 (480, 390)，半徑 308px；0 = 6 點鐘正下方家長起點）
  const ringLayer = document.createElement('div');
  ringLayer.className = 'circle-nodes-layer';
  ringLayer.hidden = true;
  stageCanvas.appendChild(ringLayer);

  ringLayer.addEventListener('click', (e) => {
    const node = e.target.closest('button.circle-node');
    if (!node) return;
    engine.toggleCircleDotOrStart(Number(node.dataset.pos));
    if (e.detail > 0) node.blur();
  });

  dirCwBtn.addEventListener('click', () => {
    const g = Store.getActiveGroup();
    if (g.circle.direction === 'cw') return;
    g.circle.direction = 'cw';
    Store.save();
    onChanged();
    announce('已切換為順時針分享');
  });

  dirCcwBtn.addEventListener('click', () => {
    const g = Store.getActiveGroup();
    if (g.circle.direction === 'ccw') return;
    g.circle.direction = 'ccw';
    Store.save();
    onChanged();
    announce('已切換為逆時針分享');
  });

  const adjustCount = (delta) => {
    const g = Store.getActiveGroup();
    const next = clampCircleTotal(g.circle.total + delta);
    if (next === g.circle.total) return;
    if (engine.isActive() && engine.activeSlotIndex() >= next) engine.clear();
    g.circle.total = next;
    g.circle.done = g.circle.done.filter((i) => i < next);
    Store.save();
    onChanged();
  };

  countMinusBtn.addEventListener('click', () => adjustCount(-1));
  countPlusBtn.addEventListener('click', () => adjustCount(1));

  resetCircleBtn.addEventListener('click', () => {
    const g = Store.getActiveGroup();
    if (!g.circle.done.length && !engine.isActive()) return;
    engine.clear();
    g.circle.done = [];
    Store.save();
    onChanged();
    announce('已重設本輪圍圈計時');
  });

  function renderCircle() {
    const g = Store.getActiveGroup();
    const isCircle = g.shareMode === 'circle';
    circleToolbar.hidden = !isCircle;
    ringLayer.hidden = !isCircle;
    if (!isCircle) return;

    const { total, direction, done } = g.circle;
    const isCw = direction === 'cw';
    dirCwBtn.classList.toggle('is-active', isCw);
    dirCcwBtn.classList.toggle('is-active', !isCw);
    dirCwBtn.setAttribute('aria-pressed', String(isCw));
    dirCcwBtn.setAttribute('aria-pressed', String(!isCw));
    countLabel.textContent = `${total} 人`;

    const activeIdx = engine.activeTargetKind() === 'circle' ? engine.activeSlotIndex() : null;
    const mode = engine.computeClock().mode;

    // 圓心 (480, 390)，以 6 點鐘方向 (Math.PI / 2) 為 pos=0（家長），順時針角度遞增
    const cx = 480;
    const cy = 390;
    const rx = 316;
    const ry = 304;
    const frag = document.createDocumentFragment();

    for (let pos = 0; pos < total; pos++) {
      const angle = Math.PI / 2 + (pos / total) * Math.PI * 2;
      const x = cx + Math.cos(angle) * rx;
      const y = cy + Math.sin(angle) * ry;
      const turn = circleTurnNumber(pos, total, direction);
      const isCurrent = pos === activeIdx;
      const isDone = done.includes(pos) && !isCurrent;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'circle-node' +
        (pos === 0 ? ' is-anchor-parent' : '') +
        (isCurrent ? ' is-current' : '') +
        (isDone ? ' is-done' : '') +
        (isCurrent && mode === 'over' ? ' is-over' : '');
      btn.style.left = `${x.toFixed(1)}px`;
      btn.style.top = `${y.toFixed(1)}px`;
      btn.dataset.pos = String(pos);

      const badge = document.createElement('span');
      badge.className = 'circle-node-dot';
      badge.textContent = String(turn);
      btn.appendChild(badge);

      if (pos === 0) {
        const tag = document.createElement('span');
        tag.className = 'role-pill circle-parent-pill';
        tag.textContent = '家長';
        btn.appendChild(tag);
      }

      btn.setAttribute(
        'aria-label',
        pos === 0 ? `家長（起點第 1 位），點選從此開始計時` : `第 ${turn} 位，點選從此開始計時`
      );
      frag.appendChild(btn);
    }

    ringLayer.replaceChildren(frag);
  }

  return { renderCircle };
}

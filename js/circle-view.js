/* 就地圍圈／純序號計時視圖：
   - 未輸入名單時：直接依 1, 2, 3… 序號順跑計時
   - 活動結束就地圍圈時：隱藏人名，以家長（1 號）為起點切換順時針／逆時針，一鍵「下一位」
   - 同時渲染「平板／電腦外圈環繞圓點」與「手機大拇指號碼格」 */

import { createIcon } from './icons.js';
import { clampCircleTotal, Store } from './store.js';
import { circleTurnNumber } from './timer-engine.js';

export function initCircleView({ root, stageCanvas, mobileCircleGrid, engine, onChanged, announce }) {
  const circleToolbar = root.querySelector('#circleToolbar');
  const dirCwBtn = root.querySelector('#circleDirCwBtn');
  const dirCcwBtn = root.querySelector('#circleDirCcwBtn');
  const countMinusBtn = root.querySelector('#circleCountMinus');
  const countPlusBtn = root.querySelector('#circleCountPlus');
  const countLabel = root.querySelector('#circleCountLabel');
  const resetCircleBtn = root.querySelector('#circleResetBtn');

  dirCwBtn.prepend(createIcon('cw', { size: 16 }));
  dirCcwBtn.prepend(createIcon('ccw', { size: 16 }));
  resetCircleBtn.prepend(createIcon('reset', { size: 15 }));

  const ringLayer = document.createElement('div');
  ringLayer.className = 'circle-nodes-layer';
  ringLayer.hidden = true;
  stageCanvas.appendChild(ringLayer);

  const handleNodeTap = (e) => {
    const node = e.target.closest('button[data-pos]');
    if (!node) return;
    engine.toggleCircleDotOrStart(Number(node.dataset.pos));
    if (e.detail > 0) node.blur();
  };

  ringLayer.addEventListener('click', handleNodeTap);
  mobileCircleGrid.addEventListener('click', handleNodeTap);

  dirCwBtn.addEventListener('click', () => {
    const g = Store.getActiveGroup();
    if (g.circle.direction === 'cw') return;
    g.circle.direction = 'cw';
    Store.save();
    onChanged();
    announce('已切換為順時針依序分享');
  });

  dirCcwBtn.addEventListener('click', () => {
    const g = Store.getActiveGroup();
    if (g.circle.direction === 'ccw') return;
    g.circle.direction = 'ccw';
    Store.save();
    onChanged();
    announce('已切換為逆時針依序分享');
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
    announce('已重設本輪計時進度');
  });

  function renderCircle() {
    const g = Store.getActiveGroup();
    const isCircle = g.shareMode === 'circle';
    const hasRoster = Store.hasActiveMembers(g);

    circleToolbar.hidden = !isCircle;
    ringLayer.hidden = !isCircle;
    mobileCircleGrid.hidden = !isCircle;
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

    // 1. 平板／電腦：外圈圓點環繞（pos=0 在 6 點鐘正下方起點）
    const cx = 480;
    const cy = 390;
    const rx = 316;
    const ry = 304;
    const ringFrag = document.createDocumentFragment();

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

      if (pos === 0 && hasRoster) {
        const tag = document.createElement('span');
        tag.className = 'role-pill circle-parent-pill';
        tag.textContent = '家長';
        btn.appendChild(tag);
      }

      btn.setAttribute('aria-label', `第 ${turn} 位，點選開始計時`);
      ringFrag.appendChild(btn);
    }
    ringLayer.replaceChildren(ringFrag);

    // 2. 手機版：依分享順序 1, 2, 3 … N 排列的大拇指點選格
    const step = isCw ? 1 : -1;
    const mobileFrag = document.createDocumentFragment();
    for (let k = 0; k < total; k++) {
      const pos = (((0 + step * k) % total) + total) % total;
      const turn = k + 1;
      const isCurrent = pos === activeIdx;
      const isDone = done.includes(pos) && !isCurrent;

      const mBtn = document.createElement('button');
      mBtn.type = 'button';
      mBtn.className = 'mobile-num-btn' +
        (isCurrent ? ' is-current' : '') +
        (isDone ? ' is-done' : '') +
        (isCurrent && mode === 'over' ? ' is-over' : '');
      mBtn.dataset.pos = String(pos);

      const numEl = document.createElement('span');
      numEl.className = 'mobile-num-digit';
      numEl.textContent = String(turn);
      mBtn.appendChild(numEl);

      if (turn === 1 && hasRoster) {
        const sub = document.createElement('span');
        sub.className = 'mobile-num-sub';
        sub.textContent = '家長';
        mBtn.appendChild(sub);
      }
      mBtn.setAttribute('aria-label', `第 ${turn} 位，點選開始計時`);
      mobileFrag.appendChild(mBtn);
    }
    mobileCircleGrid.replaceChildren(mobileFrag);
  }

  return { renderCircle };
}

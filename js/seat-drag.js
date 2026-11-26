/* 桌次座位拖曳排位控制器（支援 iPad 觸控與滑鼠 Pointer Events）：
   - 家長 (index 0，下中) 與副家長 (index 1，上中) 座位固定鎖定不變
   - 其餘 10 個組員座位 (index 2..11) 可隨時直接拖曳換座位，或開啟「排座位」模式包含空位自由對調 */

import { isLockedRoleIndex, Store } from './store.js';

const DRAG_THRESHOLD_PX = 10;

export function initSeatDrag({ stageCanvas, seatButtons, isArrangeMode, onTapSeat, onSeatsSwapped, announce }) {
  let drag = null;
  let ghostEl = null;

  function removeGhost() {
    if (ghostEl) {
      ghostEl.remove();
      ghostEl = null;
    }
  }

  function createGhost(name, x, y) {
    removeGhost();
    ghostEl = document.createElement('div');
    ghostEl.className = 'seat-drag-ghost';
    ghostEl.textContent = name;
    ghostEl.style.left = `${x}px`;
    ghostEl.style.top = `${y}px`;
    document.body.appendChild(ghostEl);
  }

  function findDropSeatIndex(clientX, clientY) {
    for (let i = 0; i < seatButtons.length; i++) {
      if (isLockedRoleIndex(i)) continue;
      const btn = seatButtons[i];
      if (btn.hidden) continue;
      const r = btn.getBoundingClientRect();
      if (clientX >= r.left - 8 && clientX <= r.right + 8 && clientY >= r.top - 8 && clientY <= r.bottom + 8) {
        return i;
      }
    }
    return -1;
  }

  function setDropHighlight(overIdx, fromIdx) {
    seatButtons.forEach((btn, idx) => {
      btn.classList.toggle('is-drop-over', idx === overIdx && idx !== fromIdx && !isLockedRoleIndex(idx));
    });
  }

  stageCanvas.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('button.ring-seat');
    if (!btn) return;
    const idx = Number(btn.dataset.index);
    if (!Number.isInteger(idx)) return;

    const g = Store.getActiveGroup();
    const seat = g.seats[idx];

    // 家長與副家長在桌次模式下座位固定不變：排位模式下輕點給予提示，一般模式下照常點選計時
    if (isLockedRoleIndex(idx)) {
      if (isArrangeMode()) {
        announce('家長與副家長的座位固定不變');
      } else if (seat?.name) {
        drag = { pointerId: e.pointerId, fromIdx: idx, lockedTapOnly: true, startX: e.clientX, startY: e.clientY, moved: false };
      }
      return;
    }

    if (!seat?.name) return; // 空座位不能當起點拖出，但可作為被放入的目標

    stageCanvas.setPointerCapture(e.pointerId);
    drag = {
      pointerId: e.pointerId,
      fromIdx: idx,
      overIdx: idx,
      name: seat.name,
      lockedTapOnly: false,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
  });

  stageCanvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dist = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);

    if (drag.lockedTapOnly) {
      if (dist >= DRAG_THRESHOLD_PX) drag.moved = true;
      return;
    }

    if (!drag.moved && dist >= DRAG_THRESHOLD_PX) {
      drag.moved = true;
      stageCanvas.classList.add('is-dragging-seats');
      seatButtons[drag.fromIdx].classList.add('is-drag-source');
      // 拖曳開始時暫時把空組員座位也顯示出來，方便拖到空位
      seatButtons.forEach((b, i) => {
        if (!isLockedRoleIndex(i) && b.hidden) {
          b.hidden = false;
          b.dataset.tempEmpty = 'true';
          b.className = `ring-seat ring-seat-${b.dataset.side} is-empty-slot`;
          b.textContent = '空位';
        }
      });
      createGhost(drag.name, e.clientX, e.clientY);
    }

    if (drag.moved && ghostEl) {
      ghostEl.style.left = `${e.clientX}px`;
      ghostEl.style.top = `${e.clientY}px`;
      const over = findDropSeatIndex(e.clientX, e.clientY);
      drag.overIdx = over;
      setDropHighlight(over, drag.fromIdx);
    }
  });

  function endPointer(e, cancelled = false) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const cur = drag;
    drag = null;

    removeGhost();
    stageCanvas.classList.remove('is-dragging-seats');
    seatButtons.forEach((b) => {
      b.classList.remove('is-drag-source', 'is-drop-over');
      if (b.dataset.tempEmpty === 'true') {
        delete b.dataset.tempEmpty;
        if (!isArrangeMode()) b.hidden = true;
      }
    });

    if (cancelled) return;

    if (!cur.moved) {
      if (!isArrangeMode()) {
        onTapSeat(cur.fromIdx);
      }
      return;
    }

    if (!cur.lockedTapOnly && cur.overIdx >= 2 && cur.overIdx !== cur.fromIdx) {
      if (Store.swapMemberSeats(cur.fromIdx, cur.overIdx)) {
        onSeatsSwapped();
        announce(`${cur.name} 已更換座位`);
      }
    }
  }

  stageCanvas.addEventListener('pointerup', (e) => endPointer(e, false));
  stageCanvas.addEventListener('pointercancel', (e) => endPointer(e, true));
}

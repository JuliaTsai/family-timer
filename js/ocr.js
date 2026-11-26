/* 現場紙本名單拍照／上傳 OCR 模組（本機 Canvas 拉框裁切 ＋ 去陰影二值化 ＋ 按需載入離線快取 Tesseract.js） */

const TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
const MAX_IMAGE_DIM = 1800;

let tesseractPromise = null;
let cachedWorker = null;

function loadTesseractScript() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (tesseractPromise) return tesseractPromise;
  tesseractPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TESSERACT_CDN;
    script.async = true;
    script.onload = () => (window.Tesseract ? resolve(window.Tesseract) : reject(new Error('OCR 載入失敗')));
    script.onerror = () => {
      tesseractPromise = null;
      reject(new Error('無法載入辨識引擎，請確認首次使用時有網路連線'));
    };
    document.head.appendChild(script);
  });
  return tesseractPromise;
}

async function getOcrWorker(onProgress) {
  const Tesseract = await loadTesseractScript();
  if (cachedWorker) return cachedWorker;
  cachedWorker = await Tesseract.createWorker('chi_tra', 1, {
    logger: (m) => {
      if (typeof onProgress === 'function' && m && typeof m.progress === 'number') {
        const label = m.status && m.status.includes('recognizing') ? '辨識紙本文字中' : '準備繁中辨識字庫（首次下載後自動離線快取）';
        onProgress(label, Math.round(m.progress * 100));
      }
    },
  });
  return cachedWorker;
}

/** 裁切選取區塊並執行灰階對比強化（消除教室黃光與紙本陰影，提升印刷中文字辨識率） */
function buildPreprocessedCropCanvas(sourceCanvas, rect) {
  const sx = Math.max(0, Math.round(rect.x * sourceCanvas.width));
  const sy = Math.max(0, Math.round(rect.y * sourceCanvas.height));
  const sw = Math.max(24, Math.min(sourceCanvas.width - sx, Math.round(rect.w * sourceCanvas.width)));
  const sh = Math.max(24, Math.min(sourceCanvas.height - sy, Math.round(rect.h * sourceCanvas.height)));

  // 適當放大讓小字號表格更清晰
  const scale = sw < 600 ? 2 : 1.4;
  const out = document.createElement('canvas');
  out.width = Math.round(sw * scale);
  out.height = Math.round(sh * scale);
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, out.width, out.height);

  const imgData = ctx.getImageData(0, 0, out.width, out.height);
  const d = imgData.data;
  let minL = 255;
  let maxL = 0;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (lum < minL) minL = lum;
    if (lum > maxL) maxL = lum;
  }
  const span = Math.max(40, maxL - minL);
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const norm = Math.max(0, Math.min(255, ((lum - minL) / span) * 255));
    // 柔和 S 曲線拉開白底與黑字，同時保留筆畫邊緣抗鋸齒（比硬切二值化更不易斷筆）
    const contrasted = norm > 185 ? 255 : norm < 85 ? 0 : Math.round(((norm - 85) / 100) * 255);
    d[i] = d[i + 1] = d[i + 2] = contrasted;
  }
  ctx.putImageData(imgData, 0, 0);
  return out;
}

export function initOcrModal({ modal, onApplyText }) {
  const cameraInput = modal.querySelector('#ocrCameraInput');
  const albumInput = modal.querySelector('#ocrAlbumInput');
  const stageWrap = modal.querySelector('#ocrStageWrap');
  const canvas = modal.querySelector('#ocrCanvas');
  const cropBox = modal.querySelector('#ocrCropBox');
  const rotateBtn = modal.querySelector('#ocrRotateBtn');
  const runBtn = modal.querySelector('#ocrRunBtn');
  const statusEl = modal.querySelector('#ocrStatus');
  const resultWrap = modal.querySelector('#ocrResultWrap');
  const resultArea = modal.querySelector('#ocrResultText');
  const applyBtn = modal.querySelector('#ocrApplyBtn');
  const closeBtns = modal.querySelectorAll('[data-ocr-close]');

  let loadedImg = null;
  let rotation = 0;
  let crop = { x: 0.06, y: 0.08, w: 0.45, h: 0.84 }; // 預設框在左側「執事＋學員姓名」欄
  let dragState = null;

  function renderCropOverlay() {
    cropBox.style.left = `${(crop.x * 100).toFixed(2)}%`;
    cropBox.style.top = `${(crop.y * 100).toFixed(2)}%`;
    cropBox.style.width = `${(crop.w * 100).toFixed(2)}%`;
    cropBox.style.height = `${(crop.h * 100).toFixed(2)}%`;
  }

  function drawSourceCanvas() {
    if (!loadedImg) return;
    const rad = (rotation * Math.PI) / 180;
    const swap = rotation % 180 !== 0;
    const rawW = swap ? loadedImg.naturalHeight : loadedImg.naturalWidth;
    const rawH = swap ? loadedImg.naturalWidth : loadedImg.naturalHeight;
    const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(rawW, rawH));
    canvas.width = Math.max(1, Math.round(rawW * scale));
    canvas.height = Math.max(1, Math.round(rawH * scale));
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rad);
    const drawW = loadedImg.naturalWidth * scale;
    const drawH = loadedImg.naturalHeight * scale;
    ctx.drawImage(loadedImg, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
    stageWrap.hidden = false;
    rotateBtn.hidden = false;
    runBtn.disabled = false;
    renderCropOverlay();
  }

  function handleFile(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      loadedImg = img;
      rotation = 0;
      crop = { x: 0.05, y: 0.08, w: 0.42, h: 0.84 };
      resultWrap.hidden = true;
      applyBtn.hidden = true;
      statusEl.textContent = '請拖曳綠色框，只框住紙本上的「姓名欄（或執事＋姓名欄）」，再按開始辨識。';
      drawSourceCanvas();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      statusEl.textContent = '無法讀取這張圖片，請換一張再試。';
    };
    img.src = url;
  }

  cameraInput.addEventListener('change', (e) => { handleFile(e.target.files?.[0]); e.target.value = ''; });
  albumInput.addEventListener('change', (e) => { handleFile(e.target.files?.[0]); e.target.value = ''; });

  rotateBtn.addEventListener('click', () => {
    rotation = (rotation + 90) % 360;
    drawSourceCanvas();
  });

  // 支援直接在圖片上拖拉新框，或拖曳現有框的角落／內部移動
  stageWrap.addEventListener('pointerdown', (e) => {
    if (!loadedImg) return;
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const px = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const py = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    const handle = e.target.dataset?.handle || '';
    const inside = px >= crop.x && px <= crop.x + crop.w && py >= crop.y && py <= crop.y + crop.h;

    stageWrap.setPointerCapture(e.pointerId);
    dragState = {
      pointerId: e.pointerId,
      mode: handle || (inside ? 'move' : 'new'),
      startX: px,
      startY: py,
      orig: { ...crop },
      rect: r,
    };
    e.preventDefault();
  });

  stageWrap.addEventListener('pointermove', (e) => {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    const r = dragState.rect;
    const px = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const py = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    const dx = px - dragState.startX;
    const dy = py - dragState.startY;
    const o = dragState.orig;

    if (dragState.mode === 'move') {
      crop.x = Math.max(0, Math.min(1 - o.w, o.x + dx));
      crop.y = Math.max(0, Math.min(1 - o.h, o.y + dy));
    } else if (dragState.mode === 'br') {
      crop.w = Math.max(0.08, Math.min(1 - o.x, o.w + dx));
      crop.h = Math.max(0.08, Math.min(1 - o.y, o.h + dy));
    } else if (dragState.mode === 'tl') {
      const nx = Math.max(0, Math.min(o.x + o.w - 0.08, o.x + dx));
      const ny = Math.max(0, Math.min(o.y + o.h - 0.08, o.y + dy));
      crop.w = o.w + (o.x - nx);
      crop.h = o.h + (o.y - ny);
      crop.x = nx;
      crop.y = ny;
    } else {
      const x0 = Math.min(dragState.startX, px);
      const y0 = Math.min(dragState.startY, py);
      crop.x = x0;
      crop.y = y0;
      crop.w = Math.max(0.08, Math.abs(px - dragState.startX));
      crop.h = Math.max(0.08, Math.abs(py - dragState.startY));
    }
    renderCropOverlay();
  });

  const endDrag = (e) => {
    if (dragState && e.pointerId === dragState.pointerId) dragState = null;
  };
  stageWrap.addEventListener('pointerup', endDrag);
  stageWrap.addEventListener('pointercancel', endDrag);

  runBtn.addEventListener('click', async () => {
    if (!loadedImg) return;
    runBtn.disabled = true;
    statusEl.textContent = '正在準備離線辨識引擎…';
    try {
      const subCanvas = buildPreprocessedCropCanvas(canvas, crop);
      const worker = await getOcrWorker((label, pct) => {
        statusEl.textContent = `${label}（${pct}%）`;
      });
      const { data } = await worker.recognize(subCanvas);
      const cleaned = String(data?.text || '')
        .split(/\r?\n/)
        .map((l) => l.replace(/\s+/g, ' ').trim())
        .filter((l) => l.length > 0)
        .join('\n');
      resultArea.value = cleaned;
      resultWrap.hidden = false;
      applyBtn.hidden = false;
      statusEl.textContent = cleaned
        ? '辨識完成！可在下方微調文字，確認後按「填入座位名單」。'
        : '未辨識到清楚文字，請縮小綠色框對準姓名欄或重新拍攝。';
    } catch (err) {
      statusEl.textContent = err?.message || '辨識失敗，請確認光線充足或改用「一次貼上多個名字」。';
    } finally {
      runBtn.disabled = false;
    }
  });

  applyBtn.addEventListener('click', () => {
    const txt = resultArea.value.trim();
    if (!txt) return;
    onApplyText(txt);
    close();
  });

  function open() {
    modal.hidden = false;
    statusEl.textContent = loadedImg
      ? '可調整綠色框範圍後重新辨識，或重新拍照。'
      : '拍下現場紙本印出來的名單，框選「姓名」欄位即可自動填入（照片不會上傳任何伺服器）。';
  }

  function close() {
    modal.hidden = true;
  }

  closeBtns.forEach((b) => b.addEventListener('click', close));
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

  return { open, close };
}

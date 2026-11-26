/* 共用 SVG 圖示產生器（全面取代純文字符號，確保 Windows / iPad / iPhone 視覺一致） */

const SVG_NS = 'http://www.w3.org/2000/svg';

const ICON_DEFS = {
  female: {
    viewBox: '0 0 22 22',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.8',
    paths: [
      ['circle', { cx: '11', cy: '8.5', r: '5' }],
      ['path', { d: 'M11 13.5V20M8 17h6' }],
    ],
  },
  male: {
    viewBox: '0 0 22 22',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.8',
    paths: [
      ['circle', { cx: '9', cy: '13', r: '5' }],
      ['path', { d: 'M12.6 9.4 18 4M13 4h5v5' }],
    ],
  },
  menu: {
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.6',
    paths: [['path', { d: 'M3 6.5h14M3 13.5h9' }]],
  },
  pauseSolid: {
    viewBox: '0 0 16 16',
    fill: 'currentColor',
    paths: [
      ['rect', { x: '3', y: '2', width: '3.2', height: '12', rx: '1.2' }],
      ['rect', { x: '9.8', y: '2', width: '3.2', height: '12', rx: '1.2' }],
    ],
  },
  playSolid: {
    viewBox: '0 0 16 16',
    fill: 'currentColor',
    paths: [
      ['path', { d: 'M4 2.6v10.8a.9.9 0 0 0 1.38.76l8.6-5.4a.9.9 0 0 0 0-1.52l-8.6-5.4A.9.9 0 0 0 4 2.6Z' }],
    ],
  },
  stopSolid: {
    viewBox: '0 0 16 16',
    fill: 'currentColor',
    paths: [['rect', { x: '3', y: '3', width: '10', height: '10', rx: '2.4' }]],
  },
  check: {
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    paths: [['path', { d: 'M4 10.5l4 4L16 6.5' }]],
  },
  close: {
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.8',
    paths: [['path', { d: 'M5 5l10 10M15 5L5 15' }]],
  },
  camera: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.8',
    paths: [
      ['path', { d: 'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z' }],
      ['circle', { cx: '12', cy: '13', r: '3.2' }],
    ],
  },
  paste: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.8',
    paths: [
      ['rect', { x: '8', y: '2', width: '8', height: '4', rx: '1.2' }],
      ['path', { d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' }],
      ['path', { d: 'M8 11h8M8 15.5h6' }],
    ],
  },
  bell: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.8',
    paths: [
      ['path', { d: 'M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15Z' }],
      ['path', { d: 'M10 20.5a2.2 2.2 0 0 0 4 0' }],
    ],
  },
  reset: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.8',
    paths: [
      ['path', { d: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3' }],
      ['path', { d: 'M4.5 4.5v4h4' }],
    ],
  },
  edit: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.8',
    paths: [
      ['path', { d: 'M14.5 5.5l4 4M4.5 19.5l1-4.5L15.8 4.7a1.4 1.4 0 0 1 2 0l1.5 1.5a1.4 1.4 0 0 1 0 2L9 18.5Z' }],
    ],
  },
  plus: {
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.9',
    paths: [['path', { d: 'M10 4v12M4 10h12' }]],
  },
  trash: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.8',
    paths: [
      ['path', { d: 'M4 7h16M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7' }],
      ['path', { d: 'M6.5 7l.8 12.2A2 2 0 0 0 9.3 21h5.4a2 2 0 0 0 2-1.8L17.5 7' }],
    ],
  },
  rotate: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.8',
    paths: [
      ['path', { d: 'M21 12a9 9 0 1 1-2.64-6.36L21 8' }],
      ['path', { d: 'M21 3v5h-5' }],
    ],
  },
};

export function createIcon(name, { size = 20, className = '', label = '' } = {}) {
  const def = ICON_DEFS[name];
  const svg = document.createElementNS(SVG_NS, 'svg');
  if (!def) return svg;
  svg.setAttribute('viewBox', def.viewBox);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', def.fill || 'none');
  if (def.stroke) {
    svg.setAttribute('stroke', def.stroke);
    svg.setAttribute('stroke-width', def.strokeWidth || '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
  }
  if (className) svg.setAttribute('class', className);
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  def.paths.forEach(([tag, attrs]) => {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    svg.appendChild(node);
  });
  return svg;
}

// Builds DOM nodes; text is always set as text, never parsed as HTML.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === false || value === null || value === undefined) continue;
    if (key === 'class') el.className = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

const SVG = 'http://www.w3.org/2000/svg';
// The product mark, "lens on the stop": a magnifier inspecting the stop bar (same drawing as scripts/icon.mjs).
export function mark() {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 128 128');
  svg.setAttribute('class', 'mark');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<circle cx="56" cy="56" r="30" fill="none" stroke="currentColor" stroke-width="13"/>' +
    '<path class="mark-bar" d="M56 42v28" stroke-width="13" stroke-linecap="round"/>' +
    '<path d="M78 78l22 22" stroke="currentColor" stroke-width="15" stroke-linecap="round"/>';
  return svg;
}

export function formatTime(ms) {
  const d = new Date(ms);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return new Date().toDateString() === d.toDateString() ? `Today, ${time}` : `${d.toISOString().slice(0, 10)} ${time}`;
}

export const CHROME_ERRORS = {
  'net::ERR_NAME_NOT_RESOLVED': 'Name not resolved',
  'net::ERR_NAME_RESOLUTION_FAILED': 'Name lookup failed',
  'net::ERR_ADDRESS_INVALID': 'Address not usable',
  'net::ERR_ADDRESS_UNREACHABLE': 'Address unreachable',
  'net::ERR_CONNECTION_REFUSED': 'Connection refused',
};

// A "?" button that explains a term on hover or keyboard focus. The text lives in a role=tooltip element.
let tipCount = 0;
export function tip(text, label = 'What does this mean?') {
  const id = `tip-${++tipCount}`;
  return h('span', { class: 'tipwrap' },
    h('button', { type: 'button', class: 'tip', 'aria-label': label, 'aria-describedby': id }, '?'),
    h('span', { class: 'tipbox', role: 'tooltip', id }, text));
}

// Light / dark / system theme switch. The choice is stored per browser; the
// inline script in <head> applies it before the first paint.
const KEY = 'mgg-theme';
const MODES = ['system', 'light', 'dark'];
const media = matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set();

const ICONS = {
  system: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  light: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  dark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
};
const LABELS = { system: 'System', light: 'Light', dark: 'Dark' };

export function getMode() {
  try {
    const t = localStorage.getItem(KEY);
    if (MODES.includes(t)) return t;
  } catch { /* storage blocked */ }
  return 'system';
}

export function isDark() {
  const mode = getMode();
  return mode === 'dark' || (mode === 'system' && media.matches);
}

export function setMode(mode) {
  try {
    if (mode === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  } catch { /* storage blocked */ }
  if (mode === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = mode;
  notify();
}

/** Called whenever the effective theme may have changed. */
export function onThemeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  renderToggle();
  for (const fn of listeners) fn(isDark());
}

function renderToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  const mode = getMode();
  btn.innerHTML = `${ICONS[mode]}<span>${LABELS[mode]}</span>`;
  btn.setAttribute('aria-label', `Theme: ${LABELS[mode]}. Click to change.`);
}

media.addEventListener('change', notify);
document.getElementById('theme-toggle')?.addEventListener('click', () => {
  setMode(MODES[(MODES.indexOf(getMode()) + 1) % MODES.length]);
});
renderToggle();

// Small UI kit: element builder, event bus, popovers/menus, tooltips, toasts, modals, sliding segmented control.
import { icon } from './icons.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(kid));
  return e;
}

// Only touch the DOM when a value actually changed, so live readouts never cause layout work.
export const setText = (node, text) => { if (node && node.textContent !== text) node.textContent = text; };
export const setStyleVar = (node, name, v) => { if (node && node.style.getPropertyValue(name) !== v) node.style.setProperty(name, v); };

export const fmtTime = (s) => {
  s = Math.max(0, s || 0);
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

// ── event bus ─────────────────────────────────────────────────────────────
const handlers = new Map();
export const bus = {
  on(evt, fn) { (handlers.get(evt) || handlers.set(evt, new Set()).get(evt)).add(fn); return () => handlers.get(evt)?.delete(fn); },
  emit(evt, payload) { handlers.get(evt)?.forEach((fn) => fn(payload)); },
};

// ── tooltips (any element with data-tip, optional data-kbd) ───────────────
// Mouse clicks shouldn't leave a button focused (it would swallow Space). Keyboard focus is untouched.
export function initFocusHygiene() {
  document.addEventListener('click', (e) => { if (e.detail > 0 && !e.target.closest('.popover, .modal')) e.target.closest?.('button')?.blur(); });
}

export function initTooltips() {
  const tip = el('div', { id: 'tip', role: 'tooltip' });
  document.body.append(tip);
  let timer, current;
  const show = (target) => {
    const text = target.dataset.tip;
    if (!text) return;
    tip.innerHTML = '';
    tip.append(el('span', { text }));
    if (target.dataset.kbd) for (const k of target.dataset.kbd.split(' ')) tip.append(el('span', { class: 'kbd', text: k }));
    const r = target.getBoundingClientRect();
    tip.classList.add('on');
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    const below = target.dataset.tipPos === 'below' || r.top < th + 16;
    const x = Math.max(8, Math.min(innerWidth - tw - 8, r.left + r.width / 2 - tw / 2));
    tip.style.left = `${x}px`;
    tip.style.top = `${below ? r.bottom + 8 : r.top - th - 8}px`;
  };
  const hide = () => { clearTimeout(timer); tip.classList.remove('on'); current = null; };
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest?.('[data-tip]');
    if (!t || t === current) return;
    current = t; clearTimeout(timer);
    timer = setTimeout(() => show(t), tip.classList.contains('on') ? 0 : 380);
  });
  document.addEventListener('pointerout', (e) => { const t = e.target.closest?.('[data-tip]'); if (t && !t.contains(e.relatedTarget)) hide(); });
  document.addEventListener('pointerdown', hide, true);
  document.addEventListener('keydown', hide, true);
  document.addEventListener('focusin', (e) => { const t = e.target.closest?.('[data-tip]'); if (t && e.target.matches(':focus-visible')) { current = t; show(t); } });
  document.addEventListener('focusout', hide);
}

// ── popover / menu ────────────────────────────────────────────────────────
let openPopover = null;
export function closePopover() { openPopover?.close(); }

export function popover(anchor, content, { align = 'start', width, onClose, offset = 8 } = {}) {
  closePopover();
  const pop = el('div', { class: 'popover', role: 'menu' }, content);
  if (width) pop.style.width = `${Math.min(width, innerWidth - 20)}px`; // never wider than the screen
  document.body.append(pop);
  anchor.setAttribute('aria-expanded', 'true');
  const place = () => {
    const r = anchor.getBoundingClientRect();
    pop.style.maxHeight = 'none';
    const pw = pop.offsetWidth, want = pop.scrollHeight;
    const roomBelow = innerHeight - r.bottom - offset - 10, roomAbove = r.top - offset - 10;
    const below = want <= roomBelow || roomBelow >= roomAbove;
    pop.style.maxHeight = `${Math.max(120, below ? roomBelow : roomAbove)}px`; // a tall panel scrolls instead of running off the screen
    const ph = pop.offsetHeight;
    let x = align === 'end' ? r.right - pw : align === 'center' ? r.left + r.width / 2 - pw / 2 : r.left;
    x = Math.max(10, Math.min(innerWidth - pw - 10, x));
    pop.style.left = `${x}px`;
    pop.style.top = `${below ? r.bottom + offset : r.top - ph - offset}px`;
    pop.style.setProperty('--ox', `${r.left + r.width / 2 - x}px`);
    pop.style.setProperty('--oy', below ? '0' : '100%');
  };
  place();
  requestAnimationFrame(() => pop.classList.add('on'));
  const items = () => $$('.menu-item', pop);
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); api.close(); anchor.focus?.(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const list = items(); if (!list.length) return; // a panel of sliders keeps its own arrow keys
      e.preventDefault();
      const i = list.indexOf(document.activeElement);
      list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length].focus();
    }
  };
  const onDown = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) api.close(); };
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('pointerdown', onDown, true);
  window.addEventListener('resize', place);
  const api = {
    el: pop,
    place,
    close() {
      if (openPopover !== api) return;
      openPopover = null;
      anchor.setAttribute('aria-expanded', 'false');
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('resize', place);
      pop.classList.remove('on');
      setTimeout(() => pop.remove(), 200);
      onClose?.();
    },
  };
  openPopover = api;
  setTimeout(() => items()[0]?.focus({ preventScroll: true }), 30);
  return api;
}

export function menuItem({ icon: ic, label, sub, checked, onClick, right }) {
  return el('button', { class: 'menu-item', role: checked != null ? 'menuitemradio' : 'menuitem', 'aria-checked': checked == null ? null : String(!!checked), onclick: onClick },
    ic ? el('span', { html: icon(ic, 18) }) : null,
    el('span', { class: 'grow' }, el('span', { text: label }), sub ? el('small', { text: sub }) : null),
    right || null,
    checked ? el('span', { class: 'check', html: icon('check', 16, 'check') }) : null);
}

// ── toasts ────────────────────────────────────────────────────────────────
export function toast(msg, { kind = 'info', ms = 4200 } = {}) {
  const host = $('#toasts');
  while (host.children.length >= 3) host.firstChild.remove();
  const ic = { ok: 'check', warn: 'alert', error: 'alert', info: 'info' }[kind];
  const t = el('div', { class: `toast ${kind}`, role: 'status' }, el('span', { html: icon(ic, 18) }), el('span', { class: 'msg', text: msg }),
    el('button', { class: 'btn icon sm ghost', 'aria-label': 'Dismiss', html: icon('close', 14), onclick: () => dismiss() }));
  const dismiss = () => { t.classList.add('out'); setTimeout(() => t.remove(), 260); };
  host.append(t);
  if (ms) setTimeout(dismiss, ms);
  return dismiss;
}

// ── modal ─────────────────────────────────────────────────────────────────
export function modal({ title, sub, body, footer, onClose }) {
  closePopover();
  const prev = document.activeElement;
  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    back.classList.remove('on');
    setTimeout(() => back.remove(), 240);
    prev?.focus?.({ preventScroll: true });
    onClose?.();
  };
  const dlg = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    el('header', {}, el('div', {}, el('h2', { text: title }), sub ? el('div', { class: 'muted', text: sub }) : null),
      el('button', { class: 'btn icon ghost', 'aria-label': 'Close', html: icon('close', 18), onclick: close })),
    body, footer ? el('footer', {}, footer) : null);
  const back = el('div', { class: 'backdrop', onpointerdown: (e) => e.target === back && close() }, dlg);
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    if (e.key === 'Tab') {
      const f = $$('button, input, [tabindex]:not([tabindex="-1"])', dlg).filter((x) => !x.disabled && x.offsetParent);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener('keydown', onKey, true);
  document.body.append(back);
  requestAnimationFrame(() => { back.classList.add('on'); (dlg.querySelector('[data-autofocus]') || dlg.querySelector('button'))?.focus({ preventScroll: true }); });
  return { close, el: dlg };
}

// ── sliding thumb for a segmented control ─────────────────────────────────
export function segIndicator(seg) {
  const update = () => {
    const on = seg.querySelector('.on, [aria-pressed="true"], [aria-selected="true"]');
    if (!on) { seg.style.setProperty('--io', '0'); return; }
    const sr = seg.getBoundingClientRect(), r = on.getBoundingClientRect();
    seg.style.setProperty('--ix', `${r.left - sr.left}px`);
    seg.style.setProperty('--iw', `${r.width}px`);
    seg.style.setProperty('--io', '1');
  };
  new ResizeObserver(update).observe(seg);
  return update;
}

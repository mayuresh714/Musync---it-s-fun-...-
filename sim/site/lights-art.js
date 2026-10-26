// Drawings for the light collection: a still icon and a small moving picture for each family of light.
// Motion is CSS (see .la-* in site.css) so it costs nothing and stops for people who asked for less motion.
const C = { beam: '#6ab7ff', spot: '#b58cff', wash: '#ffb454', pixel: '#5ee6a8', tube: '#7be0ff', matrix: '#d29bff', strobe: '#f3f4f8', blinder: '#ffd98a', laser: '#ff5c7a' };
export const colour = (id) => C[id];

const body = (x, y, w = 26, h = 16) => `<rect x="${x - w / 2}" y="${y}" width="${w}" height="${h}" rx="4" fill="#2a2f40" stroke="#4a5170"/><rect x="${x - w / 2 + 3}" y="${y + 3}" width="${w - 6}" height="3" rx="1.5" fill="#6a7194"/>`;
const defs = (id, c) => `<defs><linearGradient id="g-${id}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${c}" stop-opacity="1"/><stop offset="1" stop-color="${c}" stop-opacity="0.85"/></linearGradient>
<radialGradient id="r-${id}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${c}" stop-opacity=".85"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient></defs>`;

const ART = {
  beam: (c) => `${defs('beam', c)}
    <g class="la-sweep" style="transform-origin:160px 150px">
      ${[-34, -17, 0, 17, 34].map((a) => `<path d="M160 150 L${160 + Math.sin((a * Math.PI) / 180) * 200} ${150 - Math.cos((a * Math.PI) / 180) * 200}" stroke="${c}" stroke-width="2.4" stroke-linecap="round" opacity=".95"/>`).join('')}
    </g>
    <g class="la-sweep rev" style="transform-origin:160px 150px"><path d="M160 150 L160 -40" stroke="#fff" stroke-width="1.4" opacity=".8"/></g>
    ${body(160, 148)}<circle cx="160" cy="150" r="3" fill="#fff"/>`,
  spot: (c) => `${defs('spot', c)}
    <ellipse cx="160" cy="158" rx="130" ry="12" fill="#151827"/>
    <g class="la-drift"><path d="M160 28 L124 154 L196 154 Z" fill="url(#g-spot)" opacity=".28"/><ellipse cx="160" cy="154" rx="36" ry="7" fill="${c}" opacity=".6"/>
      <g fill="#0b0d14"><circle cx="160" cy="124" r="5.5"/><path d="M154 130h12l3 22h-5l-2-9-2 9h-5z"/></g></g>
    ${body(160, 18)}`,
  wash: (c) => `${defs('wash', c)}
    <g class="la-hue"><path d="M160 24 L40 160 L280 160 Z" fill="url(#g-wash)" opacity=".42"/><ellipse cx="160" cy="160" rx="132" ry="18" fill="${c}" opacity=".45"/></g>
    ${body(160, 12, 34, 14)}`,
  pixel: (c) => `<g>${Array.from({ length: 16 }, (_, i) => `<circle class="la-lamp" style="--d:${(i * 0.09).toFixed(2)}s" cx="${44 + i * 15.4}" cy="90" r="5.2" fill="${c}"/>`).join('')}</g>
    <rect x="34" y="82" width="252" height="16" rx="8" fill="none" stroke="#3a4060"/>
    <g opacity=".5">${Array.from({ length: 16 }, (_, i) => `<circle class="la-lamp" style="--d:${(i * 0.09 + 0.45).toFixed(2)}s" cx="${44 + i * 15.4}" cy="130" r="3.4" fill="${c}"/>`).join('')}</g>`,
  tube: (c) => [70, 160, 250].map((x, k) => `<rect x="${x - 9}" y="14" width="18" height="150" rx="9" fill="none" stroke="#3a4060"/>${Array.from({ length: 11 }, (_, i) => `<circle class="la-lamp" style="--d:${((10 - i) * 0.1 + k * 0.25).toFixed(2)}s" cx="${x}" cy="${28 + i * 12.4}" r="4.8" fill="${c}"/>`).join('')}`).join(''),
  matrix: (c) => `<rect x="48" y="16" width="224" height="148" rx="8" fill="#0b0d14" stroke="#3a4060"/>${Array.from({ length: 6 }, (_, r) => Array.from({ length: 11 }, (_, k) => `<rect class="la-cell" style="--d:${((k + r) * 0.12).toFixed(2)}s" x="${56 + k * 20}" y="${24 + r * 23.4}" width="16" height="19" rx="3" fill="${c}"/>`).join('')).join('')}`,
  strobe: (c) => `<g class="la-flash"><circle cx="160" cy="92" r="104" fill="url(#r-strobe)"/>${Array.from({ length: 12 }, (_, i) => `<path d="M160 92 L${160 + Math.cos((i * Math.PI) / 6) * 150} ${92 + Math.sin((i * Math.PI) / 6) * 150}" stroke="#fff" stroke-width="2" opacity=".7"/>`).join('')}</g>${defs('strobe', c)}
    <rect x="96" y="82" width="128" height="20" rx="5" fill="#2a2f40" stroke="#4a5170"/>${Array.from({ length: 8 }, (_, i) => `<rect class="la-flash" style="--d:${(i % 2) * 0.09}s" x="${102 + i * 15.4}" y="86" width="11" height="12" rx="2" fill="#fff"/>`).join('')}`,
  blinder: (c) => `${defs('blinder', c)}<g class="la-breathe"><path d="M160 60 L10 180 L310 180 Z" fill="url(#g-blinder)" opacity=".33"/></g>
    <rect x="102" y="36" width="116" height="52" rx="8" fill="#2a2f40" stroke="#4a5170"/>${[[124, 52], [196, 52], [124, 72], [196, 72]].map(([x, y]) => `<circle class="la-breathe" cx="${x}" cy="${y}" r="9.5" fill="${c}"/>`).join('')}`,
  laser: (c) => `<g class="la-sweep" style="transform-origin:160px 150px">${[-52, -36, -20, -4, 12, 28, 44].map((a) => `<path d="M160 150 L${160 + Math.sin((a * Math.PI) / 180) * 220} ${150 - Math.cos((a * Math.PI) / 180) * 220}" stroke="${c}" stroke-width="1.6" opacity=".95"/>`).join('')}</g>
    <path class="la-draw" d="M110 70 L160 30 L210 70 L160 110 Z" fill="none" stroke="#5effb0" stroke-width="2" stroke-linejoin="round"/>
    ${body(160, 150, 28, 14)}<circle cx="160" cy="152" r="2.6" fill="#fff"/>`,
};

export const art = (id) => `<svg viewBox="0 0 320 180" role="img" aria-hidden="true" preserveAspectRatio="xMidYMid slice">${ART[id](C[id])}</svg>`;

// a small still icon for chips (24 grid)
const ICON = {
  beam: '<path d="M12 20 4 3M12 20V2M12 20 20 3" stroke-width="1.6"/><rect x="9" y="19" width="6" height="3.4" rx="1" fill="currentColor"/>',
  spot: '<path d="M12 3 6.5 17h11z" opacity=".5"/><ellipse cx="12" cy="19" rx="6" ry="2"/><rect x="9.5" y="1.5" width="5" height="3" rx="1" fill="currentColor"/>',
  wash: '<path d="M12 4 3 20h18z" opacity=".5"/><path d="M5 20h14"/>',
  pixel: Array.from({ length: 6 }, (_, i) => `<circle cx="${4 + i * 3.2}" cy="12" r="1.3" fill="currentColor" stroke="none"/>`).join('') + '<rect x="2" y="9" width="20" height="6" rx="3"/>',
  tube: [6, 12, 18].map((x) => `<rect x="${x - 2}" y="3" width="4" height="18" rx="2"/>`).join(''),
  matrix: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14h18M9 4v16M15 4v16" opacity=".6"/>',
  strobe: '<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',
  blinder: '<rect x="4" y="3" width="16" height="7" rx="2"/><path d="M7 14l-3 7M12 14v7M17 14l3 7" opacity=".7"/>',
  laser: '<path d="M12 20 3 5M12 20 7 3M12 20l5-17M12 20 21 5"/><circle cx="12" cy="20" r="1.4" fill="currentColor" stroke="none"/>',
};
export const icon = (id, size = 36) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${C[id]}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[id]}</svg>`;

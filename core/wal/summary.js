// Human/LLM-readable digest of an analysis or WAL: the view the /wal skill reasons over,
// instead of thousands of raw numbers.

const mmss = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const bar = (v, w = 20) => '█'.repeat(Math.round(v * w)).padEnd(w, '·');

export function summarize(doc) {
  const isWal = !!doc.wal;
  const meta = isWal ? doc.meta : doc;
  const lines = [];
  lines.push(`${isWal ? `WAL ${doc.wal} — ${meta.title}${meta.artist ? ' / ' + meta.artist : ''}` : 'ANALYSIS'}`);
  lines.push(`duration ${mmss(meta.duration)}  bpm ${meta.bpm}  meter ${meta.meter || 4}/4  key ${meta.key || '?'}${isWal ? `  styles ${(meta.styles || []).join(',')}` : ''}`);
  const beats = isWal ? doc.timing.beats : doc.beats;
  lines.push(`beats ${beats.length}  first ${beats[0]?.toFixed(2)}s  last ${beats[beats.length - 1]?.toFixed(2)}s`);
  lines.push('');
  lines.push('SECTIONS  (energy bar is relative to the loudest section)');
  for (const s of doc.sections) {
    const bars = s.bars ? `${s.bars} bars` : '';
    lines.push(`  ${s.id.padEnd(4)} ${mmss(s.start).padStart(7)}–${mmss(s.end).padEnd(7)} ${s.kind.padEnd(10)} grp ${s.group || '-'}  e ${s.energy.toFixed(2)} ${bar(s.energy)} ${bars}${s.trend != null ? ` trend ${s.trend >= 0 ? '+' : ''}${s.trend}` : ''}${s.label ? `  "${s.label}"` : ''}${s.palette ? `  pal ${s.palette}` : ''}`);
  }
  lines.push('');
  lines.push('ACCENTS');
  const acc = doc.accents || [];
  if (!acc.length) lines.push('  (none)');
  for (const a of acc) lines.push(`  ${mmss(a.t).padStart(7)} ${a.type.padEnd(8)} s ${(a.strength ?? 1).toFixed(2)}${a.dur ? ` dur ${a.dur.toFixed(2)}s` : ''}${a.fx ? ` fx ${a.fx}` : ''}${a.note ? `  ${a.note}` : ''}`);
  const on = doc.onsets || {};
  lines.push('');
  lines.push(`ONSETS  low ${on.low?.length || 0}  mid ${on.mid?.length || 0}  high ${on.high?.length || 0}`);
  // onset density per section helps decide dandiya_tap / chase triggers
  for (const s of doc.sections) {
    const dens = (k) => ((on[k] || []).filter((o) => o[0] >= s.start && o[0] < s.end).length / Math.max(1, s.end - s.start)).toFixed(1);
    lines.push(`  ${s.id.padEnd(4)} per sec: low ${dens('low')}  mid ${dens('mid')}  high ${dens('high')}`);
  }
  if (isWal) {
    lines.push('');
    lines.push(`CUES ${doc.cues?.length || 0}`);
    for (const c of doc.cues || []) {
      const parts = ['move', 'dim', 'color'].filter((k) => c[k]).map((k) => `${k}:${c[k].look}${c[k].on ? '@' + c[k].on : ''}${c[k].speed ? '/' + c[k].speed : ''}`);
      lines.push(`  ${mmss(c.t).padStart(7)}${c.until ? '–' + mmss(c.until) : ''} ${c.layer.padEnd(7)} ${c.fx ? 'fx:' + c.fx + ' ' : ''}${parts.join(' ')}${c.note ? '  # ' + c.note : ''}`);
    }
  }
  return lines.join('\n');
}

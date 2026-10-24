// JSON Schema (draft-07) for WAL v1, built from the vocabulary so the two never drift.
// `node bin/wal.mjs schema` writes it out as docs/wal.schema.json for other implementers.
import { GROUPS, LAYER_NAMES, SECTION_KINDS, TRIGGERS, MOVE_LOOKS, POSES, DIM_LOOKS, COLOR_LOOKS, FX, ACCENT_TYPES, STYLES, STROBE_PATTERNS, PHRASE_ROLES, IMAGES } from './vocab.js';

const time = { type: 'number', minimum: 0 };
const unit = { type: 'number', minimum: 0, maximum: 1 };
const hex = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' };
const trigger = { enum: Object.keys(TRIGGERS) };
const envArr = { type: 'array', items: { type: 'integer', minimum: 0, maximum: 100 } };
const onsetArr = { type: 'array', items: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'number' } } };

const commonParams = {
  intensity: unit,
  speed: { type: 'number', exclusiveMinimum: 0, description: 'Beats per cycle (bigger = slower).' },
  spread: unit,
  size: unit,
  tilt: { type: 'number', minimum: -1, maximum: 1 },
  on: trigger,
  every: { type: 'integer', minimum: 1, description: 'Act on every Nth trigger.' },
  decay: { type: 'number', minimum: 0, description: 'Seconds.' },
  width: unit,
  direction: { enum: ['forward', 'reverse', 'bounce', 'out', 'in'] },
  split: { enum: ['lr', 'oddeven'] },
  density: unit,
  rate: { type: 'number', minimum: 0, maximum: 30, description: 'Flashes per second.' },
  ramp: { type: 'boolean' },
  env: { enum: ['energy', 'low', 'mid', 'high'] },
  palette: { type: 'string' },
  index: { type: 'integer', minimum: 0 },
  hex,
  pose: { enum: POSES },
  pattern: { enum: Object.keys(STROBE_PATTERNS) },
  seed: { type: 'integer', minimum: 0, maximum: 99999, description: 'Picks a variation of a figure.' },
  phase: unit,
  glide: { type: 'number', minimum: 0, maximum: 16, description: 'Beats over which this look eases in from the previous one (default: a few beats; 0 = cut).' },
  prism: { type: 'boolean', description: 'Insert the prism: each beam splits into a ring of rays.' },
};

const intent = (looks) => ({
  type: 'object',
  required: ['look'],
  properties: { look: { enum: Object.keys(looks) }, ...commonParams },
  additionalProperties: false,
});

export const WAL_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://musync.app/schema/wal-1.json',
  title: 'WAL — Wave Augmented Language v1',
  type: 'object',
  required: ['wal', 'meta', 'timing', 'sections'],
  properties: {
    wal: { const: '1.0' },
    meta: {
      type: 'object',
      required: ['title', 'duration'],
      properties: {
        title: { type: 'string' },
        artist: { type: 'string' },
        duration: time,
        bpm: { type: 'number', minimum: 20, maximum: 300 },
        meter: { type: 'integer', minimum: 2, maximum: 12 },
        key: { type: 'string' },
        styles: { type: 'array', items: { enum: Object.keys(STYLES) } },
        mood: { type: 'string' },
        language: { type: 'string' },
        audio: {
          type: 'object',
          properties: { file: { type: 'string' }, sha256: { type: 'string' }, duration: time },
        },
        generator: { type: 'string' },
        created: { type: 'string' },
        notes: { type: 'string' },
      },
    },
    timing: {
      type: 'object',
      required: ['beats'],
      properties: { beats: { type: 'array', items: time }, downbeats: { type: 'array', items: time } },
    },
    palettes: { type: 'object', additionalProperties: { type: 'array', minItems: 1, items: hex } },
    sections: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['id', 'start', 'end', 'kind', 'energy'],
        properties: {
          id: { type: 'string' },
          start: time,
          end: time,
          kind: { enum: Object.keys(SECTION_KINDS) },
          energy: unit,
          group: { type: 'string' },
          label: { type: 'string', description: 'Human label, e.g. "Mukhda", "Antara 1", "Drop 2".' },
          mood: { type: 'string' },
          palette: { type: 'string' },
          lyric: { type: 'string', description: 'Key lyric line or meaning, for the creative layer.' },
          move: { type: 'array', items: { type: 'string' }, description: 'Movement figures the director chose for this section (names from the MOVE looks).' },
        },
      },
    },
    motifs: {
      type: 'object',
      description: 'Recurring phrases of the song, by id. Phrases point at them.',
      additionalProperties: { type: 'object', properties: { name: { type: 'string' }, gist: { type: 'string' }, role: { enum: Object.keys(PHRASE_ROLES) } } },
    },
    phrases: {
      type: 'array',
      description: 'The lyric architecture: lines, refrains and taglines in time order. Cues follow them.',
      items: {
        type: 'object',
        required: ['t', 'until', 'role'],
        properties: {
          t: time,
          until: time,
          role: { enum: Object.keys(PHRASE_ROLES) },
          motif: { type: 'string' },
          n: { type: 'integer', minimum: 1, description: 'Which return of the motif this is (1 = first).' },
          gist: { type: 'string', description: 'Short paraphrase of what is sung (never verbatim lyrics).' },
          image: { enum: Object.keys(IMAGES), description: 'What the line is about, in light: the choreographer plays this image across every layer.' },
          energy: unit,
        },
        additionalProperties: false,
      },
    },
    cues: {
      type: 'array',
      items: {
        type: 'object',
        required: ['t', 'layer'],
        properties: {
          t: time,
          until: time,
          layer: { enum: LAYER_NAMES },
          group: { enum: GROUPS, description: 'Only these fixtures of the layer play the cue (default all). Lets one layer be two ensembles.' },
          move: intent(MOVE_LOOKS),
          dim: intent(DIM_LOOKS),
          color: intent(COLOR_LOOKS),
          fx: { enum: Object.keys(FX) },
          dur: { type: 'number', minimum: 0 },
          note: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
    accents: {
      type: 'array',
      items: {
        type: 'object',
        required: ['t', 'type'],
        properties: {
          t: time,
          type: { enum: Object.keys(ACCENT_TYPES) },
          strength: unit,
          dur: { type: 'number', minimum: 0 },
          fx: { enum: [...Object.keys(FX), 'none'] },
          note: { type: 'string' },
        },
      },
    },
    onsets: { type: 'object', properties: { low: onsetArr, mid: onsetArr, high: onsetArr } },
    envelopes: {
      type: 'object',
      required: ['rate'],
      properties: { rate: { type: 'number', exclusiveMinimum: 0 }, energy: envArr, low: envArr, mid: envArr, high: envArr },
    },
  },
};

// WAL v1 vocabulary — the contract between WAL files, decoders and the /wal skill.
// Everything here is rig-agnostic: a WAL never names a fixture, only a layer (role).

export const WAL_VERSION = '1.0';

// Abstract fixture roles. Each rig maps its fixtures onto these.
export const LAYERS = {
  beam:    'Narrow, parallel-shaft moving heads (e.g. Sharpy-type beams). Aerial looks in haze.',
  spot:    'Gobo/profile moving heads. Textured aerial or floor looks, focus on performers.',
  wash:    'Wide colour light: wash movers, LED pars, LED bars used as wash. Paints stage and crowd.',
  pixel:   'Individually addressable pixels: pixel bars, LED strips, star cloths, LED rings.',
  strobe:  'Strobes (xenon or LED). Flashes and bursts.',
  laser:   'Scanning lasers (ILDA/DMX). Fans, sheets, tunnels over the audience.',
  blinder: 'Audience blinders (2-lite/4-lite). Big warm hits facing the crowd.',
  tube:    'Vertical LED pixel tubes / kinetic columns. Rise-and-fall, waterfalls and meters that read as the height of the sound.',
  matrix:  'LED pixel panels and walls (a 2-D grid). Equalisers, plasma, rings, rain and diagonals: the colourful picture behind the band.',
};
// Sub-ensembles of a layer: a cue with a group is played only by those fixtures, so one layer can be two players.
export const GROUPS = ['all', 'left', 'right', 'odd', 'even', 'inner', 'outer', 'front', 'back', 'pairA', 'pairB'];
export const LAYER_NAMES = [...Object.keys(LAYERS), 'all'];

// If a rig has no fixtures for a layer, the decoder plays that layer on the next one that exists.
export const FALLBACK = {
  beam: ['spot', 'wash'],
  spot: ['beam', 'wash'],
  wash: ['pixel', 'spot', 'beam'],
  pixel: ['tube', 'matrix', 'wash'],
  tube: ['pixel', 'matrix', 'wash'],
  matrix: ['pixel', 'tube', 'wash'],
  strobe: ['blinder', 'pixel', 'wash'],
  blinder: ['strobe', 'wash'],
  laser: ['beam', 'spot'],
};

export const SECTION_KINDS = {
  intro: 'Opening; sets the mood, low to mid energy.',
  aalap: 'Free-time melodic opening (Indian classical/devotional). No pulse; slow, warm looks.',
  verse: 'Storytelling part; calm, rhythmic, leave headroom.',
  prechorus: 'Lift into the chorus.',
  chorus: 'Main hook; big but not the biggest.',
  build: 'Tension rising towards a drop (risers, snare rolls).',
  drop: 'The real peaks. Use sparingly (2-3 per song).',
  break: 'Breakdown after a peak; strip back.',
  bridge: 'Contrast section.',
  solo: 'Instrumental feature; spotlight the soloist.',
  interlude: 'Instrumental connective tissue between verses.',
  outro: 'Ending; resolve and fade.',
};

// Triggers: what makes a pulse/chase/alternate step.
export const TRIGGERS = {
  beat: 'Every beat.',
  half: 'Every 2 beats.',
  bar: 'Every downbeat.',
  phrase: 'Every 4 bars.',
  offbeat: 'Halfway between beats.',
  '8th': 'Every eighth note.',
  '16th': 'Every sixteenth note.',
  low: 'Low-band onsets (kick, dhol, bass hits).',
  mid: 'Mid-band onsets (snare body, vocals, chords).',
  high: 'High-band onsets (hats, claps, dandiya stick taps).',
};

export const MOVE_LOOKS = {
  still:     { desc: 'Hold a pose.', params: ['pose'] },
  fan:       { desc: 'Spread across the stage in a fan.', params: ['spread', 'pose'] },
  fan_open:  { desc: 'Fan opens from a single point to full spread over the cue (builds).', params: ['spread'] },
  fan_close: { desc: 'Fan closes to a single point over the cue (endings).', params: ['spread'] },
  sweep:     { desc: 'Whole group pans side to side together.', params: ['speed', 'spread', 'tilt'] },
  wave:      { desc: 'Tilt wave rolling across fixtures (phase offset per fixture).', params: ['speed', 'spread'] },
  circle:    { desc: 'Each head draws a circle; offset by fixture for a ripple.', params: ['speed', 'size'] },
  crossfire: { desc: 'Left and right halves criss-cross over centre, swapping.', params: ['speed', 'spread'] },
  ballyhoo:  { desc: 'Searchlight-style random sweeps. High energy only.', params: ['speed', 'spread'] },
  tunnel:    { desc: 'All beams converge to one point over the crowd, rotating (lasers: tunnel/cone).', params: ['speed'] },
  bounce:    { desc: 'Heads nod: elevation dips and recovers on every beat, like a dancer\'s head. Locks movement to the kick.', params: ['spread', 'size', 'pose'] },
  snap:      { desc: 'Heads jump to a new formation every `every` beats (fan, cross, audience, out) and hold, a programmed dance step.', params: ['every', 'spread'] },
  swing:     { desc: 'Pendulum pan locked to the bar; swing widens when the voice is loud (mid envelope).', params: ['speed', 'spread'] },
  pulse_fan: { desc: 'Fan breathes with the beat: opens on each beat and relaxes before the next.', params: ['spread', 'size'] },
  domino:    { desc: 'Tilt wave that travels fixture to fixture with a sharp delay; reads as a Mexican wave of light.', params: ['speed', 'spread'] },
  spin:      { desc: 'Full-circle rotation: every head sweeps through 360 degrees and beyond (a Sharpy has 540 degrees of pan), then reverses. `speed` = beats for a full 540 degree sweep, `spread` = phase offset between heads, `size` = how high the cone sits.', params: ['speed', 'spread', 'size'] },
  cone:      { desc: 'Beams trace crossing cones: neighbouring heads rotate in opposite directions at a fixed elevation, so the shafts weave through each other.', params: ['speed', 'size'] },
  vocal:     { desc: 'Elevation follows the vocal contour (mid envelope): beams rise as the singer climbs and fall as the line resolves.', params: ['spread', 'size'] },
  // figures: the whole unit moves as ONE shape in 3-D (not each head on its own)
  orbit:     { desc: 'Every beam aims at one point that circles through the air above the crowd: the shafts converge into a web that travels. `spread` loosens the convergence, `size` = radius of the circle.', params: ['speed', 'size', 'spread'] },
  lissajous: { desc: 'Every beam chases a point drawing a figure-eight in the sky; the web stretches and crosses as it goes. `phase` delays each head a little for a ribbon.', params: ['speed', 'size', 'spread', 'phase'] },
  helix:     { desc: 'Two interleaved groups (odd / even heads) rotate in opposite directions while rising and falling: a double helix of light.', params: ['speed', 'size', 'spread'] },
  lotus:     { desc: 'The heads fan evenly around the compass and the cone opens and closes like a flower; petals slowly rotate. Best for hooks and devotion.', params: ['speed', 'size', 'spread'] },
  carousel:  { desc: 'All heads rotate together like lighthouses sweeping low over the crowd (a full 360 on a ring rig, a wide pendulum on a stage rig). Rays pass over the dancers.', params: ['speed', 'size', 'phase'] },
  curtain:   { desc: 'Every beam parallel: one wall of shafts sweeps across and tilts like a curtain being drawn. `phase` twists it.', params: ['speed', 'spread', 'size', 'phase'] },
  scissor:   { desc: 'The two halves of the rig open like a fan and then cross like scissors, locked to the beat.', params: ['speed', 'spread', 'size'] },
  ripple:    { desc: 'A wave of elevation radiates from the middle of the rig outwards (or inwards) like a stone dropped in water.', params: ['speed', 'spread', 'size', 'tilt'] },
  stairs:    { desc: 'Elevation ladder: heads sit on rising steps and the whole staircase shifts by one step every beat, like a marquee in the sky.', params: ['every', 'spread', 'size'] },
  scanline:  { desc: 'A sheet of beams scans from the front rows to the back rows and returns.', params: ['speed', 'spread', 'size', 'phase'] },
  spiral:    { desc: 'The beams chase a point spiralling inwards and upwards across the cue. Use on builds. `speed` = turns.', params: ['speed', 'size', 'spread'] },
  peacock:   { desc: 'A tail of feathers: the rig fans into a high half-dome that fans wider on each beat and shimmers. Cultural, festive.', params: ['spread', 'size', 'speed'] },
  dance:     { desc: 'A programmed routine: every `every` beats the heads jump to the next formation of a seeded sequence (fan, cross, V, cathedral, wall, pairs, zipper, diagonal, scatter, low sweep...). `seed` changes the routine, so no two songs dance alike.', params: ['every', 'spread', 'seed'] },
  drift:     { desc: 'Slow organic wander of the whole unit around a fan, like a breathing crowd. Calm verses.', params: ['speed', 'spread', 'size', 'seed'] },
  ribbon:    { desc: 'One flowing S-shaped wave runs along the line of heads, each head echoing the one before it a moment later.', params: ['speed', 'spread', 'size', 'phase'] },
};
export const STROBE_PATTERNS = {
  single:    'One flash on each beat.',
  double:    'Two quick flashes per beat (da-dum).',
  triple:    'Three quick flashes per beat.',
  gallop:    'Long-short-short per beat, a driving gallop.',
  heartbeat: 'Two thumps then a rest across two beats.',
  burst:     'A dense train of flashes for a whole beat (at most 12 Hz).',
  stutter:   'Flashes that accelerate across the cue, ending in a solid burst.',
  split:     'Left and right halves alternate flashes each beat.',
  chase:     'A single flash runs fixture by fixture across the rig each beat.',
  random:    'Each fixture flashes at random; reads as sparkling static.',
};
// Params on any move: `prism` true splits each beam of a prism-equipped head into a ring of 8 rays that turns with the music.
export const POSES = ['up', 'out', 'center', 'cross', 'audience', 'down', 'performer'];

export const DIM_LOOKS = {
  on:           { desc: 'Steady at intensity.', params: ['intensity'] },
  off:          { desc: 'Dark.', params: [] },
  follow:       { desc: 'Intensity follows an audio envelope.', params: ['env', 'intensity'] },
  pulse:        { desc: 'Flash on each trigger, decaying.', params: ['on', 'decay', 'intensity', 'every'] },
  chase:        { desc: 'Step through fixtures in order on each trigger.', params: ['on', 'width', 'direction', 'every'] },
  alternate:    { desc: 'Odd/even or left/right toggle on each trigger.', params: ['on', 'split', 'every'] },
  breathe:      { desc: 'Slow sine swell.', params: ['speed', 'intensity'] },
  sparkle:      { desc: 'Random twinkles (star-cloth feel).', params: ['density', 'intensity'] },
  strobe:       { desc: 'Strobe at a rate; rate may ramp up across the cue.', params: ['rate', 'ramp', 'intensity'] },
  swell:        { desc: 'Ramp 0 -> intensity across the cue (builds).', params: ['intensity'] },
  fade:         { desc: 'Ramp intensity -> 0 across the cue (endings).', params: ['intensity'] },
  dandiya_tap:  { desc: 'Left/right answer each other on dandiya stick taps (high onsets), crisp short flashes.', params: ['decay', 'intensity'] },
  strobe_seq:   { desc: 'Rhythmic strobe pattern locked to the beat (double hits, galloping, bursts, stutters, chases). Prefer this to plain strobe.', params: ['pattern', 'intensity', 'every', 'rate'] },
  garba_circle: { desc: 'Chase travelling around the venue in a ring, one lap per `speed` beats, like dancers circling.', params: ['speed', 'width', 'direction'] },
  comet:        { desc: 'A bright head with a fading tail runs along the fixtures (or around the ring) once per `speed` beats. `width` = tail length, `direction` forward|reverse|bounce.', params: ['speed', 'width', 'direction', 'intensity'] },
  meter:        { desc: 'Level meter: fixtures fill from the bottom / the middle in step with an audio envelope (`env`). Tubes and walls read as the height of the sound.', params: ['env', 'intensity', 'direction'] },
  ripple:       { desc: 'A ring of light radiates from the centre of the layer outwards (direction in: inwards), once per `speed` beats.', params: ['speed', 'width', 'direction', 'intensity'] },
  checker:      { desc: 'Checkerboard that flips every `every` beats (grid layers) or odd/even blocks (others).', params: ['every', 'intensity'] },
  eq:           { desc: 'Spectrum equaliser: columns jump to the low, mid and high band levels. Walls and tubes.', params: ['intensity', 'density'] },
  rain:         { desc: 'Streaks of light fall (or rise with direction reverse) down the columns.', params: ['speed', 'density', 'direction', 'intensity'] },
  plasma:       { desc: 'Slow rolling plasma: soft overlapping waves of brightness across the grid.', params: ['speed', 'density', 'intensity'] },
  diagonal:     { desc: 'Diagonal stripes sliding across a grid or along a line.', params: ['speed', 'width', 'direction', 'intensity'] },
  thump:        { desc: 'Whole layer pulses on each trigger with a delay that travels outward from the middle, so the kick seems to travel.', params: ['on', 'decay', 'speed', 'intensity'] },
};

export const COLOR_LOOKS = {
  static:   { desc: 'One colour (palette index or hex).', params: ['palette', 'index', 'hex'] },
  cycle:    { desc: 'Step through the palette on a trigger.', params: ['palette', 'on', 'every'] },
  split:    { desc: 'Two palette colours split left/right or odd/even.', params: ['palette', 'split'] },
  gradient: { desc: 'Spread the palette across fixtures.', params: ['palette'] },
  rainbow:  { desc: 'Rotating hue across fixtures. Use rarely.', params: ['speed'] },
  sweep:    { desc: 'The palette is spread across the fixtures and slides along them, `speed` beats for one pass.', params: ['palette', 'speed'] },
  pairs:    { desc: 'Neighbouring fixtures take opposite palette colours and swap every `every` bars, a bold two-tone.', params: ['palette', 'on', 'every'] },
  fire:     { desc: 'Flickering flame colours (red to amber) with a different flicker per fixture.', params: ['speed'] },
  tide:     { desc: 'Colour rolls in waves from the middle of the layer, each ring a different palette colour.', params: ['palette', 'speed'] },
};

// One-shot effects (cue.fx or decoder reaction to accents).
export const FX = {
  flash: 'Full white hit, fast decay.',
  blackout: 'Everything dark for the duration.',
  burst: 'Strobe burst for the duration.',
  snap: 'Movers snap to a new position on the hit.',
  co2: 'Cryo/CO2 jets blast a white column upward from the stage edge. Only on big landings.',
  confetti: 'Confetti cannons fire over the crowd. Once or twice a show at most.',
  flame: 'Flame projectors from the stage deck. Rare; the very biggest moment only.',
  spark: 'Cold-spark fountains: a curtain of white-gold sparks rising from the stage edge. Safe indoors. Hooks and landings.',
  streamers: 'Streamer cannons: coloured ribbons shot over the front of the crowd. A celebration, once or twice.',
};

// Phrase roles: the lyric architecture the lights follow. A song is a few phrases (lines) that
// lead into a central phrase (refrain) that returns after every stanza, closed by a tagline.
export const PHRASE_ROLES = {
  refrain:  'The central phrase that returns after every stanza (mukhda, dhruvapad, hook). Same lighting signature each time, bigger each return.',
  tagline:  'The closing slogan/tag line (the last shout of the hook). The biggest hit in the song.',
  line:     'A stanza line (kadva, antara line). Each line has its own turn of colour and movement; they build towards the refrain.',
  answer:   'A call-and-response or echo line. Mirrors the line before it.',
  lift:     'The last line of a stanza that pulls up into the refrain.',
  instrumental: 'Instrumental / dhol / music-only phrase.',
  silence:  'Held pause or breath. Dark or a single held colour.',
};

// Images: what a phrase is about, in light. The director picks one per phrase from the lyric's meaning; the
// choreographer plays it across every layer (core/choreo/imagery.js).
export const IMAGES = {
  embrace: 'Arms closing round someone, holding, closeness: heads draw together, soft warm colour, rings of light contracting.',
  gaze:    'Looking, a glance, the eyes, beauty seen: sharp points that glint with the hi-hats, prisms opening, gold sparkle.',
  fire:    'Flame, heat, burning, passion, danger: flickering red-amber colour everywhere, heads licking upward.',
  water:   'Water, rain, river, tears, calm: cool blue colour rolling out in rings, heads flowing in a wave, rain down the tubes.',
  duel:    'Two opposites facing each other (fire and water, you and me, light and dark): left and right halves in opposite colours trading blows on the beat.',
  meet:    'Opposites meeting, union, resolution: both halves close to one point and the two colours fuse.',
  urgency: 'Time running out, dare, haste, do not waste a moment: faster, narrower, a racing marquee.',
  pride:   'Pride, poise, dignity, worship, grandeur: upright columns of gold, almost still, a slow breath.',
  longing: 'Longing, a plea, memory, night, moon: slow drifting heads in moonlight and blush, nothing sudden.',
  flirt:   'Teasing, flirting, play, call and answer: a wave passes from head to head, neighbours in two colours that swap.',
  hush:    'A held breath, a whisper, anticipation: low, narrow, almost nothing.',
  hollow:  'Empty words, false promises, loneliness: only the outer ring faintly glittering, the middle dark.',
  bloom:   'Joy, victory, release, celebration: everything blooms outwards and keeps turning.',
  rhythm:  'The drum takes over, pure dance: heads dance a programmed routine, walls play the spectrum.',
};

export const ACCENT_TYPES = {
  drop: 'Section slams in. Decoder: blinder/strobe burst + all layers at full.',
  hit: 'An isolated stab that stands out. Decoder: flash + movers snap.',
  silence: 'A real gap. The room holds a low breathing colour, then slams back; "dark": true on the phrase makes it a true blackout (rare).',
  riser: 'Tension ramp over `dur`. Decoder: strobe/pixel ramp in the last quarter.',
  cue: 'Free-form creative marker (lyric line, instrument entry); skill may attach fx.',
};

export const PALETTES = {
  festival: ['#ff7a00', '#ff1f5a', '#ffd23f', '#00c2a8'],
  marigold: ['#ffa000', '#ff5e00', '#ffd54a', '#ff2d55'],
  fire:     ['#ff2a00', '#ff8c00', '#ffd000'],
  ocean:    ['#00b4ff', '#0050ff', '#00ffd5'],
  royal:    ['#7b2fff', '#ff2fd2', '#2f7bff'],
  neon:     ['#ff00e6', '#00ffea', '#c8ff00'],
  sacred:   ['#ffb347', '#ff7b00', '#fff2c4'],
  romance:  ['#ff4f9a', '#b03cff', '#ffd1e8'],
  ice:      ['#e8f6ff', '#7fd4ff', '#ffffff'],
  white:    ['#ffffff', '#fff1d6'],
  water:    ['#00e5ff', '#1e6bff', '#6a5cff'],
  gold:     ['#ffd54a', '#ffb300', '#fff1c4'],
  blush:    ['#ff4f9a', '#ff8fb8', '#ffd1e8'],
  moon:     ['#b8c4ff', '#6f7fe8', '#e8ecff'],
  duel:     ['#ff3b00', '#00b8ff'],
  steam:    ['#ff4fa0', '#ffffff', '#7fd4ff'],
};

export const STYLES = {
  edm: 'Club/EDM: builds and drops, strobes and lasers on drops.',
  bollywood: 'Film/pop: hooks and choruses, colourful, dramatic hits on the mukhda.',
  dandiya: 'Navratri dandiya/garba: warm festival palettes, dandiya_tap on stick taps, garba_circle laps.',
  concert: 'Rock/pop concert: big beams and blinders on choruses, spot on soloists.',
  devotional: 'Bhajan/aarti/qawwali: slow warm swells, minimal movement, no strobes.',
  wedding: 'Sangeet/baraat: festive, punchy, celebratory.',
  romantic: 'Ballads: soft pinks and purples, breathe and slow sweeps.',
  rock: 'Rock/metal/indie: guitars and live drums, hard crossing beams, blinders, raw white and primary colours.',
  hiphop: 'Hip-hop/trap/rap: swagger, heavy 808s, stutters and hard cuts, low dark looks with sharp colour hits.',
  sufi: 'Sufi/qawwali/ghazal: devotion building by repetition, spinning (whirling) light, gold and deep red, trance.',
  classical: 'Indian classical / instrumental / jazz: slow raga unfolding, free time, light that breathes with the soloist.',
  folk: 'Folk/bhangra/lavni/regional dance: dhol-led, earthy, rhythmic, bright festival colours.',
  pop: 'Pop/dance-pop: glossy, bright, catchy hooks, clean colour changes on the beat.',
};

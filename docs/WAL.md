# WAL — Wave Augmented Language, v1.0

WAL is a file format for a song's light show that works on any rig. A WAL file
describes **the music and the lighting intent**: when the beats, sections, drops and
silences happen, and what each kind of light should do. It never names a fixture,
a DMX channel or a position. A **decoder** reads the WAL together with a description
of the rig and works out what each fixture does on each frame.

```
audio ──analyze──▶ analysis ──draft / skill──▶ song.wal.json ──decoder + rig──▶ fixture states ──▶ simulator | Art-Net | sACN
```

The machine-readable schema is [wal.schema.json](wal.schema.json) (generated from
[core/wal/vocab.js](../core/wal/vocab.js) with `node bin/wal.mjs schema`). The reference decoder
is [core/decoder/decoder.js](../core/decoder/decoder.js).

## File layout

| key | required | what it holds |
|---|---|---|
| `wal` | yes | `"1.0"` |
| `meta` | yes | `title`, `duration` (s); optional `artist`, `bpm`, `meter`, `key`, `styles[]`, `mood`, `language`, `audio {file, sha256, duration}`, `generator`, `notes` |
| `timing` | yes | `beats[]` (s, ascending), `downbeats[]` (s) |
| `sections` | yes | contiguous list covering the song: `id`, `start`, `end`, `kind`, `energy` 0–1; optional `group`, `label`, `mood`, `palette`, `lyric` |
| `palettes` | no | `{ name: ["#rrggbb", ...] }`, which adds to or overrides the built-in palettes |
| `cues` | no | the lighting intent (below) |
| `accents` | no | one-shot moments: `drop`, `hit`, `silence`, `riser`, `cue` |
| `onsets` | no | `{ low, mid, high }`: `[[t, strength], ...]` per band, for triggers like `high` (dandiya stick taps) |
| `envelopes` | no | `{ rate, energy, low, mid, high }`: integers 0–100 sampled at `rate` Hz |

All times are in seconds from the start of the audio file. `meta.audio.sha256`
identifies the exact recording the WAL is synced to.

## Layers (roles)

A rig maps each of its fixtures to one layer:

| layer | typical fixtures |
|---|---|
| `beam` | Sharpy-type narrow beam moving heads |
| `spot` | gobo/profile moving heads |
| `wash` | wash movers, LED pars, battens used as wash |
| `pixel` | pixel bars, LED strips, star cloths |
| `tube` | vertical LED pixel tubes, kinetic columns |
| `matrix` | LED pixel panels and walls (a 2-D grid) |
| `strobe` | xenon/LED strobes |
| `laser` | ILDA/DMX scanning lasers |
| `blinder` | audience blinders |

`all` targets every layer the rig has.

**Fallback.** If the rig has no fixture for a cue's layer, the decoder plays the cue on
the first layer it does have, in this order:
`beam→spot→wash`, `spot→beam→wash`, `wash→pixel→spot→beam`, `pixel→tube→matrix→wash`, `tube→pixel→matrix→wash`, `matrix→pixel→tube→wash`,
`strobe→blinder→pixel→wash`, `blinder→strobe→wash`, `laser→beam→spot`.
A cue written for the layer itself beats a fallback cue that starts at the same time.

## Cues

```json
{ "t": 62.415, "until": 93.391, "layer": "beam",
  "move":  { "look": "crossfire", "speed": 4, "spread": 0.85 },
  "dim":   { "look": "pulse", "on": "beat", "decay": 0.4, "intensity": 1 },
  "color": { "look": "cycle", "on": "bar", "palette": "neon" } }
```

* A cue is active while `t ≤ now < until`. If `until` is omitted, the cue lasts to the
  end of the section that contains `t`.
* Active cues on a layer are applied in start order, and each part (`move`, `dim`, `color`)
  is replaced only by a later cue that defines that part. A short strobe cue inside a
  build therefore changes `dim` and `color` but keeps the build's movement.
* `fx` cues are one-shots: `flash`, `blackout`, `burst`, `snap`, and the stage effects `co2`, `spark` (cold-spark fountains), `confetti`, `streamers`, `flame`, lasting `dur` seconds.
* `speed` is in **beats per cycle**, so all motion locks to the tempo.

### Move looks (`beam`, `spot`, `wash` movers, `laser`)
`still` (with `pose`: up, out, center, cross, audience, down, performer) · `fan` ·
`fan_open` · `fan_close` · `sweep` · `wave` · `circle` · `crossfire` · `ballyhoo` · `tunnel` ·
`bounce` · `snap` · `swing` · `pulse_fan` · `domino` · `spin` · `cone` · `vocal`

**Figures.** The whole unit moves as one shape in 3-D rather than each head on its own:
`orbit` (every beam aims at a point circling the crowd) · `lissajous` (a point drawing a figure of eight) ·
`helix` (odd and even heads counter-rotate) · `lotus` (the cone of beams opens and closes) ·
`carousel` (heads sweep the compass like lighthouses; rays pass over the dancers) · `curtain` (a parallel wall of beams drawn across) ·
`scissor` · `ripple` (elevation wave from the middle) · `stairs` (a marquee of steps) · `scanline` (front rows to back) ·
`spiral` (converging, rising: builds) · `peacock` (a feathered fan that widens on the beat) ·
`dance` (a seeded routine of formations, changing every `every` beats) · `drift` (slow organic wander) · `ribbon` (an S-wave with each head echoing the last).
Figures place themselves relative to the rig's `focus`, so on a ring rig (garba ground, club truss ring) they aim inwards from wherever each fixture stands.
Extra move params: `phase` (0–1, fixture-to-fixture delay), `seed` (a variation of `dance` / `drift`), `prism: true`
(heads that own a prism throw a ring of 8 rays), and `tilt` below 0 runs a cyclic figure backwards.

A cue may carry `"group"`: `left`, `right`, `odd`, `even`, `inner`, `outer`, `front` or `back`. Only those fixtures of the layer play it, and it overlays
the cues for the whole layer whatever their start times, so one layer can be two ensembles (the inner heads bloom while the outer heads orbit).

**Glide.** A look does not cut in: when a cue changes a part, the decoder blends aim, colour and brightness from what the old look was doing into the new one over a few beats (the tempo's, so a ballad eases slowly and a drop lands fast). `glide` (0-16 beats) on a look sets that; `0` is a cut. Beat-driven moves (`peacock`, `pulse_fan`, `dance`, `stairs`) also ease into each accent and each change of formation instead of jumping.

### Dim looks (any layer)
`on` · `off` · `follow` (envelope) · `pulse` (on a trigger, decaying) · `chase` ·
`alternate` · `breathe` · `sparkle` · `strobe` (`rate`, optional `ramp`) · `swell` · `fade` ·
`dandiya_tap` (left/right answer each other on high-band onsets) ·
`garba_circle` (a chase that laps the venue in a ring, one lap per `speed` beats) ·
`comet` (a head with a fading tail) · `meter` (fills like a level meter) · `ripple` (a ring from the centre) · `checker` · `eq` (spectrum columns) ·
`rain` · `plasma` · `diagonal` · `thump` (the kick seems to travel outwards). The grid looks (`eq`, `plasma`, `rain`, `checker`, `diagonal`, `ripple`, `meter`) use each pixel's
position, so on a matrix wall they draw a picture and on a row of tubes they climb the tubes.

### Color looks
`static` (`index` into the palette, or `hex`) · `cycle` (on a trigger) · `split` (`lr` / `oddeven`) · `gradient` · `rainbow` ·
`sweep` (the palette slides along the fixtures) · `pairs` (neighbours take opposite colours) · `fire` (flicker) · `tide` (colour rolls out from the middle)

### Triggers (`on`)
`beat`, `half` (every 2 beats), `bar`, `phrase` (4 bars), `offbeat`, `8th`, `16th`,
and the onset bands `low`, `mid`, `high`. `every: N` acts on every Nth trigger.

## Phrases and images

`phrases` is the lyric architecture (`t`, `until`, `role`, `motif`, `n`, `gist`, `energy`). A phrase may carry an `image`, what the line is about, chosen from its meaning: `embrace`, `gaze`, `fire`, `water`, `duel`, `meet`, `urgency`, `pride`, `longing`, `flirt`, `hush`, `hollow`, `bloom`, `rhythm` (list and meanings in [vocab.js](../core/wal/vocab.js), implemented in [imagery.js](../core/choreo/imagery.js)). The choreographer plays an image across every layer for the span of the phrase (colour says the feeling, the beams' movement the gesture, the pixels and walls the texture) in place of its generic figure; quiet images (`hush`, `hollow`, `longing`, `embrace`, `pride`) also hold back strobes, lasers and blinders. Because images live on phrases, they survive a remaster. `scripts/score.mjs` attaches a hand-written score (`scripts/scores/*.json`) to a song.

## Accents

| type | default decoder behaviour (override with `fx`, or `"fx": "none"`) |
|---|---|
| `drop` | strobe and blinder burst; blinders and washes flash |
| `hit` | quick flash on wash, pixel and blinder |
| `silence` | full blackout for `dur`, then the next cue comes back in |
| `riser` | none by default (builds are written as cues) |
| `cue` | free-form marker (a lyric line, an instrument entry) |

## Sections

`kind` is one of: intro, aalap, verse, prechorus, chorus, build, drop, break, bridge,
solo, interlude, outro.

`energy` is relative to the song's loudest section (1.0). Sections that sound alike
share a `group` letter, so repeats can reuse the same looks.
Keep `drop` for the 2–3 real peaks.

## Rig description (decoder input)

```json
{ "name": "Concert stage", "venue": "stage",
  "fixtures": [ { "id": "B1", "model": "claypaky-sharpy", "pos": [-6, 8, -4], "mount": "hung" },
                { "id": "P1", "model": "led-par-54x3", "pos": [-7, 8, -0.6], "mount": "hung", "aim": [-5, 1.2, -3.5] } ] }
```

A rig may also set `"surround": true` and `"focus": [x, y, z]`: the middle of the action. A stage rig faces the audience (+z) and needs neither; a ring rig (a garba ground, a club with a truss ring) sets them so that
every movement look turns to face the focus from wherever its fixture stands. Without them the decoder guesses (a rig spread 14 m both ways counts as a ring).

Stage coordinates are in metres, with the origin at the front-centre of the stage at
audience-floor level. `x+` is the audience's right, `y+` is up, and `z+` points towards
the audience. `role` overrides the model's default layer. `aim` sets the target point of a
fixture that has no pan/tilt.

The decoder orders the fixtures of each layer by x, which drives chases, fans and
left/right splits. It also orders them by angle around the rig's centre, which drives
`garba_circle`. Moving heads get pan/tilt for their mount, within the limits of their
profile. Colour-wheel fixtures snap to their nearest wheel slot.

## Decoder output (per fixture, per frame)

`{ role, dim 0–1, rgb [0–1]×3, aim {x,y,z}, pan°, tilt°, pixels?: [[r,g,b]…], laser?: {pattern, spread, beams, phase}, strobeHz? }`

Physical behaviour belongs to the output stage, not the decoder: motor slew, the slow
response of tungsten lamps, and DMX channel mapping. The simulator models the first two.
A DMX output maps these values onto each fixture's channel layout.

## Versioning

A minor version may add looks, triggers and fields. A decoder must ignore fields it
doesn't know, and must treat an unknown look as `still` / `on` / `static`.
A major version changes meaning.

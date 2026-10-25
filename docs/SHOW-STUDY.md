# Why the shows feel poor: a measured study (2026-10-24)

Method: `node scripts/study.mjs [rig]` decodes every stored show (15 songs, 10 to 22 sections each) on a rig at 20 fps and
measures what a viewer feels. Evidence for the recording (Illuminati on the dandiya ground, orbit camera) comes from the
video itself (`min`/`max` over time of 4 s windows) and from the same song decoded headlessly. Numbers below are the mean
over the 15 songs on the old 48-fixture dandiya rig unless stated.

## A. The rig (what the recording shows)

| finding | evidence |
|---|---|
| Two camps of heads that never meet. The 10 pole and stage Sharpies were **floor-mounted**, so they aimed at the sky 63 to 87 % of the time and never at the dancers. The 8 tower heads (hung) aimed down 50 to 60 % and almost never up. | per-fixture aim stats; in the video the white "tent" converging above the centre stays put for 4 s while yellow sheets sweep the crowd |
| Pole and stage heads are clones: PB1 to PB6 have identical speed and phase, so six heads read as one fat beam | median deg/s 14 to 18 for every one |
| Too many: 18 moving heads + 16 pars + tubes + matrix + strobes + lasers = 48 fixtures, 14 of 18 heads lit at once | beamLit 14.4 |

**Done:** dandiya rig is now 28 fixtures: 10 heads (4 tower, 4 pole, 2 stage), all pole/tower heads **hung** so they reach the dancers,
8 pole pars, 4 tubes, 2 matrix, 2 sunstrips, 2 stage pars. No Mythos, blinders or lasers. Lit heads per frame 14.4 → 8.2. Tests pass.

## B. Movement

1. **Quiet figures are too slow to read as motion.** drift@24, drift@16, curtain@32, orbit@32, ribbon@24, scanline@16 and `stairs` average 3 to 16 deg/s (a Sharpy can do 250). They account for ~170 s of the figure time in the library. To a viewer they are stationary.
2. **Everything else moves at the same speed.** Mean 56 deg/s for every song and every section. A designer uses holds so that a move lands as an event; here there are no holds, so nothing is an event.
3. **Symmetry makes the rig one object.** Ring rigs rotate one look to every fixture, so the 4 towers are four copies. The user's earlier ask (move as a unit) was met so literally that there is no foreground and background.

## C. Brightness and contrast: the rig is never "off"

| metric | value | what a good show has |
|---|---|---|
| fraction of the time a head is lit | ~80 % | 30 to 50 %, with long darks |
| light level p90 / p10 | 2.0 to 2.2× | 5× or more |
| time near full level | 27 to 31 % | under 10 % (so full means something) |
| level 2 s after a drop vs 2 s before | 1.28× (0.73 to 1.93) | 3× or more, usually after a dark beat |
| fixture types lit at once | 5.4 of 8 | 2 to 3 leading, the rest resting |
| cue changes that switch ≥5 layers together | 58 % | layers change at different rates |

Cause: choreograph.js re-chooses **every layer** on every phrase (one phrase ≈ 2.5 s of beam look), so the show is a slideshow of full
looks. Nothing holds while something else develops, and there is no negative space for a build or a drop to push against.
Caveat: blackout and silence effects are `fx` cues applied outside the decoder frame, so this study cannot see them (13 of the 15 songs have 0 to 3 silences).

## D. Sync with the music

| metric | value |
|---|---|
| beat punch (light swing between a beat and the next trough) | 0.20 |
| strong kick/low onsets followed by a visible rise (>15 %) within 150 ms | 35 to 37 % |
| correlation of light with the song's loudness curve | 0.29 (Chogada 0.01, Kabali 0.10, Dai Dai 0.11, Armadham 0.62) |
| correlation of light with the director's section energy | 0.55 to 0.6 (Chogada **-0.53**) |

Cause: level is set per phrase from `section.energy`, which is the director's guess, not the measured loudness; fine timing only comes
from `pulse` looks on whichever layers happen to carry one. Two of three kicks do nothing visible.

## E. Meaning (words, lines, story)

1. **No song has any imagery except the hand-scored pilot.** `phrase.image` was added to the director prompt at 17:48 on 24 Oct, after every stored show was made (last at 15:40), so 14 of 15 shows have 0 images. Only Aaj Ki Raat (hand-scored) has 13.
2. **Only 2 of 15 songs have lyrics** (two of them). For the rest the director wrote phrases "from the bar table alone" (Illuminati's own notes say so). The gists are generic ("Rap opens, introducing the character"), so nothing can answer the words.
3. **Choreography has no input for meaning.** Figures are chosen from genre + loudness + rhythmic/melodic/airy + recency. Meaning enters only through `image`, so with no images a ballad and an anthem of the same loudness get the same grammar.
4. **Palettes are per section, not per idea.** 3 to 5 palettes per song; one hue takes 41 % of lit time on average (Illuminati's first 35 s are almost all gold although its brief calls for violet, red and cyan accents).

## F. Test coverage and a bug found on the way

- Nearly all 15 songs are loud, rhythm-led tracks, so the calm branch, ballads and devotional songs are untested.
- Illuminati is a trap track played on a dandiya ground; flat "hit" looks (scissor, crossfire, ballyhoo) become horizontal sheets of beams across the dancers.
- **Bug fixed:** the LED wall plasma (sim/scene/screens.js) indexed the palette with a negative number at some moments and threw inside the frame loop, which stops the frame for the whole scene. It aborted captures and could produce a stalled frame in the live app and exports.

## What to do next (in order of effect)

1. Re-run the director for the library (imagery + research prompt + lyrics lookup). Costs Claude CLI time, so it needs a go-ahead.
2. Make fewer, longer, layered decisions: beams hold a figure for a whole stanza, colour changes per line, pixels per beat; do not re-pick every layer on each phrase.
3. Add real darks: beams off between phrases, a held dark beat before every drop, a ceiling of ~40 % of heads lit outside refrains.
4. Drive level from the measured envelope and the kick onsets (not section energy), then check `onsetHit` ≥ 70 % and drop contrast ≥ 3× with `scripts/study.mjs`.
5. Replace the slowest figures with something that has a visible stop-and-go (hold, then arrive on the downbeat).
6. Break the symmetry: two ensembles with different jobs (e.g. towers = slow ambient, poles = rhythmic) rather than every head the same.
7. Add 3 to 4 calm songs to the library so the other half of the design gets tested.

## Applied on 2026-10-24 (after the study)

- Choreography v4: beam figures hold for up to 3 lines of a stanza (colour and other layers still move per line); half the heads rest through quieter lines; every long line ends on a beat of dark; a dark beat before each refrain block; the slowest figures (drift, curtain, orbit, ribbon, lotus, scanline, helix, lissajous) run about twice as fast; `kick` beam dim favoured. All 21 stored shows remastered (old ones kept as `.v1.json`).
- Measured on the 28-fixture rig: heads dark 16 % of the time (study `beamDark`), strong kicks answered by the beams 36 % → 47 %. Whole-rig contrast is still ~2× because washes, pixels and tubes never go dark: next target.
- Director re-run (`scripts/rerun-director.mjs`): the dev server had been started before the imagery prompt was written, so it was still using the old prompt. Restarted; the first song now carries 12 distinct images. Songs without lyrics may still get none.
- `scripts/study.mjs` now also reports beam-only onset response, range and dark time.

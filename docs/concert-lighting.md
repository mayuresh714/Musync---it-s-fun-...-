# Concert lighting: what a real show uses, and how Musync models it

Research notes behind the simulator's fixtures, strobe patterns and stage effects. Sources are listed at the end;
where a source was thin I say so and mark the number as an estimate in the fixture library (`est`).

## Fixture families

| Family | What it is | WAL layer | In the simulator |
|---|---|---|---|
| **Beam** (Sharpy class) | Very tight moving head, about 2 to 5 degrees; a dense column that only shows in haze. | `beam` | `claypaky-sharpy`, `generic-7r-beam`; thickness is adjustable in the Look panel. |
| **Spot** | Narrower, sharper moving head that projects gobos; used to put patterns on the stage and backdrop. | `spot` | `robe-megapointe` |
| **Wash** | Soft, wide colour; fills the stage and gives atmosphere between the hard looks. | `wash` | `robe-ledbeam-150`, LED pars |
| **Hybrid** | Newest class: one head that can act as strobe, wash and blinder. | any | not modelled as one fixture; the layers cover its roles |
| **Pixel tube** | A vertical LED column, 2 m, 24 pixels; hung in rows as a kinetic curtain or stood on posts. | `tube` | `led-tube-2m` |
| **LED matrix** | A low-resolution pixel wall (250 mm pitch) driven as a grid for patterns. | `matrix` | `led-matrix-wall`, `led-matrix-panel` |
| **Pixel bar / batten** | A row of individually controllable LEDs; chases, waves and per-segment strobing. | `pixel` | `pixel-bar-16`, `star-cloth` |
| **Strobe bar (hybrid)** | High-output white segments, each addressable, 1 to 30 flashes a second, often with RGB pixels beside them. Pixel battens in touring use have been run at up to 28 flashes a second. | `strobe` | `hybrid-strobe-bar` (8 segments), `martin-atomic-3000` (xenon) |
| **Blinder** | Direct, intense light into the audience; warm tungsten-style or LED. | `blinder` | `blinder-4lite`, `sunstrip-10` |
| **Laser** | Scanning beams kept above head height unless certified eye-safe for audience scanning. | `laser` | `laser-rgb-3w` |

## Strobes are an instrument

A strobe is not an on/off switch. What changes the feel of the stage and the audience is the **number and rhythm of
flashes**, and **which fixtures flash together**. Real programmers build this on the console with chases, shutter
control and per-segment effects; sweeping and random strobes are built step by step, or with a fixture's own random
mode. Very short flashes are limited by the fixture and by DMX itself.

WAL models this with the dim look `strobe_seq` and a `pattern`:

| Pattern | Effect |
|---|---|
| `single` | one flash per beat |
| `double` | two quick flashes per beat (da-dum), good for driving a refrain |
| `triple` | three quick flashes per beat |
| `gallop` | long-short-short, a driving gallop |
| `heartbeat` | two thumps then a rest over two beats |
| `burst` | a dense train for a whole beat (capped at 12 Hz) |
| `stutter` | flashes accelerate across the cue and end as a solid burst; the climb into a drop |
| `split` | left and right halves alternate each beat |
| `chase` | one flash runs fixture by fixture across the rig each beat |
| `random` | each fixture flashes at random, like sparkling static |

All patterns are locked to the beat grid, so they stay in time with the song at any tempo. The 12 Hz ceiling is
deliberate: flashing faster than about 3 per second is a photosensitivity risk and the validator warns above 20 Hz.

## Stage effects

These are hardware on a real stage, so WAL only *names* them (`fx: co2 | confetti | flame` on any layer) and the
decoder reports which are alive (`decoder.effects(t)`); a real rig would map them to relays or a DMX effects
controller, the simulator draws particles.

* **CO2 / cryo jets**: a white column up from the stage edge; operators fire them when the stage front is clear.
* **Confetti cannons**: aimed up and away from the audience; flame-retardant tissue is preferred to foil.
* **Flame projectors**: need distance from the audience and clear space overhead (20 to 30 ft flames).

The choreography engine uses them sparingly: CO2 when a refrain returns at high energy and on the tagline, confetti
once on the final tagline, flame only on the very biggest landing. They can be switched off in the Look panel.

## Movement: why most shows looked flat, and what changed

Looks are written in "sky" terms (0 to 80 degrees up). A head hung upside down on a truss cannot tilt more than about
35 degrees above horizontal (Sharpy: 250 degrees of tilt, 125 either side of straight down), so before this change every
hung beam clamped at its tilt stop and the rig moved as one block. The decoder now squeezes the requested elevation into
each head's reachable range, so hung heads sweep through the whole crowd and floor heads keep the full sky.

New movement looks that lock motion to the music instead of looping on a timer: `bounce` (nod on every beat),
`snap` (jump between formations every N beats), `swing` (bar-locked pendulum, wider when the voice is loud),
`pulse_fan` (the fan opens on each beat), `domino` (a travelling wave) and `vocal` (elevation follows the vocal contour).

## Song architecture: refrain, stanza lines, tagline

A song is not a flat list of lines. It is a few phrases that lead into a **central phrase** (mukhda, dhruvapad, the
hook; the *kadve* of a Marathi song are the stanzas between its returns) that comes back after every stanza, and
it closes on a **tagline**. WAL carries this as `phrases` (roles: `refrain`, `tagline`, `line`, `answer`, `lift`,
`instrumental`, `silence`) and `motifs`. The choreography engine (`core/choreo/choreograph.js`) then:

* gives the **refrain the same signature every return** (same movement shape, same colour order) and makes it bigger
  each time by adding layers, never by changing the shape, so the crowd learns it;
* gives each **stanza line its own turn** of colour and movement, alternating, building through the `lift` into the refrain;
* mirrors an **answer** line against the line before it;
* lands the **tagline** with a beat of dark, then everything together (blinders, strobe burst, CO2, lasers, confetti on the last one);
* drops to **silence** where the music holds.

## Sources

* ADJ, "Ask Alfred: moving heads, beam, spot, wash, hybrid": https://www.adj.com/blogs/news/ask-alfred-moving-heads-beam-spot-wash-hybrid-we-ve-got-you-covered
* PAC Lights, "Comparing different concert light fixture solutions": https://www.paclights.com/explore/comparing-different-concert-light-fixure-solutions-which-one-is-best-for-you/
* Elation, "What's in a name?" (fixture naming): https://www.elationlighting.com/blogs/resources/what-s-in-a-name
* AVL Gear, BLITZBARFX pixel and strobe bar listing (1 to 30 Hz strobe, 64 segment pixel control): https://avlgear.com/collections/professional-lighting-equipment/products/event-lighting-blitzbarfx-indoor-led-pixel-strobe-bar-with-electronic-frost
* LSI Online, Primal Scream tour (pixel batten strobing up to 28 flashes a second): https://lsionline.com/news/pixeldrive-with-primal-scream-19ie7x
* Control Booth and Avolites forum threads on strobe chases and random flashes: https://www.controlbooth.com/threads/flicker-strobe-effect.914/latest , https://forum.avolites.com/viewtopic.php?p=10042
* Ticket Fairy, "Special effects and pyrotechnics: safe implementation at festivals" (CO2 jets, confetti, flame, lasers): https://www.ticketfairy.com/blog/special-effects-and-pyrotechnics-safe-implementation-at-festivals

Limits of this research: it was a quick web survey, not a visit to a venue. Sunstrips and followspots turned up little
and are only approximated (`sunstrip-10` is a warm blinder bar; there is no followspot yet).

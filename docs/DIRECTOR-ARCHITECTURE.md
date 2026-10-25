# The director, redesigned: from a song and its video to a show anyone can dance to

One WAL file per song, played on every rig. That stays. What changes is how much the agent understands before it writes that file, and how strictly the engine turns that understanding into light.

## What the show must do (from the creator)

1. **Reflect the steps.** If the video has a hook step, the lights answer it, in the same way, every time it comes back.
2. **Repeat on purpose.** Stanza lines and tunes that return get the same light, so people in the room learn the show and dance to it.
3. **Never go black for every pause.** Silence is music. The room holds a colour and breathes. A real blackout is rare.
4. **Use every piece of equipment, by rank.** Beams, spots, wash, pixels, tubes, matrix, laser, strobe and blinder each have a part. A rig with one beam still plays the most important part.
5. **Understand the song as a whole**: story, emotion, culture, lyrics, instruments, and (when there is one) the video.
6. **Beams read as sharp, continuous paths** from the lens to where they land, with no fade-out along the way.

## What the big touring shows do (and what we copy)

| Practice | In our system |
|---|---|
| One colour world per song, like a chapter | The bible picks palettes from the song and the costumes; every section uses one |
| Small and intimate verses, a spot and a soft wash | Calm verses: one moving layer, slow figures, low strobe |
| Pre-chorus climbs, one new layer every two bars | The "lift" phrase and the rule "later return adds one thing" |
| The chorus arrives as a reveal, then holds | Refrain signature: identical on every return, bigger each time |
| The bridge strips back so the last chorus is the biggest | Rule in the cue prompt; the critic reports layer use |
| Signature gestures the crowd recognises | Stanza motifs and step motifs |
| Pauses are used, not blacked out | Silence breathes; blackouts max two per show |

These are widely documented practices of large tour and festival lighting design; they are used here as principles, not copied from any particular show.

## The agent pipeline

```
 EVIDENCE (cheap, measured)          UNDERSTANDING (Claude)             SCORE (Claude + code)             CHECK (code)
 ───────────────────────────         ──────────────────────             ─────────────────────             ────────────
 audio: tempo, bars, energy,   ─┐    research dossier (web)              bible: story, emotion, sections,   critic: blackout cap,
   bands, onsets               │    video brief (sheets):                 palettes, PHRASES with motif ids    darkness %, layer use,
 lyrics (synced when found)    ├─►    cast, scenes, steps + every         (lines that return share an id),    returning motifs,
 video: motion, cuts, hits     │      time they happen, emotion,          dark silences, moments              steps placed
                               ┘      colours
                                                                       choreography engine (code): every phrase on every layer,
                                                                         refrain signature, line motifs, silence breath, tagline
                                                                       cue sheet (Claude): the specifics the engine cannot know
                                                                       step cues (code): one recipe of light per step, at each return
```

### The show designer (a Claude pass, not a table)

Steps are not mapped to a fixed list of patterns. After the bible, a **show designer** pass (`server/lib/design.js`, runs beside the cue sheet) reads the story, sections, palettes, phrases, the video brief and the bar table, and writes three things for this song only:

1. **The opening**: how the show begins, usually slow and grand (a glow rising from nothing, a pair of beams opening), so the first big moment is earned.
2. **The elevation**: a climb of levels 0 to 9 over the song. The level decides which equipment may speak (0-2 wash and a beam or two; 3-4 all beams and the grid; 5-6 plus blinders; 7-8 plus strobes and lasers; 9 stage effects). Code enforces it by holding back the engine's lasers, strobes, blinders and effects below the level.
3. **Gestures**: small pieces of choreography the agent composes in beats, on any layer and group (including `pairA` and `pairB`, the sharpies in pairs of two, so two pairs can call and answer). A gesture is tied to the times of a dance step or to a returning line (`onMotif`). Code does not change it: it replays the agent's gesture identically at every return, and along a returning line it repeats until the line ends.

`server/lib/steps.js` (stock shapes by step name) is now only the fallback when the designer pass fails.

Checked on a real Bollywood dance-number video (a wedding-hall ensemble piece): the designer wrote an amber opening, 17 levels of climb, and six gestures (hook sway, tagline shout, a sea ripple on the ocean lines, floor drop, two-arm reach, arm sweep), played 31 times; the room was never without light, and 14 returning motifs got the same light each time. On the four-sharpy rig the hook shows the left pair in gold and the right pair answering in magenta.

### The score: what plays, in rank order

When the music has several things happening at once, they are not equal. The agent ranks them and gives each to the right equipment. A small rig keeps the top of the list.

1. **The voice and the story** (lyric line, hook, tagline): beam and spot movement, wash colour.
2. **The dancers' steps** (from the video): the same step is the same light. Placed by code from the video brief.
3. **The rhythm** (dhol, kick, claps): pixel, tube, matrix; strobe and blinder on the biggest hits only.
4. **The melody and harmony**: slow colour and the shape of the movement.
5. **Texture and space**: a low glow in the quiet, never black.

The missing-layer fallback already maps an absent layer onto the nearest one, so on a single beam the rig plays rank 1 and still looks like a concert.

### Where each requirement lives

| Requirement | Where |
|---|---|
| Steps are reflected | `server/lib/steps.js`: each step name picks one recipe (spin → carousel, clap → snap and tap, stamp → bounce, arm sweep → fan, walk → stairs, sway → swing, freeze → still and a flash, anything else → lotus). It is played, with the scene's costume colour, at every time the video reader listed for that step (snapped to a beat, two beats long, never inside a silence, never closer than about three beats apart). |
| The reader lists every return of a step | `VIDEO_SYSTEM` in `server/lib/video.js` |
| Repeating lines look the same | `core/choreo/choreograph.js` `lineSigs`: the first line with a motif id fixes its beam figure, colour and spot move; later lines with that id reuse them. The bible gives motif ids to any returning line (`server/lib/prompts.js`). |
| Silence is not black | `choreograph.js`: a silence holds wash, beams, spot and grid at 20 to 35 percent in the song's colours. `"dark": true` on a silence (rare, after a loud phrase, two at most) makes it a true blackout. The decoder no longer blacks out a silence accent by default. |
| Lines end on a low light, not on dark | the end-of-line "breath" now dims the beams to 30 percent instead of switching them off |
| Equipment is used by rank | "THE SCORE" section of the cue prompt |
| The result is checked | `server/lib/critic.js`: keeps two long blackouts, reports dark share, layer use, returning motifs; shown as warnings in the report |
| Sharp, continuous beams | `sim/scene/fixtures3d.js`: slower distance fade, a bright thin core, the tip no longer fades |

## What stays the same

WAL format (only an optional `dark` flag on a silence phrase is new), the rigs, the venues, the UI, and every audio-only path. Older shows are rebuilt from their stored structure when the choreography version changes (it is now 5), so existing songs lose the all-black pauses too.

## Honest limits

- Claude sees video as pictures. Step names are a best reading; the times come from measured motion and the reader's list. A wrong step name still lights at the right moments, in a plausible shape.
- Steps are matched by words in their name or description. An unusual name gets the default lotus.
- A rig with no movers cannot show a figure; the step still pulses the grid and the wash.
- "Understand the culture" means the research pass and the director's own knowledge. If the song is unknown the report says so.

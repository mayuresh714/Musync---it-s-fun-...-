---
name: wal
description: Turn a song (audio file) into a WAL light show (song.wal.json) that plays on any rig — analyze beats/sections/drops in pure JS, then apply musical and cultural judgement (mood, palettes, section labels, signature moments, dandiya/garba looks), validate, preview on rigs and publish to the Musync simulator. Use when the user wants a light show for a song, wants to add a song to the simulator, or wants an existing WAL improved.
---

# /wal: audio → WAL light show

You are the lighting designer. The analyzer gives you the facts: tempo, beats,
sections, energy, onsets, drops and silences. You add judgement: what the song
*means* and how it should *feel*. The output is a WAL file that plays on every rig,
from a single Sharpy to a full concert stage. Spec: [docs/WAL.md](../../../docs/WAL.md).
Vocabulary: [core/wal/vocab.js](../../../core/wal/vocab.js).

All commands run from the repo root.

## 0. Fastest route: the AI director

`node bin/wal.mjs direct "<audio>" --id <song-id> [--lyrics lyrics.txt] [--notes "..."]` runs the same two-pass
Claude pipeline the simulator's backend uses (bible, then cue sheet), writes `songs/<id>/`, and validates it.
Use it first, then refine with the steps below. It needs the `claude` CLI and ffmpeg.

## 1. Analyze and draft

```bash
node bin/wal.mjs build "<audio file>" --id <song-id> --title "<Title>" --artist "<Artist>" --style <style>
```

- `<song-id>` is kebab-case. Styles: `dandiya`, `bollywood`, `edm`, `concert`,
  `devotional`, `wedding`, `romantic`. Pick from what you know of the song, or ask.
- Add `--meter 3` for songs in 3 or 6/8 that you know are felt in three. Many garba
  songs are dadra/6-8, but if the analysis tracks a steady 4-beat pulse, keep 4.
- This writes `songs/<id>/analysis.json`, `song.wal.json` (a rule-based draft) and
  `summary.txt`. Read `summary.txt`: it is your view of the song. Don't read the raw
  JSON arrays.

## 2. Listen with your knowledge

If you know the song, use what you know: its structure (mukhda, antara, hook, drop,
dhol break), its language, the mood and meaning of the lyrics, and the occasion
(Navratri, sangeet, club, aarti). Do not reproduce lyrics. A short paraphrase of
meaning in `section.lyric` is fine. If you don't know the song, say so and design
from the analysis alone.

Then check the analysis against the music:
- **BPM.** Half- or double-time errors are common. If the BPM is clearly 2× off,
  say so. Beats are still usable when the tempo is a clean ratio.
- **Section kinds.** The heuristics label by energy. Relabel with musical names and
  add a `label` (e.g. "Mukhda", "Antara 1", "Dhol break", "Drop 2").
- **Drops.** Keep `kind: "drop"` for the 2–3 real peaks only. Other loud sections are `chorus`.

## 3. Shape the show (edit `songs/<id>/song.wal.json`)

The draft already has cues for every layer of every section. Improve them rather than
starting over. For more than a few edits, write a small Node script in the scratchpad
that loads the JSON, changes it and writes it back; it's safer than hand-editing a
long cue array.

Design rules (the user's taste, so follow them):
- **Calm verses.** Beams move slowly (`speed` 16 = a cycle every 4 bars), one routine
  per section, colour changes per `phrase`. In verses use only one moving layer.
  Avoid `crossfire`/`ballyhoo` outside real peaks.
- **Peaks earn the big looks.** Use `crossfire`, `ballyhoo`, beam `pulse@beat`,
  strobes and blinders only in the 2–3 drops or final choruses. Contrast is what makes
  a drop land.
- **Repeats look the same.** Sections with the same `group` get the same looks, and
  the last chorus may add one more layer.
- **Silence is a tool.** Keep `silence` accents; they black out and then slam back.
  Add an `fx: "blackout"` cue if you hear a stop the analyzer missed.
- **Signature moments.** Add 2–5 hand-placed cues at the moments people remember:
  the hook line, a dhol entry, the key change. Use a `note` to say why.
- **Palettes carry meaning.** Use `festival`, `marigold` or `fire` for celebration and
  Navratri; `sacred` for devotional; `romance` for love songs; `ocean`, `ice` or
  `royal` for night and club; `white` for solos. Define custom palettes in
  `palettes` when the song calls for them (e.g. a Rajasthani folk song: deep pink +
  saffron).
- **Dandiya/garba.** Use `dandiya_tap` on the `pixel` or `wash` layer when the high
  band is busy (stick taps), `garba_circle` on `wash` for chorus laps (`speed` 16–32
  beats per lap), and `circle` moves on beams. Keep it warm and joyful. Strobes are rare.
- **Devotional/romantic.** No strobes, no fast moves. Use `breathe`, `swell` and slow `sweep`.
- **Photosensitivity.** Keep strobes ≤ 12 Hz and keep bursts short.

## 4. Validate and preview

```bash
node bin/wal.mjs validate songs/<id>/song.wal.json
node bin/wal.mjs summary  songs/<id>/song.wal.json
node bin/wal.mjs preview  songs/<id>/song.wal.json --rig sim/public/rigs/single-sharpy.json
node bin/wal.mjs preview  songs/<id>/song.wal.json --rig sim/public/rigs/concert.json --at 12,45.5,63
node bin/wal.mjs preview  songs/<id>/song.wal.json --rig sim/public/rigs/dandiya.json
```

Fix every error. Read the warnings. In `preview`, check that drops are bright,
verses are calm, nothing is dark that shouldn't be, and the single-Sharpy rig still
tells the story through its fallbacks.

## 5. Publish

```bash
node bin/wal.mjs publish <song-id> --audio "<audio file>"
```

This copies the WAL (and the audio, for local testing only) into `sim/public/songs/`.
Run the simulator with `npm run dev` and pick the song. Don't commit copyrighted audio.

## Report back

Tell the user: BPM, structure (one line per section with your label), the
signature moments you placed, the palettes chosen and why, anything the analyzer got
wrong that you corrected, and anything you're unsure about (e.g. meter).

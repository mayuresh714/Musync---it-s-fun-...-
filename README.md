# Musync: one light show file for any rig

Musync turns a song into a **WAL** (Wave Augmented Language) file, a rig-agnostic
light show, and plays it on any setup: one Sharpy, a club, a concert stage or a
dandiya ground. Everything is plain JavaScript. The same analyzer and decoder run in
Node and in the browser.

```
audio ─▶ analyze (pure JS DSP) ─▶ draft / Claude /wal skill ─▶ song.wal.json ─▶ decoder + rig ─▶ simulator (later: Art-Net / sACN)
```

## Live demo

**https://musync-light-show.vercel.app/** (or deploy your own copy: [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmayuresh714%2FMusync---it-s-fun-...-&project-name=musync-light-show); the build settings are in [vercel.json](vercel.json)).

It is a small website, not just the simulator:

| Page | What it is |
|---|---|
| `/` | Home: what Musync is in three pictures, the places it can light, the privacy promise, FAQ. English, Hindi, Marathi and Gujarati. |
| `/equipment` | The collection: the nine families of light (beam, spot, wash, pixel bar, tube, LED wall, strobe, blinder, laser) with a moving picture, a plain-words job, five ratings and the models with their datasheet numbers. |
| `/signup`, `/signin` | Accounts. |
| `/account` | My shows (open, rename, download, delete), a getting-started checklist, settings (name, password, download my data, delete account). |
| `/studio` | The simulator. |
| `/legal` | Privacy, terms, copyright and music. |

**Your song is never uploaded.** On the hosted site a song is read in the browser, the light plan (WAL) is made on the device, and only that small file is saved to the account. To hear a saved show, the person picks their own copy of the song again (its fingerprint is checked). The hosted site ships only copyright-free demo music, so there is no copyrighted audio to host or pay to store. **Saving a video** also happens in the browser (WebCodecs + MP4): the show is rendered frame by frame, joined with the song, and goes to the Downloads folder.

Accounts are stored in the browser (IndexedDB; salted PBKDF2 password hash), which keeps the demo free of servers. They do not follow a person to another device. [sim/site/auth.js](sim/site/auth.js) and [sim/site/store.js](sim/site/store.js) are the only files that know this, so a cloud login can replace them. **Design with AI** and the AI director need the Musync server, which runs on your own computer with your own Claude login (see below); the hosted demo says so. The demo contains no commercial audio, lyrics or video.

## What is in it

- **Director agents.** Audio, lyrics, web research and (optionally) the music video go to Claude, which writes the show: the bible (story, sections, repeating lyric lines), a show designer pass (a slow opening, a 0 to 9 climb that decides which lights may speak, gestures for the dancers' steps) and the cue sheet. A critic checks the result. See [docs/DIRECTOR-ARCHITECTURE.md](docs/DIRECTOR-ARCHITECTURE.md) and [docs/VIDEO-STUDY.md](docs/VIDEO-STUDY.md).
- **Music video as evidence.** Drop a video (mp4, mov, webm) or paste a link: motion, cuts and step hits are measured with ffmpeg, Claude reads contact sheets, and the dancers' steps come back as the same light each time. Videos and frames are deleted after use.
- **Design with AI.** A side panel (also full screen or a slim bar) that turns words and venue photos into a rig, as a new setup or as a change to the one on screen. Stop, pause the show, speak instead of typing. Designs are saved in your browser and never overwrite the built-in rigs.
- **Six venues** with crowds, haze and eleven camera views; one WAL file plays on every rig.

## Quick start

```bash
npm install
npm run wal demo        # synthesize a copyright-free demo track + WAL into the simulator
npm run dev             # website http://localhost:5173, studio http://localhost:5173/studio
npm test
```

## Run it from a fresh clone

Needs Node 20+. Optional, only for the AI features: the [Claude Code](https://claude.com/claude-code) CLI signed in on your machine (Musync calls it locally, so there are no API keys in this repo), `ffmpeg`, and `yt-dlp`.

```bash
git clone <this repo> && cd <repo>
npm install
npm run wal demo     # makes a copyright-free demo track, since no commercial audio is included
npm run dev          # simulator at http://localhost:5173 (backend on 8787)
```

No commercial songs, lyrics or recordings are shipped. Songs you add yourself live in `.musync/` and `sim/public/songs/`, both git-ignored. Only add audio you have the rights to.

Turn a real song into a WAL:

```bash
node bin/wal.mjs build path/to/song.mp3 --id my-song --title "My Song" --style dandiya
node bin/wal.mjs publish my-song --audio path/to/song.mp3
```

In Claude Code, `/wal path/to/song.mp3` runs the full designer workflow: analyze,
add musical and cultural judgement, validate, preview, publish.

In the simulator, creators can also drop in an audio file and press **Analyze → WAL**.
The analysis runs on their device.

## Layout

| path | what |
|---|---|
| [core/analysis/](core/analysis/) | FFT, onset/tempo/beat/downbeat tracking, section segmentation, accents |
| [core/wal/](core/wal/) | vocabulary, JSON Schema, validator, rule-based drafter, summaries |
| [core/decoder/](core/decoder/) | WAL + rig → per-fixture state per frame (no rendering; reusable for DMX) |
| [core/fixtures/library.js](core/fixtures/library.js) | fixture profiles (datasheet specs, estimates marked `est`) |
| [bin/wal.mjs](bin/wal.mjs) | CLI: build, analyze, draft, validate, summary, preview, publish, schema, demo |
| [sim/](sim/) | Three.js simulator: venues with real structures, crowds, drone/walk cameras, rig builder, haze beams, timeline |
| [sim/site/](sim/site/) | The website pages (home, lights, sign in, account): shared layout, four-language strings, device accounts and shows store, light drawings |
| [sim/ui/export.js](sim/ui/export.js) | Saving a video in the browser (WebCodecs, MP4) |
| [sim/scene/venues.js](sim/scene/venues.js) | concert field, garba ground, club: stages, PA, screens, trusses, surroundings |
| [sim/scene/venues2.js](sim/scene/venues2.js), [venues3.js](sim/scene/venues3.js) | banquet hall and wedding lawn; the Ganesh procession street (tractors, light trolley, generator, idol trolley, crowd) |
| [sim/scene/people.js](sim/scene/people.js) | GPU-animated crowd and performers (clap, jump, phones, sticks) that follows the song |
| [sim/scene/cameras.js](sim/scene/cameras.js) | drone orbit / reveal / fly-over / top-down, crowd, pit, stage POV, walk, Director |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | how it all fits together, every path, and how it compares with a production web app |
| [docs/REFERENCES.md](docs/REFERENCES.md) | sources for the venues and what is estimated |
| [server/lib/video.js](server/lib/video.js) | the music video as evidence: motion/cut/step-hit measuring, contact sheets, the "video brief" Claude writes ([study](docs/VIDEO-STUDY.md)) |
| [docs/WAL.md](docs/WAL.md) | the format spec for anyone writing a decoder |
| [.claude/skills/wal/](.claude/skills/wal/SKILL.md) | the Claude skill |

## The simulator interface

Open the simulator with `npm run dev`. The 3D view fills the window; every control floats over it.

| area | what it does |
|---|---|
| **Top bar** | Songs on the left. On the right only four things: **Design with AI**, the **camera view** menu (12 views in plain words), **Lights** (place, add, in use, try one light) and **More** (what the lights are doing, appearance, haze, save as video, full screen, listen live, picture quality, shortcuts) |
| **Design** (D) | describe your event or attach venue photos; the AI designer builds the rig and shows it, then edits it as you ask |
| **Rig → Test** | one fixture alone with every movement, light and colour mode, or a tour of all of them |
| **Library** (L) | browse, search and play any number of songs; add songs in bulk (see below) |
| **Look** (V) | beam thickness, colour spill on the surroundings, LED screen brightness, glow, stage effects on or off |
| **Player** | Song and artist on the left; shuffle, previous, a large play button, next and a section-coloured progress bar with times in the middle; the current part of the song and volume on the right. On a phone it becomes two rows with finger-sized buttons |
| **Rig builder** (R) | pick a venue and rig, add real fixtures from the library, edit positions, mount and layer, export and import rigs |
| **Show panel** (S) | what each layer is doing right now, and how the decoder mapped the show onto your rig |

**Cameras.** *Crane* (J) is a jib that swings and climbs a few strides from the stage and its lights; on a concert stage the *Director* uses it instead of most of the distant drone shots. *Director* cuts between shots on the music, with a dip to black on each cut. *Walk* puts you at eye
level in the crowd: W A S D to move (Shift to go faster), drag to look, wheel to zoom. Dragging in any other
view hands you free orbit.

**Files.** Drop an audio file or a `.wal.json` anywhere on the page. Audio opens the analyze dialog; a WAL plays.

**Keys.** Space play / pause · ← → skip 5 s (Shift 15 s) · L library · / or Ctrl K search · A add songs ·
N next · B previous · Z shuffle · J crane · E export video · Shift+E record live · V look · [ ] beam thinner / thicker · 1–9, 0 cameras · C next camera · H haze ·
R rig · S show · U hide the interface · F fullscreen · M mute · P frame rate · ? all shortcuts.

### The library (built for a thousand songs and more)

The library holds metadata only; a song's show is fetched when it is played, and the list is virtualised (about
15 rows exist in the page whatever the size), so 1000 songs cost the same as 10.

* **Search** is instant and forgiving: every word must match the title, artist, mood, language or style
  (accents ignored), with the best title match first. `bpm:120-130`, `style:edm` and `lang:marathi` narrow it further.
* **Sort** by recently added, recently or most played, title, artist, tempo or length. **Filter** by Favourites,
  Recent, Made here or Demos, and by style and language (the counts are shown).
* **Keyboard**: ↑ ↓ PageUp PageDown Home End move, Enter plays, Ctrl S favourites, Esc clears the search and then closes,
  typing anywhere jumps to the search box, Tab never leaves the sheet. Right-click (or the ⋯ button) opens play,
  favourite, rename and delete for songs made here.
* **Queue**: Next and Previous follow the list you picked the song from (so a search or a filter is a playlist);
  Shuffle avoids recent repeats; a finished song moves on by itself (switch off in Settings).
* **Add songs** (A): drop or choose any number of audio files. They go to the backend queue, the director works through
  them one at a time, and each shows live progress, can be cancelled or retried, and lands in the library when ready.
  The same audio is recognised by its hash and is not redone. Dropping two or more files anywhere opens this tab.
* Favourites, recents and play counts are kept in the browser.

Scale test: `node scripts/seed-library.mjs --count 1000` then `MUSYNC_DATA=.musync/seed npm run dev`.

**Look panel.** The sharp beams are drawn thin by default because real ones are; slide **Beam thickness** (0.5 to 8
times) until they read the way you want. **Colour spill** controls how much coloured light lands on the floor, crowd
and structure (lower keeps the venue neutral), **LED screens** and **Glow** tame the brightest surfaces.
Settings are remembered in this browser.

**Tests.** `npm test` runs the unit tests. `node test/e2e/run.mjs` drives every navigation control (cameras, drawers,
Look, settings, transport, library, queue, add songs, phone layout) in real Chrome against an isolated backend that uses a
fake director, so it costs nothing; it needs Chrome and a Playwright-compatible driver (see the file header).

**Picture quality** (gear icon). *Auto* adjusts render sharpness to hold a smooth frame rate: it steps down quickly
when a GPU struggles and back up slowly, and it ignores an evenly capped refresh rate (a steady 30 Hz is the display,
not the GPU). *High*, *Balanced* and *Low* pin it. The interface chrome fades after a few idle seconds of playback.

## Live mode, YouTube links and the two engines

**Live mode** (press `O`, or the Live button top left) lights the rig to music as it plays, with nothing prepared in advance.
- *Browser tab*: play the song on YouTube in another tab, pick that tab and tick "Share tab audio" (Chrome or Edge).
- *Microphone*: play music on a phone or speaker nearby; the lights follow what the microphone hears.
- The tracker (`core/live/tracker.js`) finds tempo, beats, bars and drops from the audio so far and builds a rolling WAL with the same choreography as a prepared show. It reacts about a beat or a bar late by nature. The sensitivity slider (click Live again) helps with far-away speakers. Nothing is recorded or uploaded.

**Add by YouTube link**: Library, Add tab, paste a link. The backend downloads the audio with `yt-dlp` (install with `brew install yt-dlp`; YouTube links only, one video, up to 25 minutes) and makes the show.

**Engine choice** (Add tab): *AI* has Claude write the show (lyrics, motifs, drop moments); *Code* builds it instantly from the audio analysis with no AI. Each song shows an AI or Code badge.

**Look panel** also has Beam brightness, Haze amount and Surroundings (how bright lamps and windows around the venue are). Rig and Show panels both open on the right, one at a time. Moving heads can now `spin` and `cone` through a full 360 degrees.

## Interface code

[sim/ui/](sim/ui/): `kit.js` (element builder, popovers, tooltips, toasts, modals, event bus), `icons.js`,
`chrome.js` (top bar and dock), `drawers.js` (rig and show panels), `dialogs.js` (analyze, shortcuts),
`timeline.js`, `fx.js` (loader, dip-to-black cuts, drop zone). [sim/main.js](sim/main.js) owns the scene and
publishes changes on the bus; the interface only talks to it through an `actions` object. Styles are one
tokenised sheet, [sim/style.css](sim/style.css).

## AI director (Claude)

The on-device analyzer follows beats and loudness. The **AI director** adds meaning: it reads the song's
measurements and its lyrics, works out the story, language and mood, re-sections the song, and writes the
cues so every layer plays a part (beams carry the melody and voice, washes carry the emotion, pixels the
rhythm, lasers and strobes only at the peaks). It runs the Claude Code CLI on your own login, so it uses your
Claude subscription and needs no API key.

```bash
npm run dev                 # starts the backend (:8787) and the simulator (:5173) together
```

Drop an audio file on the page, choose **AI director**, and press the button. About 2 minutes.
From the terminal: `node bin/wal.mjs direct song.wav --id my-song [--lyrics lyrics.txt] [--notes "sangeet entry"] [--model opus]`.

How it works (`server/lib/`):

1. `ffmpeg` decodes the audio and the pure-JS analyzer measures it. The beat grid is repaired
   (half-time tempo, tracking that stops early) and a per-bar table of energy, low/mid/high levels and onsets is built.
2. Lyrics come from LRCLIB (checked against the file name and duration) or from the box in the dialog.
3. **Pass 1, the bible:** Claude re-sections the song on bar boundaries, names the parts, picks palettes and
   marks the signature moments. It also maps the **lyric architecture**: the refrain (mukhda / dhruvapad) and every
   place it returns, the stanza lines (kadve), answers, the lift into the refrain, the closing tagline, silences.
   Sections, phrases and palettes are snapped to bars and validated.
4. **Choreography** ([core/choreo/](core/choreo/choreograph.js)): an engine plays every phrase on every layer. The refrain gets
   one fixed signature that returns identical and bigger each time; each stanza line turns colour and movement and
   dances with the voice and the kick; the tagline slams after a beat of dark. See [docs/concert-lighting.md](docs/concert-lighting.md).
5. **Pass 2, the cue sheet:** Claude adds only what the engine cannot know (the beat a word lands, an entry, a story
   colour change, a strobe pattern or stage effect) and its cues are overlaid on the choreography. Every cue is cleaned against the WAL schema (unknown looks and parameters are dropped,
   strobe is capped at 12 Hz, times snap to the beat grid) and the whole file is validated. One repair round if needed.
6. The result is stored under `.musync/jobs/<id>/` (audio, analysis, lyrics, bible, `song.wal.json`, `report.json`)
   and listed in the simulator's song menu.

Backend API (all under `/api`): `GET health`, `POST jobs` (multipart: `file`, optional `title`, `artist`, `style`,
`lyrics`, `notes`), `GET jobs/:id/events` (server-sent progress), `GET jobs/:id`, `GET jobs/:id/wal`,
`GET jobs/:id/audio`, `POST jobs/:id/cancel`, `GET jobs` (the queue), `GET library`, `PATCH` / `DELETE library/:id`. It listens on `127.0.0.1` only.
Environment: `MUSYNC_MODEL` (default `sonnet`), `MUSYNC_EFFORT_BIBLE` (`medium`), `MUSYNC_EFFORT_CUES` (`low`), `MUSYNC_PORT`, `MUSYNC_DATA`, `MUSYNC_FAKE_DIRECTOR=1` (tests).

What it cannot do: Claude does not hear audio. It sees measurements and text, and uses what it knows about the
song. Lyric lines are placed from the energy of each bar, not forced-aligned to the voice; if you have timed
lyrics or a transcript, putting them in the lyrics box will improve placement.


## Creative range: figures, ensembles, more fixtures

Shows no longer replay one set of moves. The choreography engine ([core/choreo/](core/choreo/)) keeps a **repertoire**
([repertoire.js](core/choreo/repertoire.js)): about 40 movement entries (orbit, lissajous, helix, lotus, carousel, curtain, scissor, ripple, stairs,
scanline, spiral, peacock, dance, drift, ribbon, and two-ensemble pairs) plus dim patterns and colour moves for every layer. For each phrase it scores
the entries against the song: the **genre** (13 styles, from dandiya and bollywood to rock, hip-hop, sufi, classical, folk and pop), how **loud** the
phrase is, whether the **instruments** there are rhythmic (dhol, kick), melodic (voice, harmonium, strings) or airy (hats, shimmer; read from the onsets and
band levels), what it has already played (no figure twice in a row, a fresh look for every phrase) and the director's per-section "move" choices. The pick is
seeded from the song, so the same song always gets the same show and two songs of different character do not. A long chorus plays the refrain's signature,
swaps its two halves and brings in one new figure instead of repeating one move for thirty seconds.

`node scripts/variety.mjs` measures it across the library (distinct figures per song, how much each leans on its favourite, how alike two songs are);
`--old` shows the stored cues for comparison. `node scripts/remaster.mjs` brings every older show up to the current choreography from its own stored structure (no audio,
no AI; the old file is kept as `*.v1.json`), and the backend does the same for any older show at start-up.

**Rays.** Moving heads that own a prism (Sharpy, 7R beams, Mythos 2) throw a crown of eight rays at the peaks (`prism: true`); every lit head has a flare at the lens;
lasers draw cones, sheets, waves and starbursts. **Ring rigs** (garba ground, club truss ring) declare a `focus`, and every look turns inwards from wherever its
fixture stands, so the towers and pole-top heads of the garba ground sweep their rays over the dancers instead of away from them.

**Fixtures and layers.** Two new layers, `tube` (vertical LED pixel tubes) and `matrix` (LED pixel walls, a real 2-D grid that plays equalisers, plasma,
rings, rain and diagonals), plus Robe Spiider wash movers and Clay Paky Mythos 2 hybrids. The concert rig has 70+ fixtures on nine layers, the club has a truss ring with beams,
a kinetic tube ring, a two-panel LED wall behind the DJ, strobes, wall lasers and perimeter uplights, and the garba ground has a head on every pole, tubes on the towers and round the garbi,
matrix panels beside the stage and lasers on the far towers. Stage effects now include cold sparks and streamers.

## Recording and looking at the show

**Record / export** (button in the top bar, or `E`): renders the whole show one fixed time-step at a time at 1080p / 30 fps and has ffmpeg join the frames with the song's audio into an H.264 `.mp4` in your Downloads folder (`MUSYNC_EXPORTS` changes the folder). Because every frame is drawn at its own exact time, the file is smooth and sharp whatever the speed of the computer; it takes longer than the song to make (about 2-4× on a laptop), and the browser tab has to stay in front. Press `E` again to cancel. **Shift+E** records live instead (WebM from the browser; quick, but only as smooth as the machine's frame rate, and used automatically if the backend or ffmpeg is missing).

**For a designer reviewing the show without a screen**, [scripts/capture.mjs](scripts/capture.mjs) plays any song on any rig, one fixed time-step at a time (identical on every run), and writes stills, a contact sheet, a motion strip or an MP4:

```bash
node scripts/capture.mjs --song "Chogada" --rig dandiya --cam crane --at 40,90,150 --sheet
node scripts/capture.mjs --song "Kamariya" --rig club --strip 60 --frames 8 --every 0.5 --sheet     # a motion strip
node scripts/capture.mjs --song "Illuminati" --rig concert --video 20 --from 45                       # an MP4
```
It prints the figure each layer is playing at every still. Needs Chrome and a Playwright-compatible driver (same as the end-to-end tests).

The AI director now has a research pass: before it writes anything it runs a few web searches on the song (who made it, the film or album, the genre and culture, how crowds live it, where it pauses) and both passes read the dossier (`research.md` beside the show). Set `MUSYNC_RESEARCH=0` to skip it.

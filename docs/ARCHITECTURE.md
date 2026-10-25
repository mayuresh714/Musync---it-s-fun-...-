# Musync architecture

How the project works, where every part lives, and how it compares with a production web app such as Spotify.
Read [README.md](../README.md) first for what it does; [WAL.md](WAL.md) for the show format.

## 1. The idea in one picture

```
 song (file / YouTube link / mic)                 words + venue photos
        |                                                 |
        v                                                 v
  core/analysis  --- beats, sections, energy        server/lib/planner.js  (Claude: "AI designer")
        |                                                 |
        v                                                 v  core/design/rig-plan.js (check + repair)
  server/lib/director.js (Claude: "AI director")        a RIG (list of fixtures in a venue)
        |  + core/choreo (rules that write the cues)      |
        v                                                 |
  song.wal.json  = the SHOW (rig-agnostic intent)  --+    |
                                                      v   v
                                         core/decoder  (WAL + rig -> per-fixture state each frame)
                                                      |
                              sim/ (Three.js: venue, crowd, beams, cameras)   later: Art-Net / sACN to real lights
```

Two Claude-backed features share one mechanism (`server/lib/claude.js` runs the `claude` CLI headless):

| feature | input | Claude's job | output | trust boundary |
|---|---|---|---|---|
| **Director** (song to show) | audio, lyrics, web research | write the song's structure, mood, phrases, images | `song.wal.json` | `server/lib/merge.js` + `core/wal/validate.js` |
| **Designer** (use case to rig) | chat text, venue photos, current rig | pick a venue, choose and place fixtures, explain assumptions | rig plan | `core/design/rig-plan.js` |

The model never gets the last word: every reply is checked and repaired by plain code before it reaches the screen.

## 2. Where everything lives

| path | what it is |
|---|---|
| `core/` | Pure JavaScript, no DOM, no Node-only APIs. Runs in the browser, in Node and (later) on a lighting controller. |
| `core/analysis/` | `analyze.js` (pipeline), `fft.js`, `features.js`, `rhythm.js` (tempo, beats, downbeats), `structure.js` (sections), `grid.js` |
| `core/wal/` | The show format: `vocab.js` (every allowed look/palette/image), `schema.js` + `validate.js`, `draft.js` (rule-based show), `remaster.js` (re-make an old show with the current choreography), `summary.js` |
| `core/choreo/` | `choreograph.js` (phrases to cues for every layer), `repertoire.js` (the figures to choose from, scored by genre/loudness/instruments), `imagery.js` (what a lyric is *about*, said in light). `CHOREO_VERSION` is bumped when choreography changes; old shows are re-made from their stored structure. |
| `core/decoder/` | `decoder.js` (WAL + rig to fixture state), `looks.js` (every movement/brightness/colour look), `timebase.js` |
| `core/fixtures/library.js` | 17 fixture profiles (datasheet specs; estimates are marked `est`) |
| `core/design/rig-plan.js` | Venue bounds, the fixture catalogue for the prompt, `normalizePlan` (validate, clamp, de-duplicate, cap at 60), bill of materials |
| `core/live/tracker.js` | Real-time tempo/beat tracking for Live (microphone) mode |
| `server/index.mjs` | The whole backend: HTTP routes, job queue, library index, exports, plan API. Listens on 127.0.0.1:8787 |
| `server/lib/director.js`, `prompts.js`, `merge.js`, `brief.js` | Song to show with Claude: prompts, merging the model's answer into a WAL |
| `server/lib/lyrics.js`, `youtube.js` | LRCLIB lyrics lookup, yt-dlp download |
| `server/lib/planner.js`, `fake-planner.js` | The AI designer (prompt, one call per chat turn, one repair round) and its free test double |
| `server/lib/claude.js` | Runs `claude -p` with tools off (or `Read` only for photos) |
| `server/lib/codegen.js`, `fake-director.js` | Rule-based engine (no AI) and the free test double |
| `sim/` | The browser app (Vite). `main.js` is the app: state, frame loop, actions, keyboard |
| `sim/scene/` | `venues.js` (concert field, garba ground, club), `venues2.js` (banquet hall and wedding lawn, added later and kept separate so the originals are untouched), `venues3.js` (street procession: a tractor and light trolley, generator vehicle, a Ganesh idol trolley, a dancing crowd on the road and onlookers along both pavements), `fixtures3d.js` (beam shader, fixtures), `people.js` (animated crowd), `cameras.js`, `stage.js`, `env.js`, `effects.js`, `screens.js` (LED walls) |
| `sim/ui/` | `chrome.js` (top bar, dock), `drawers.js` (Rig builder, Test tab, Show), `planner.js` (Design with AI chat), `library.js` (song library, 1000+ songs), `timeline.js`, `dialogs.js`, `record.js`, `kit.js` (small DOM helpers, event bus, toasts) |
| `sim/bench.js` | Test bench logic: one fixture alone, every mode (pure, unit-tested) |
| `sim/make-rigs.mjs` | Generates the preset rigs into `sim/public/rigs/` (concert, club, dandiya, single/quad Sharpy) |
| `bin/wal.mjs` | CLI: build, analyze, validate, preview, publish |
| `scripts/` | `capture.mjs` (look at the show in a real browser), `study.mjs` (measure show quality), `variety.mjs`, `remaster.mjs`, `rerun-director.mjs`, `score.mjs`, `seed-library.mjs`, `dev.mjs` |
| `test/` | `*.test.js` unit tests (node:test) and `e2e/` browser tests (own servers on 8799/5199, fake Claude) |
| `songs/`, `sim/public/songs/` | Bundled demo shows |
| `.musync/jobs/<id>/` | The "database": one folder per song (audio, `analysis.json`, `bible.json`, `song.wal.json`, `report.json`, `research.md`) |
| `.musync/plans/<sid>/` | One folder per AI-design chat: photos, `history.json` |
| `dist/` | Built simulator (`npm run build`) |
| `.claude/skills/wal/` | The `/wal` Claude Code skill for making a show from a terminal |
| `docs/` | This file, `WAL.md`, `wal.schema.json`, `REFERENCES.md` (venue sources), `concert-lighting.md`, `SHOW-STUDY.md` (why shows felt poor, with measurements) |

## 3. How the main flows work

**Song to show.** Upload or paste a link, then `POST /api/jobs`. The job queue (one at a time) decodes and analyses the audio, looks up lyrics, asks Claude to research the song and write its structure (`bible.json`), merges that into a WAL, runs the choreographer to write the cues, validates, and stores it. The browser lists songs from `GET /api/library`, fetches one WAL when played, and decodes it on the selected rig every frame.

**Use case to rig (AI mode).** Press **D** or *Design*. Each message goes to `POST /api/plan` (text, up to 4 photos of 8 MB, the current rig). The server saves photos in the session folder, runs one Claude call (Claude `Read`s the photos itself), extracts the JSON plan, runs `normalizePlan` (unknown fixtures dropped, positions clamped into the venue, ids made unique, cap of 60), and on failure makes one repair call with the exact error. The browser polls `GET /api/plan/:id`, then applies the rig, camera and a fixture list. Earlier designs stay in the chat and can be shown again. Nothing overwrites "My rig".

**Test bench.** Rig builder, Test tab: one fixture on an empty stage, every movement, brightness and colour mode as a chip, or a tour of all of them. Restores the real rig and show on exit.

## 4. Is it built like a standard web app such as Spotify?

Short answer: **the front end follows common practice for a canvas-heavy app; the back end is a single-user, local-first prototype**, not a multi-user service. That is a deliberate choice for now (it runs on one person's Claude login) and it is the main thing to change before offering this to the public.

| area | Musync today | A Spotify-class web app | verdict |
|---|---|---|---|
| Client code | Vanilla ES modules, Vite, Three.js, a tiny DOM helper and event bus. `main.js` is ~900 lines holding state, loop and actions. | Component framework (React etc.), typed (TypeScript), state store | Fine for a 3D tool; `main.js` should be split and the project would benefit from TypeScript |
| Audio | HTMLAudio with HTTP range requests; analysis in a Web Worker | Streaming (HLS/DASH), CDN, DRM | Good enough; no CDN |
| Library scale | 1,000 songs tested; light index in memory, WAL fetched on play, virtualised list | Pagination, search service | Good for the size |
| Back end | One Node file, regex router, in-memory job map | Several services behind an API gateway | Prototype |
| Data | Folders of JSON on disk (`.musync/`) | Databases, object storage | No DB, no migrations, no backups |
| Auth and users | None: it trusts the machine (binds to 127.0.0.1) | Accounts, sessions, permissions, quotas | Missing |
| AI | `claude` CLI on the host's own login, one job at a time | API keys per environment, queue, per-user rate limits and cost caps, retries | Cannot serve many users; fine for one |
| Security | Local only; uploads type-checked by content (not just extension); size caps; photos are the only thing Claude can read; model output validated by code | Threat modelling, CSP, rate limits, abuse monitoring | Reasonable locally, not hardened for the internet |
| Tests | 52 unit tests + 47 browser end-to-end tests (fake Claude, 1000-song library); `scripts/study.mjs` measures show quality | Unit, integration, e2e, load, visual regression, in CI | Good coverage for the size; **no CI, no linter, no type checks** |
| Source control | The folder is not a git repository | Git, PR review, CI/CD | Fix first: `git init`, commit, add a remote |
| Observability | Console logs, per-job `report.json` | Logs, metrics, tracing, alerts | Minimal |
| Accessibility and responsive UI | ARIA roles, keyboard shortcuts, reduced-motion, a phone-width test | Same, audited | Good start |

### What it would take to offer the AI designer to the public
1. `git init` and CI (run `npm test` and `node test/e2e/run.mjs` on each change); add ESLint and TypeScript checks (`// @ts-check` is a cheap start).
2. Replace the CLI with the Anthropic API behind the same `runClaude` function; read photos as image content blocks instead of a `Read` tool.
3. Put a database (Postgres) and object storage (S3) behind `.musync/`; keep the same JSON shapes.
4. Accounts, per-user daily limits and a cost cap per design (each design currently costs one Sonnet call of about 15 to 20 s).
5. A real job queue (BullMQ or similar) instead of the in-process promise chain.
6. Share links: a saved design as a read-only page a client can open, with the fixture list for the quote.
7. A **custom room**: today the AI picks the nearest of three built-in scenes (stage, club, ground) and states the difference as an assumption. A parametric room (width, depth, ceiling, truss points read from photos) would make a client's venue look like their venue.

## 5. How the AI mode was tested

- `test/design.test.js` (6): plan validation and repair (unknown fixtures, out-of-bounds, duplicate ids, cap, bad camera, long text), prompt contents, the test double.
- `test/e2e/ui.tests.mjs` "design" (8, real browser, fake designer): opens with the button and **D**, one panel at a time, request to rig on screen, bill of materials, follow-up edits, showing an earlier design again, photo attach/remove/limit/type check, failure then recovery, reload keeps the chat, hand-over with the test bench, and the API (missing message, text disguised as PNG, 5 photos, path-like session id, second message while busy gives 409, unknown id gives 404).
- A **real Claude run** on one demand: an event company asking for a sangeet for about 250 guests in a banquet hall, with a photo and "about 20 fixtures, warm colours", then a follow-up edit. Result: 19 s for the first design (20 fixtures: 6 pars, 4 Sharpy, 2 MegaPointe, 2 Spiider, 2 tubes, 2 sunstrips, 1 matrix, 1 strobe; club scene chosen, ceiling and mounting stated as assumptions, two questions asked) and 16 s for the edit (two Mythos 2 added, one sunstrip removed, rest untouched, 21 fixtures). No fixtures were dropped or moved by the checker, and the design plays on the simulator with the show. The photo was a screenshot of the simulator's own club, not a real photograph; Claude noticed this and said so. Real photographs have not been tried yet.

## 6. AI designer: conversation rules (updated)
- Six venues are available to it: `hall` (banquet hall), `lawn` (wedding lawn), `procession` (street procession), `stage`, `club`, `garba`. Weddings go to `hall` or `lawn`; processions, baraats and Ganesh visarjan go to `procession`.
- It always starts from an **empty venue**. The client sends a rig back only when it is a design made in the same chat (`presetId === 'ai'`), never a built-in preset.
- A thin first message gets **one question with tap-able answers** and changes nothing on screen (`kind: "ask"`); anything with an event and a place or size is built straight away (`kind: "design"`).
- Replies are three short plain sentences, plus up to four "what it does" bullets; the assumptions and the light list are folded away.
- Tested with real Claude on two full conversations (banquet hall wedding: question, build, warmer and livelier, remove strobes; garden wedding: build to "about 12 lights", add two beams, "continue building"). Every reply passed the automatic checks (no "null", at most four sentences, no jargon, correct venue, edits touch only what was asked).


## 7. The music video (optional input to the director)

Study and reasoning: [VIDEO-STUDY.md](VIDEO-STUDY.md). In short:

- **Input.** A video file (mp4, mov, m4v, webm, mkv) or a YouTube link. The backend keeps the picture, extracts the sound to `audio.m4a` with ffmpeg (so audio and video share one clock) and runs the same job as for a song. Links download the video at 480p or less and fall back to audio only if that fails. The AI director is the only engine that reads pictures; "Watch the video" in the Add tab turns it off.
- **Measure** ([server/lib/video.js](../server/lib/video.js)): ffmpeg reads 48x27 thumbnails at 4 fps; plain code gives a motion curve, hard cuts and the strongest movement peaks ("step hits"), then per-bar motion (`v`) and cuts (`c`) columns for the bar table, and the hits that land within 90 ms of a beat.
- **Look**: ffmpeg builds 3x3 contact sheets (every tile stamped with its time) plus up to three burst sheets (9 frames, a quarter second apart) at the biggest peaks. One Claude call (Read tool on the sheets, `MUSYNC_EFFORT_VIDEO`, default low) writes a "video brief": cast by role and look (never named from faces), scenes with the step, emotion, colours and energy, signature steps, lighting ideas. `cleanBrief` clamps and drops anything invalid.
- **Use**: `director.js` runs this between research and the bible. The brief goes into the bible prompt, and `VIDEO_RULES` (bible) and `VIDEO_CUE_RULES` (cues) are appended to the system prompts only when a video exists; audio-only prompts are byte-for-byte unchanged. Any failure becomes a warning in the report and the show is made from audio.
- **Privacy.** The video and the sheets are deleted when the job ends (`cleanVideoFiles`); `video.json` (the brief and the measured profile) stays in the job folder. Frames go only to the Claude session on this computer.
- **Tests.** [test/video.test.js](../test/video.test.js) (maths, brief cleaning, prompts, a generated clip through ffmpeg), the "music video" e2e test in [test/e2e/ui.tests.mjs](../test/e2e/ui.tests.mjs).

# Using the music video: a short study

Today the director works from the **sound** (tempo, bars, energy), the **words** and what it already knows about the song. It has never seen the song's video. People who love a song remember it through the video: the hook step, the lead actor's entry, the colour of the costumes, the moment the crowd joins. When the lights reproduce that, the room reacts. This study decides how to get that from a video without breaking what already works.

## What a video holds that audio does not

| in the video | what it tells the lights | how reliably we can read it |
|---|---|---|
| **When the dancers hit** (every step, jump, spin, freeze) | exact accent times and the speed of the choreography | high: measurable from pixels, no AI needed |
| **Cuts and camera moves** | the editor's rhythm, where a section really changes | high: measurable |
| **Who is on screen** (lead actress or actor, supporting leads, ensemble, crowd) | who the lights should "follow" in each part: solo = tight and single, ensemble = wide and many | medium: Claude reads still frames and names roles |
| **The step itself** (garba clap, dandiya strike, hook step, spin, mudra, walk) | the figure the lights should perform: sweep, fan, pulse, chase, rotate | medium: stills show poses, not motion; a short burst of frames helps |
| **Emotion** (joy, longing, defiance, devotion, flirt) | palette, softness vs hardness, strobe or no strobe | medium-high: faces, posture and setting are readable |
| **Costume and set colours** | a palette that belongs to *this* video | high |
| **Repeats** (the same hook step returns four times) | one motif that returns each time, the "mimic" effect | medium: found by comparing bursts |

## What we cannot do, said plainly

- Claude sees **pictures, not motion**. Steps are read from a row of frames plus the motion numbers; a fast spin or a subtle hand gesture can be missed or misnamed. The measured signal, not the AI's reading, decides *when*; the AI only decides *what* it was.
- It will not know a step by name unless the pose is clear or the song's hook step is well known (the research pass already looks that up).
- Quality depends on the footage: a lyric video with a static background gives almost nothing; a proper dance video gives a lot. We say so in the report instead of inventing steps.

## The design (three layers, cheap to expensive)

1. **Measure (free, in code, no AI).** ffmpeg reads the video at 4 frames a second at thumbnail size. From that: a **motion curve** (how much moves, 0 to 9 per bar), **cuts**, **brightness** and the **strongest hits** (motion peaks). Video time equals audio time because the audio is taken from the same file, so everything lines up to the beat grid with no guessing.
2. **Look (one Claude call with images).** ffmpeg builds contact sheets (a 3 by 3 grid of frames, spread over the whole video) and up to three **burst sheets** (nine frames over about two seconds) around the biggest motion peaks, where a step can actually be seen. Claude reads them and returns a small JSON "video brief": the cast and their roles, scene by scene (time range, who, the step, the emotion, the colours, an energy 0 to 9), the signature steps and where they return, and how the lights should answer.
3. **Use (inside the existing passes).** The brief and the motion column are added to the director's bible prompt and the cue prompt. The director was already told to find the hook, give each section a movement idea and mark signature moments; now it has evidence. A section where a lead dances alone gets a single focused figure; the ensemble section gets the wide chase; the hook step returns as the same light motif every time; costume colours become the palette.

## Safety rails (so nothing existing breaks)

- **Optional and non-fatal.** No video, ffmpeg trouble or a failed vision call: the director carries on from audio exactly as before and the report says why.
- **Audio-only prompts are unchanged.** The video text and rules are appended only when a video exists.
- **Links download the video** (small, 480p at most), take the audio from it and delete the video and the frames when analysis ends. Nothing is kept or shared; the frames go only to the Claude session already on this computer.
- **Uploads accept video** (mp4, mov, m4v, webm, mkv). The audio is extracted and stored like any other song.
- **A switch.** The Add tab has "Watch the video" (on by default). The code engine ignores video.
- Use only videos you have the right to analyse. This repo ships none.

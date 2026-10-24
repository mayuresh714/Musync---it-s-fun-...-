# References for the simulated venues, crowds and cameras

**Limits, stated plainly.** These venues were built from written sources plus general knowledge of how
festival stages, garba grounds and clubs are put together. I could not watch concert or garba video or
view photographs while building them, so nothing here is traced from footage. People are stylised
(faceless, simple clothing, rigid limbs); proportions, density, scale and motion timing are what is
meant to be believable. Anything not stated by a source is an estimate and listed in each venue's
`info.est` in [sim/scene/venues.js](../sim/scene/venues.js).

## What the sources gave

| topic | source | used for |
|---|---|---|
| Festival delay towers 50–70 m from the stage, FOH centred and level with the audience, truss grids and moving heads plus PAR bars and strobes | [Sound on Sound](https://www.soundonsound.com/people/jon-burton-prodigy-outdoor-sounds-engineering-sound-festival-events), [Soulsound](https://soulsound.co.uk/making-arenal-sound-part-3/), [Festival Insights](https://www.festivalinsights.com/?p=10613), [ProSoundWeb (EDC Mexico)](https://www.prosoundweb.com/edc-mexico-hosts-largest-pk-sound-deployment-to-date/) | concert: delay towers at ±17 m, z = 47; FOH platform; roof truss grid; flown line arrays; subs at the deck edge |
| Circular truss centrepiece, floor-mounted truss towers of 3 m and 6 m | [TPi: Gibonni](https://www.tpimagazine.com/140-robe-fixtures-illuminate-gibonni/) | ground-support and corner towers |
| Garba: concentric circles around a lamp, two-clap step, outer circles slower, dandiya rings counter-rotate, chaniya choli, kedia/turban | [Outlook Traveller](https://www.outlooktraveller.com/amp/story/destinations/india/garba-the-timeless-dance-of-devotion-community-and-culture), [Hindutone](https://hindutone.com/festivals/garba-for-beginners-steps-etiquette-kids/), [Aza Fashions](https://www.azafashions.com/blog/navratri-garba-etiquette-first-timers-usa/) | dance rings, clap on every beat, outer rings 25% slower, alternate-ring direction in dandiya mode, clothing. Sources disagree on circle direction, so it is not fixed |
| Navratri set-ups: cultural stage, designer entry gate, LED wall, marigold torans, LED pixels, laser beams, canopy | [Hire4Event](https://www.hire4event.com/plan-your-event/navratri-event-planner), [Shrih Navratri](https://navratri.shrih.net/creating-royal-garba-nights-grand-navratri-decor/), [Eventswala](https://eventswala.in/product/navratri-dussehra-garba-night-decoration/) | entrance arch with marigold, stalls, LED backdrop, stage drapes |
| Club: ~22 ft ceiling for truss, 25 ft truss over the booth, booth 6×4 ft minimum, ~3 sq ft of dance floor per guest, LED backdrop | [ADJ case study](https://www.adj.com/blogs/news/adj-lighting-video-system-helps-new-la-nightclub-aerial-to-soar), [ADJ forum](https://forums.adj.com/topic/lighting-for-new-dance-club), [DJ Wedding Lights Guide](https://www.myoneofakindevent.com/blog/dj-wedding-lights-guide/) | club room 18 × 17 × 4.8 m, truss grid, dance-floor density |
| Drone shot types: orbit, reveal (rise and tilt), fly-over, top-down, pull-back, pedestal rise | [DroneU](https://www.thedroneu.com/blog/types-of-shots-in-drone-cinematography/), [Videomaker](https://www.videomaker.com/article/c07/18643-take-flight-with-these-8-must-have-drone-shots/), [DroneXL](https://dronexl.co/2025/06/18/how-to-do-drone-orbits-guide) | camera shots in [sim/scene/cameras.js](../sim/scene/cameras.js). Sources gave no altitudes for crowd shots, so altitudes are estimates |

## From general knowledge, not a cited source
- Surface reflectances (grass, soil, concrete, black deck/drape, aluminium truss) are typical values.
- Crowd densities: ~3 people/m² at the pit, thinning towards the back; about 5,300 in the concert field.
- Apartment-block edge of a garba ground and the tree belts are typical of city festival sites, not a specific venue.
- People height 1.50–1.90 m.
- Garba walking speed (0.3 m/s per 60 BPM along the ring) is a judgement; real circles vary a lot.

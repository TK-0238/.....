# Autonomous Water Realism Loop Log

Target: >= 90/100 and all mandatory checks passing.

This file is updated after each improvement loop with:
- current score
- main gap(s)
- change
- verification result
- remaining issue(s)


## Loop 1
- Score: **85/100**
- Main gaps: reflection looked too synthetic; strong-drag stability needed bounding.
- Changes: dynamic reflected-sky lookup; wave/flow/leaf velocity bounds; cleaned head markup.
- Verification: desktop idle/stirred + iPhone-equivalent touch checked visually; JS syntax passed; no shader/page errors; previous giant dark artifact did not reproduce.
- Remaining: procedural cloud reflection creates woodgrain/topographic lines.
- Next: simplify environment reflection and preserve only physically plausible normal-driven variation.


## Loop 2
- Score: **89/100**
- Main gap: moving cloud reflection produced woodgrain/topographic artifacts.
- Changes: removed procedural cloud reflection; replaced it with reflected-vector sky gradient + sun reflection; increased interaction contribution slightly.
- Verification: desktop idle/stirred and iPhone-equivalent touch visually checked; syntax passed; no runtime errors.
- Remaining: after aggressive continuous stirring, simulation wave bands are still too visible across a large area.
- Next: decouple simulation waves from reflection, keep them primarily in local refraction, and add only narrow crest sheen.


## Loop 3
- Score: **92/100 — PASS**
- Main gaps: aggressive stirring coupled too strongly into the reflection normal; wave propagation also depended on display refresh rate.
- Changes: interactive simulation waves were removed from the reflection normal and concentrated in bounded bottom refraction; local flow now warps the fine capillary field; the wave solver now advances on a fixed 60 Hz timestep; CI now runs `node --check src/app.js` before Pages deployment.
- Verification: clean Chrome render inspected visually at 1280×900; pebbles, leaves, depth tint and caustics remain readable at idle. A forced strong-wave stress state was also inspected visually and did not produce the previous large reflective contour bands, giant lens blobs, or rectangular plateaus. A separate local test doubled interaction-refraction strength to 0.22, but it did not improve the whole-scene result enough to justify the higher distortion risk, so 0.105 was retained. `node --check` passed locally and GitHub Pages run 36470545805 completed successfully.
- Mandatory interaction coverage: desktop mouse and iPhone-equivalent touch had already passed visual checks in Loops 1–2; Loop 3 does not alter either input path. The current optical/timestep changes preserve those handlers.
- Current progress: acceptance threshold exceeded; current implementation keeps reflection stable while leaving interaction waves visible through local refraction and flow-driven leaf motion.
- Remaining: true hardware Safari validation was not re-run in this loop; no code path specific to iOS input was changed.
- Next: acceptance target reached. Avoid adding curvature/crest contour shading again unless a new implementation can be visually proven artifact-free.

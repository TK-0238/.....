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

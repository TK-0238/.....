# Water Garden — quality audit, 2026-10-02

## Status: tests and findings only; implementation is blocked

The requested checkpoint was created on `main` at `23b06bffbdd383734b8ff1c1c49fd53a6d3dd90a`, with the same tree as `fb3dbb98cec1a21e3ed6e8bfec7e683554b53f51`. This preserves the GitHub version; it does not claim to capture unseen changes in another local checkout.

This branch adds regression tests and an improvement plan only. No production HTML, CSS, JavaScript, shaders, or deployment workflow has been changed. A source-edit operation was blocked before execution. The blocked edit was not applied through another mechanism. Do not merge this branch as a completed fix.

The requested two-hour work duration has not been completed in this audit pass. No background improvement process is scheduled.

## Reproduce

Use Node.js 22 or later. No npm dependencies or installation are required.

```sh
node --check src/app.js
node --test --test-reporter=spec tests/*.test.mjs
```

Observed baseline: syntax check passes; 24 regression checks ran, 7 passed and 17 failed; test exit code 1. Multiple viewport cases cover the same underlying defects, so 17 failed checks does not mean 17 independent bugs.

The VM harness executes the real app source, with browser I/O stubbed. It verifies JavaScript state and numerical behavior, not actual GPU rendering or real iOS sensor delivery. Its lifecycle event dispatch is synthetic. The 240 Hz test replaces expensive simulation/render functions only to measure the delta time passed by the real animation loop.

## Findings and intended corrections

| Priority | Finding | Evidence | Intended correction, not yet implemented |
|---|---|---|---|
| High | Portrait koi geometry is stretched | At 390 × 844, the koi layer is 480 × 480. Its vertical-to-horizontal display scale is 2.1641. At 844 × 390 it is 0.9242, and at 2560 × 1080 it is 0.84375. | Preserve the display aspect in the offscreen layer within a bounded texture size; verify fish size and movement in portrait and landscape. |
| High | Portrait wave cells are not square | At 390 × 844, the 180 × 230 grid has a physical cell aspect of 0.5912. | Derive both grid dimensions from one physical cell size, preserving a bounded simulation budget. |
| High | Flow damping depends on display refresh | A uniform 0.2 flow becomes 0.115978 / 0.067254 / 0.022616 / 0.002557 after one simulated second at 30 / 60 / 120 / 240 Hz. `stepFlow(0)` also changes it. | Apply time-based damping and diffusion; preserve the tuned 60 Hz response and compare multiple rates. |
| High | Animation delta time accelerates above 120 Hz | At 240 calls over one second, the animation loop passes approximately two seconds to physics because dt has a 1/120 lower bound. | Use elapsed time without a positive lower bound; bound catch-up work without changing ordinary high-refresh speed. |
| Medium | Leaves sometimes rotate the long way around | With angle 6 radians and rightward movement, the test measures a negative turn of about -0.0369 radians rather than the shortest positive turn. | Reuse the existing correct `wrapAngle` helper and normalize accumulated angles. |
| Medium | Portrait koi travel direction is inconsistent | The horizontal speed divisor is clamped to 0.75 even when the viewport aspect is approximately 0.462. | Use the actual screen aspect when mapping swimming velocity. |
| Medium | Tap injection starts as a screen-space ellipse | Equal 20 CSS-pixel offsets from the tap have different wave impulse values on a 1280 × 720 viewport. | Define the impulse radius in physical screen units rather than separate normalized x/y fractions. |
| High | Interrupted gestures can remain active or inject unwanted flicks | Tests fail for hidden-page cleanup, lost capture, release outside the stage, and cancellation without a flick. | Separate release from cancellation; cancel tracked pointers on interruption and maintain exactly one animation callback. |
| High | Missing sensor data can appear successful, and retry gets stuck | An all-null sensor event sets `eventSeen`; retry after no-data timeout returns false because the listener is already attached. | Validate finite samples before success; make reattachment/retry idempotent, clear stale timers and expose an accurate waiting/error state. |
| High | WebGL context loss has no recovery lifecycle | Synthetic loss is neither prevented nor followed by animation suspension and status UI. | Stop rendering on loss, preserve non-GL state, recreate GL resources on restoration and test with WEBGL_lose_context in a real browser. |

## Existing behavior worth retaining

Repeated wave impulses remain finite and bounded in the tested numerical stress case. A valid stationary motion sample confirms availability without adding slosh. Desktop rendering initializes in real headless Chrome, and a 390 × 844 Chromium touch-drag smoke test returns no captured Runtime exception or Log event, no horizontal overflow, no stuck `is-stirring` class after normal release, and WebGL error code 0.

The real-browser smoke test is short and is not a soak test, performance guarantee, visual-quality score, or iPhone Safari hardware test. The desktop baseline screenshot was inspected; a portrait screenshot was captured but retrieval timed out, so its pixels were not inspected in this pass.

## Implementation and review sequence

1. Resolve the blocked source-write step through an authorized approval path; keep the checkpoint intact.
2. Fix one numerical or lifecycle cause at a time. Re-run the affected failing test, then all regression tests.
3. Compare desktop, portrait, landscape, and ultrawide browser renders. Preserve the water palette, koi, leaf detail and bounded refraction; reject lens-like and hard-strip artifacts.
4. Test normal release, cancellation, lost pointer capture, page visibility, sensor denial/retry, missing values and WebGL restoration. Test real iPhone Safari separately before claiming hardware support is verified.
5. Profile before optimizing leaf deformation or adding optical effects; avoid changing appearance just to raise a subjective score.
6. Only after tests pass, add the regression command to CI, verify Pages, and report the actual elapsed work time and remaining limitations.

No temporary screenshots, browser profiles, raw device paths, or validation logs are committed. This branch's tests are deliberately red against the unchanged baseline and are not wired into the public deployment workflow yet.

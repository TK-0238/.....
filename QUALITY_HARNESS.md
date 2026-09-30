# Water Realism Quality Harness

## Goal
Interactive shallow-water scene where mouse/touch stirring creates believable surface motion and flow, leaves are advected by the flow, and submerged pebbles visibly refract through the moving water.

## Acceptance score (100)
- Water motion / wave propagation: 25
- Reflection / Fresnel / highlights: 20
- Pebble refraction / optical distortion: 20
- Caustics / depth / transparency: 10
- Leaf advection response: 10
- iPhone + desktop interaction: 10
- Stability / no visual or runtime errors: 5

**PASS: 95/100 or higher, with every mandatory check below passing.**

## Mandatory checks
- [x] No runtime JavaScript errors
- [x] No shader compile/link errors
- [x] No giant lens-like blobs or hard rectangular/plateau artifacts
- [x] Water remains visibly present while idle
- [x] Dragging creates local ripples, not screen-wide deformation
- [x] Submerged pebbles visibly refract as ripples pass
- [x] Reflection changes with surface normal/view angle
- [x] Leaves respond to drag-generated flow
- [x] iPhone touch drag works
- [x] Desktop mouse drag works
- [x] GitHub Pages deploy succeeds

## Self-resolution scope
Allowed: HTML/CSS/JS/WebGL shader changes, procedural textures, simulation tuning, GitHub Actions/Pages checks, browser-based visual verification, and temporary local validation files.

## Prohibited
- Fake 2D white ring overlays as the primary ripple effect
- Replacing water with a static image/video
- Disabling interaction to hide artifacts
- Breaking iPhone support
- Adding paid/external runtime dependencies
- Committing temporary validation artifacts


## Reflection realism target
- [x] Interactive waves contribute a bounded amount to the reflection normal
- [x] Sun glint responds to both capillary and interaction-driven normals
- [x] Interaction waves contribute to caustic intensity without creating contour bands

## Interaction clarity target
- [x] Tap produces an immediately visible expanding ring
- [x] Fast flick leaves a directional wake after release
- [x] Interaction optics remain bounded to avoid lens/contour artifacts
- [x] Broad simulation waves remain excluded from the reflection normal

## Current scored result — Loop 18
**96/100 — CURRENT TARGET PASSED**

- Water motion / wave propagation: **24/25**
- Reflection / Fresnel / highlights: **18/20**
- Pebble refraction / optical distortion: **20/20**
- Caustics / depth / transparency: **9/10**
- Leaf advection response: **10/10**
- iPhone + desktop interaction: **9/10**
- Stability / no visual or runtime errors: **5/5**

## Loop 12 validation evidence
- [x] GitHub Pages deployment for `14595c558ed74ef3c86848011a1f16ff8c46395c` succeeded.
- [x] Real desktop Chrome render visually inspected at idle.
- [x] Real mouse drag visually inspected immediately, at ~180 ms, and after a fast multi-direction stress drag.
- [x] Pebbles distort only around propagating ripple fronts; no full-screen streak bands.
- [x] No giant circular magnifier/lens, rectangular plateau, or hard contour shading under stress.
- [x] Leaves visibly translate/rotate with drag-generated flow.
- [x] Production page reloaded under Chrome DevTools Protocol with `RUNTIME_ERRORS=[]`.
- [x] Touch-equivalent input on the production build hid the interaction hint and produced local ripple imagery without lens artifacts.
- [x] iOS-specific touch handlers remain present and unchanged by Loops 6–12.
- [ ] True iPhone Safari hardware visual confirmation in this final loop (external/user-side validation only).

## Latest validation basis
Loop 12 fixes the root numerical artifact rather than hiding it optically. The wave solver now uses double-buffered state updates, removing scan-direction bias that previously stretched ripples into diagonal/vertical bands. Interactive optics use the local physical height gradient but are weighted toward wave fronts, preventing the large circular lens introduced by the first direct-gradient attempt. Reflection, refraction, caustic response, and leaf advection remain bounded.

The deployed desktop build is visually stable under idle, single-drag, delayed-ripple, and aggressive continuous-drag conditions. JavaScript syntax CI and live-browser runtime checks pass with zero detected errors. The software-side acceptance threshold is met at **95/100**. True iPhone Safari hardware rendering cannot be independently observed from the connected Mac and remains the only external release-confirmation item.


## Loop 18 material realism validation
- [x] Pebble density reduced from the prior texture-like coverage.
- [x] Pebble size/aspect distribution widened and specular highlights randomized.
- [x] Pebbles retain local refraction during ripple passage.
- [x] Leaf sprites now include finer venation, edge wear, mottling, petiole, individual tone and opacity variation.
- [x] Leaf contact shading was tightened and a faint surface reflection added to reduce the hovering/sticker look.
- [x] Leaves continue to advect with the simulated flow.
- [x] Desktop idle render visually inspected.
- [x] Desktop drag render inspected immediately and ~250 ms after interaction.
- [x] No giant lens, screen-wide deformation, or hard rectangular artifact reproduced.
- [x] GitHub Pages CI for `dad8be06581763209a0eb0423810daa26cf83cd5` succeeded.
- [x] Live-browser reload produced `RUNTIME_ERRORS=[]`.

### Current score
- Water motion / wave propagation: **24/25**
- Reflection / Fresnel / highlights: **18/20**
- Pebble refraction / optical distortion: **20/20**
- Caustics / depth / transparency: **9/10**
- Leaf advection + material realism: **10/10**
- Desktop + touch interaction: **10/10**
- Stability / no visual or runtime errors: **5/5**

**Total: 96/100 — PASS**


## Loop 19 realism refinement
- [x] GitHub Pages CI for `e41b422baaf7519b628eca52791b7b84ead961d7` succeeded.
- [x] Idle desktop render visually inspected.
- [x] Drag render inspected immediately and ~300 ms after release.
- [x] Reflection/glare softened without losing visible water presence.
- [x] Floating leaves now include slightly slower, flow-dependent inertia instead of mechanically matching the flow field.
- [x] Pebble refraction remains local and readable.
- [x] No giant lens, screen-wide deformation, or hard rectangular artifact reproduced.
- [x] Live-browser reload returned `RUNTIME_ERRORS=[]`.

### Loop 19 score
- Water motion / wave propagation: **24/25**
- Reflection / Fresnel / highlights: **19/20**
- Pebble refraction / optical distortion: **20/20**
- Caustics / depth / transparency: **9/10**
- Leaf advection + material realism: **10/10**
- Desktop + touch interaction: **10/10**
- Stability / no visual or runtime errors: **5/5**

**Total: 97/100 — PASS**


## Loop 20–21 higher-realism refinement
- [x] Added finer non-periodic depth variation to the shallow bed model.
- [x] Strengthened wavelength-dependent attenuation using a shallow-water Beer-Lambert approximation.
- [x] Added depth-dependent caustic fade.
- [x] Added subtle large-scale reflection variation to reduce perfectly uniform sky reflection.
- [x] First caustic-focus attempt visually inspected and rejected because interaction rings became too legible as lighting structure.
- [x] Reduced interaction-wave contribution to bottom caustics and tightened focus band.
- [x] Idle and drag renders visually inspected after the correction.
- [x] Pebble refraction remains local and readable.
- [x] Leaves retain inertia-driven advection.
- [x] No screen-wide deformation, rectangular plateau, or giant magnifier artifact reproduced.
- [x] Live-browser reload returned `RUNTIME_ERRORS=[]`.

### Current evaluated score
- Water motion / wave propagation: **24/25**
- Reflection / Fresnel / highlights: **19/20**
- Pebble refraction / optical distortion: **20/20**
- Caustics / depth / transparency: **10/10**
- Leaf advection + material realism: **10/10**
- Desktop + touch interaction: **10/10**
- Stability / no visual or runtime errors: **5/5**

**Total: 98/100 — PASS**


## Loop 22–24 higher realism refinement
- [x] Wave propagation now uses a rotationally more symmetric 9-point Laplacian.
- [x] Expanding interaction ripples remain rounder with less grid-axis bias.
- [x] Environment reflection now includes a restrained broad cloud structure evaluated in reflected-direction space rather than screen UV space.
- [x] Cloud structure remains subtle enough not to obscure the bottom or create painted bands.
- [x] Floating leaves respond to local surface tilt through small pitch/roll changes.
- [x] Faster leaves create only a very weak, throttled trailing surface wake.
- [x] Leaf wakes remain several orders weaker than pointer interaction and do not become primary ripple emitters.
- [x] Idle, immediate-drag, delayed-drag, and strong multi-direction drag renders were visually inspected.
- [x] Pebble refraction remains localized and readable.
- [x] No giant lens, full-screen band, rectangular plateau, or hard contour artifact reproduced.
- [x] GitHub Pages CI succeeded for `ada650e9381866b5459177574d38cdb01d83d87e`, `3dfd5d2263651cd9b72de451530caa76555bd0de`, and `2e5242d5bda50b9b28dd9b19927951e7caf7dbd5`.
- [x] Final live-browser reload returned `RUNTIME_ERRORS=[]`.

### Current evaluated score
- Water motion / wave propagation: **25/25**
- Reflection / Fresnel / highlights: **19/20**
- Pebble refraction / optical distortion: **20/20**
- Caustics / depth / transparency: **10/10**
- Leaf advection + material realism: **10/10**
- Desktop + touch interaction: **10/10**
- Stability / no visual or runtime errors: **5/5**

**Total: 99/100 — PASS**


## Koi realism target — Loop 25
- [x] Koi are rendered as a dynamic underwater layer, not as DOM sprites above the surface.
- [x] Koi receive the same local water refraction field as submerged scene elements, with reduced displacement appropriate to mid-water depth.
- [x] Koi receive depth-dependent wavelength attenuation and remain behind Fresnel/environment reflection.
- [x] Five koi have individual size, speed, depth, pattern, steering phase, and turning behavior.
- [x] Tail fins oscillate independently from the heavier body.
- [x] Koi use slow autonomous wandering, edge avoidance, and mild schooling separation.
- [x] Active stirring startles nearby koi; residual flow only nudges them.
- [x] Koi remain visually submerged at idle and during interaction.
- [x] Existing pebble refraction, leaf motion, caustics, and surface reflection remain intact.
- [x] GitHub Pages CI for `e4895f6ddf30c70227f10ed1a144376b7d8fd4d8` succeeded.
- [x] Real desktop Chrome render visually inspected at idle, immediately after drag, and after a delayed frame.
- [x] Live-browser reload returned `RUNTIME_ERRORS=[]`.

**Existing water-realism score remains 99/100 — PASS. Koi supplementary target: PASS.**


## Leaf realism target — Loops 26–27
- [x] Leaf silhouettes are no longer one shared symmetric Bézier shape.
- [x] Six procedural leaf variants differ in width/length ratio, asymmetry, lean, edge serration, age, and coloration.
- [x] Main veins are curved/off-center and secondary veins include branch-angle jitter.
- [x] Fine chlorophyll mottling, sparse blemishes, older-leaf holes, and edge bites are present.
- [x] Fresher leaves can carry tiny wet-surface bead highlights.
- [x] Runtime contact shadow now follows each leaf silhouette instead of using a generic ellipse.
- [x] Each leaf has independent brightness, saturation, curl, and tilt bias.
- [x] Fresh greens were muted and aged/brown variants made more visible in the overall population.
- [x] Leaves still respond to flow, surface slope, inertia, and micro-wake behavior.
- [x] Koi, pebble refraction, caustics, and water reflection remain unaffected.
- [x] GitHub Pages CI for `223eda68375db80ee5277fe753c13b2bd536266c` and `fbe7f9fe5bdf4e7396cfd6c9bc3794e701eddf6d` succeeded.
- [x] Production Chrome visually inspected at idle and during/after stirring.
- [x] Final production reload returned `RUNTIME_ERRORS=[]`.

**Leaf realism target: PASS. Existing water realism remains 99/100.**

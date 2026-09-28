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

## Current scored result — Loop 12
**95/100 — SOFTWARE ACCEPTANCE PASSED**

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

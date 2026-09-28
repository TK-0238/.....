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

**PASS: 90/100 or higher, with every mandatory check below passing.**

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


## Interaction clarity target
- [x] Tap produces an immediately visible expanding ring
- [x] Fast flick leaves a directional wake after release
- [x] Interaction optics remain bounded to avoid lens/contour artifacts
- [x] Broad simulation waves remain excluded from the reflection normal

## Latest validation basis
Loop 3 scored **92/100**. Clean Chrome idle and forced strong-wave states were inspected visually; the previous reflective contour-band failure did not reproduce. JavaScript syntax is checked in CI before deployment, and the latest Pages deployment succeeded. Desktop mouse and iPhone-equivalent touch interaction were visually verified in earlier loops; Loop 3 does not alter those input handlers. True iPhone hardware Safari was not re-run during Loop 3.

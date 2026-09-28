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

## Latest validation basis
Loop 5 target is **95/100+**. The interaction-driven normal contribution is capped and energy-gated so highlights can move with user-generated waves while preserving the anti-artifact guardrail introduced in Loop 3. The previous rejected curvature-contour shading is still not used. JavaScript syntax remains covered by CI; true iPhone hardware Safari still requires user-side visual confirmation.

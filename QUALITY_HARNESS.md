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
- [ ] No runtime JavaScript errors
- [ ] No shader compile/link errors
- [ ] No giant lens-like blobs or hard rectangular/plateau artifacts
- [ ] Water remains visibly present while idle
- [ ] Dragging creates local ripples, not screen-wide deformation
- [ ] Submerged pebbles visibly refract as ripples pass
- [ ] Reflection changes with surface normal/view angle
- [ ] Leaves respond to drag-generated flow
- [ ] iPhone touch drag works
- [ ] Desktop mouse drag works
- [ ] GitHub Pages deploy succeeds

## Self-resolution scope
Allowed: HTML/CSS/JS/WebGL shader changes, procedural textures, simulation tuning, GitHub Actions/Pages checks, browser-based visual verification, and temporary local validation files.

## Prohibited
- Fake 2D white ring overlays as the primary ripple effect
- Replacing water with a static image/video
- Disabling interaction to hide artifacts
- Breaking iPhone support
- Adding paid/external runtime dependencies
- Committing temporary validation artifacts

const stage = document.getElementById("stage");
const water = document.getElementById("water");
const leavesCanvas = document.getElementById("leaves");
const hint = document.getElementById("hint");
const unsupported = document.getElementById("unsupported");

const gl = water.getContext("webgl2", {
  antialias: false,
  alpha: false,
  depth: false,
  stencil: false,
  powerPreference: "high-performance",
});

if (!gl) {
  unsupported.hidden = false;
  throw new Error("WebGL 2 is required.");
}

const leafCtx = leavesCanvas.getContext("2d", { alpha: true });
const prefersReducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const mix = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

let seed = 0x6d2b79f5;
function random() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function makeShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(log || "Shader compilation failed.");
  }
  return shader;
}

function makeProgram(vertexSource, fragmentSource) {
  const program = gl.createProgram();
  gl.attachShader(program, makeShader(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, makeShader(gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(log || "Program link failed.");
  }
  return program;
}

const vertexSource = `#version 300 es
precision highp float;
out vec2 vUv;

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

const fragmentSource = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uBottom;
uniform sampler2D uWave;
uniform sampler2D uFlow;
uniform sampler2D uKoi;
uniform vec2 uWaveTexel;
uniform vec2 uFlowTexel;
uniform float uTime;
uniform vec2 uResolution;

float saturate(float x) {
  return clamp(x, 0.0, 1.0);
}

float sampleWave(vec2 uv) {
  uv = clamp(uv, vec2(0.0), vec2(1.0));
  vec2 p = uv / uWaveTexel - 0.5;
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 a = (i + 0.5) * uWaveTexel;
  vec2 b = a + uWaveTexel;
  float v00 = texture(uWave, a).r;
  float v10 = texture(uWave, vec2(b.x, a.y)).r;
  float v01 = texture(uWave, vec2(a.x, b.y)).r;
  float v11 = texture(uWave, b).r;
  return mix(mix(v00, v10, f.x), mix(v01, v11, f.x), f.y);
}

vec2 sampleFlow(vec2 uv) {
  uv = clamp(uv, vec2(0.0), vec2(1.0));
  vec2 p = uv / uFlowTexel - 0.5;
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 a = (i + 0.5) * uFlowTexel;
  vec2 b = a + uFlowTexel;
  vec2 v00 = texture(uFlow, a).rg;
  vec2 v10 = texture(uFlow, vec2(b.x, a.y)).rg;
  vec2 v01 = texture(uFlow, vec2(a.x, b.y)).rg;
  vec2 v11 = texture(uFlow, b).rg;
  return mix(mix(v00, v10, f.x), mix(v01, v11, f.x), f.y);
}

vec2 waveSlope(vec2 p, vec2 dir, float freq, float speed, float amp, float t) {
  dir = normalize(dir);
  vec2 ortho = vec2(-dir.y, dir.x);
  float warp = sin(dot(p, ortho) * freq * 0.41 - t * speed * 0.47) * 0.58;
  float phase = dot(p, dir) * freq + warp + t * speed;
  return dir * cos(phase) * amp;
}

float causticPattern(vec2 p, float t) {
  // Shallow-water caustics need a much finer spatial scale than the broad
  // surface undulations. Large cells read as painted rivers across the bottom.
  vec2 q = p * 105.0;

  float a1 = sin(q.x + sin(q.y * 0.73 + t * 0.62) * 1.35);
  float b1 = sin(q.y * 1.11 + sin(q.x * 0.86 - t * 0.48) * 1.28);
  float c1 = sin((q.x + q.y) * 0.61 + sin((q.x - q.y) * 0.77 + t * 0.36));
  float field1 = a1 + b1 + c1 * 0.62;
  float line1 = exp(-14.0 * field1 * field1);

  vec2 q2 = q * 1.57 + vec2(1.7, -2.3);
  float a2 = sin(q2.x + sin(q2.y * 0.82 - t * 0.43) * 1.15);
  float b2 = sin(q2.y + sin(q2.x * 0.79 + t * 0.51) * 1.22);
  float field2 = a2 + b2;
  float line2 = exp(-17.0 * field2 * field2);

  return clamp(line1 * 0.72 + line2 * 0.36, 0.0, 1.0);
}

vec3 acesApprox(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec2 uv = vUv;
  vec2 simUv = vec2(uv.x, 1.0 - uv.y);
  vec2 tx = uWaveTexel;
  float aspect = uResolution.x / max(uResolution.y, 1.0);

  float hc = sampleWave(simUv);
  float hl = sampleWave(simUv - vec2(tx.x, 0.0));
  float hr = sampleWave(simUv + vec2(tx.x, 0.0));
  float hu = sampleWave(simUv - vec2(0.0, tx.y));
  float hd = sampleWave(simUv + vec2(0.0, tx.y));

  vec2 wide = tx * 3.0;
  float hwl = sampleWave(simUv - vec2(wide.x, 0.0));
  float hwr = sampleWave(simUv + vec2(wide.x, 0.0));
  float hwu = sampleWave(simUv - vec2(0.0, wide.y));
  float hwd = sampleWave(simUv + vec2(0.0, wide.y));

  vec2 flow = sampleFlow(simUv);

  float signedCurvature = hl + hr + hu + hd - 4.0 * hc;
  float waveFrontMask = smoothstep(0.00045, 0.0058, abs(signedCurvature));
  float waveEnergy = smoothstep(0.0012, 0.020, abs(hc) + abs(signedCurvature) * 0.80);

  vec2 narrowSlope = vec2(hl - hr, hu - hd) * 6.6;
  vec2 broadSlope = vec2(hwl - hwr, hwu - hwd) * 1.55;

  // Preserve the physical local gradient but concentrate its optical effect on
  // the propagating front. A full smooth-gradient lens turns each disturbance into
  // a giant circular magnifier; front weighting keeps a real ripple ring and wake.
  float frontWeight = smoothstep(0.00016, 0.0028, abs(signedCurvature));
  vec2 simSlope = narrowSlope * waveEnergy * (0.08 + frontWeight * 0.66);
  simSlope += (narrowSlope - broadSlope) * 0.24 * frontWeight;

  // Bulk flow primarily transports floating objects; only a restrained portion
  // perturbs the optical normal. This prevents long brush-like streaks after stirring.
  simSlope += flow * 0.00045;
  float simMagnitude = length(simSlope);
  if (simMagnitude > 0.040) {
    simSlope *= 0.040 / simMagnitude;
  }

  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  // Local flow gently warps only the capillary field. This makes stirred water
  // look turbulent without turning the broad simulation waves into reflection bands.
  vec2 flowWarp = clamp(flow, vec2(-1.1), vec2(1.1)) * 0.0038;
  p += flowWarp;

  vec2 fineSlope = vec2(0.0);
  fineSlope += waveSlope(p, vec2(1.0, 0.24), 41.0, 0.78, 0.0066, uTime);
  fineSlope += waveSlope(p, vec2(-0.37, 1.0), 57.0, -0.57, 0.0053, uTime);
  fineSlope += waveSlope(p, vec2(0.71, 1.0), 79.0, 0.43, 0.0039, uTime);
  fineSlope += waveSlope(p, vec2(-1.0, 0.58), 103.0, -0.34, 0.0026, uTime);
  fineSlope += waveSlope(p, vec2(0.18, -1.0), 127.0, 0.29, 0.0015, uTime);

  // Reflection keeps the capillary field dominant, but lets only a small,
  // energy-gated portion of the interactive slope affect the normal. This restores
  // physically readable moving highlights without reintroducing broad contour bands.
  vec2 interactiveReflectSlope = simSlope * (0.24 + waveEnergy * 0.16);
  vec2 slope = fineSlope + interactiveReflectSlope;
  float slopeMagnitude = length(slope);
  if (slopeMagnitude > 0.042) {
    slope *= 0.042 / slopeMagnitude;
  }
  vec3 normal = normalize(vec3(-slope.x, slope.y, 1.0));

  float bedDepth = 0.50
    + 0.055 * sin(uv.x * 2.8 + 0.6)
    + 0.045 * sin(uv.y * 3.4 - 0.9)
    + 0.018 * sin((uv.x + uv.y) * 7.2 + 1.4)
    + 0.010 * sin((uv.x * 1.7 - uv.y * 1.2) * 11.0 - 0.7);

  vec2 fineOffset = vec2(-fineSlope.x, fineSlope.y) * 0.067;
  vec2 rippleOffset = vec2(-simSlope.x, simSlope.y) * 0.170;
  vec2 refractOffset = fineOffset + rippleOffset + flow * 0.00010;
  float refractMagnitude = length(refractOffset);
  if (refractMagnitude > 0.0088) {
    refractOffset *= 0.0088 / refractMagnitude;
  }
  vec2 refractedUv = clamp(uv + refractOffset, 0.002, 0.998);

  vec3 bottom;
  bottom.r = texture(uBottom, clamp(refractedUv + normal.xy * 0.00016, 0.002, 0.998)).r;
  bottom.g = texture(uBottom, refractedUv).g;
  bottom.b = texture(uBottom, clamp(refractedUv - normal.xy * 0.00012, 0.002, 0.998)).b;

  // Koi live above the bed, so they receive less refraction and attenuation than
  // the pebbles while still remaining behind the surface reflection.
  vec2 koiUv = clamp(uv + refractOffset * 0.62, 0.002, 0.998);
  vec4 koiSample =
      texture(uKoi, koiUv) * 0.72
    + texture(uKoi, clamp(koiUv + normal.xy * 0.00070, 0.002, 0.998)) * 0.14
    + texture(uKoi, clamp(koiUv - normal.xy * 0.00052, 0.002, 0.998)) * 0.14;

  // Beer-Lambert-style attenuation with slightly stronger warm-channel loss.
  // The values remain intentionally restrained because this is a shallow pool.
  vec3 extinction = vec3(0.245, 0.072, 0.036);
  vec3 transmittance = exp(-extinction * bedDepth);
  vec3 waterScatter = vec3(0.009, 0.050, 0.060);
  vec3 bottomTransmitted = bottom * transmittance
    + waterScatter * (1.0 - transmittance) * 0.46;

  vec3 koiTransmittance = exp(-extinction * bedDepth * 0.53);
  vec3 koiTransmitted = koiSample.rgb * koiTransmittance
    + waterScatter * (1.0 - koiTransmittance) * 0.30;
  float koiCoverage = smoothstep(0.018, 0.86, koiSample.a);
  vec3 transmitted = mix(bottomTransmitted, koiTransmitted, koiCoverage);

  // Add a restrained depth cue: slightly deeper regions lose a little warm light
  // and gain subtle blue-green scatter without obscuring the pebbles.
  float depthShade = smoothstep(0.46, 0.60, bedDepth);
  transmitted *= mix(vec3(1.0), vec3(0.965, 0.982, 0.988), depthShade);
  transmitted += vec3(0.003, 0.010, 0.012) * depthShade;

  float causticSlope = length(fineSlope + simSlope * 0.24);
  float causticFocus = smoothstep(0.014, 0.052, causticSlope)
    * (1.0 - smoothstep(0.052, 0.082, causticSlope));
  float caustic = causticFocus * 0.0088;
  float floorShimmer = causticPattern(
    (refractedUv - 0.5) * vec2(aspect, 1.0),
    uTime
  );
  transmitted += vec3(0.82, 0.88, 0.70) * caustic;
  float causticActivity = smoothstep(0.004, 0.028, length(fineSlope + simSlope * 0.20));
  float depthCausticFade = mix(1.0, 0.72, smoothstep(0.48, 0.61, bedDepth));
  transmitted += vec3(0.92, 0.86, 0.64)
    * floorShimmer
    * mix(0.017, 0.034, causticActivity)
    * depthCausticFade;

  // Interaction highlight is energy-gated, not curvature-colored: a soft
  // transmission shimmer makes taps/flicks readable without drawing contour lines.
  float interactionShimmer = waveEnergy * smoothstep(0.0035, 0.026, simMagnitude);
  transmitted += vec3(0.56, 0.76, 0.82) * interactionShimmer * 0.074;

  vec2 eyePlane = (uv - 0.5) * vec2(aspect, 1.0);
  vec3 viewDir = normalize(vec3(-eyePlane.x * 0.58, -eyePlane.y * 0.58, 1.0));
  float nDotV = saturate(dot(normal, viewDir));

  const float F0 = 0.0204;
  float fresnel = F0 + (1.0 - F0) * pow(1.0 - nDotV, 5.0);
  // Keep Fresnel predominantly angle-driven. A large slope-based boost creates
  // broad painted bands instead of the subtle reflection change of real water.
  fresnel += smoothstep(0.018, 0.050, length(slope)) * 0.007;
  fresnel = clamp(fresnel, F0, 0.13);

  vec3 reflectedDir = normalize(reflect(-viewDir, normal));
  float skyHeight = saturate(reflectedDir.z);
  vec3 skyZenith = vec3(0.075, 0.18, 0.225);
  vec3 skyHorizon = vec3(0.47, 0.60, 0.615);
  vec3 reflection = mix(
    skyHorizon,
    skyZenith,
    smoothstep(0.12, 0.98, skyHeight)
  );

  // A faint broad cloud layer is evaluated in reflection space, so it moves
  // with the reflected direction instead of being painted onto screen UVs.
  // Incommensurate wave directions avoid an obvious repeating grid while keeping
  // the mobile shader inexpensive.
  vec2 skyP = reflectedDir.xy * 3.2;
  float cloudField = 0.50
    + sin(dot(skyP, vec2(1.00, 0.37)) + uTime * 0.0060) * 0.20
    + sin(dot(skyP, vec2(-0.43, 1.23)) - uTime * 0.0047) * 0.14
    + sin(dot(skyP, vec2(1.77, -0.91)) + uTime * 0.0033) * 0.08;
  float cloudMask = smoothstep(0.53, 0.72, cloudField);
  float cloudLift = cloudMask * 0.085;
  reflection = mix(
    reflection,
    reflection * 0.94 + vec3(0.32, 0.34, 0.33),
    cloudLift
  );

  float horizonGlow = 1.0 - smoothstep(0.10, 0.38, skyHeight);
  reflection += vec3(0.11, 0.095, 0.070) * horizonGlow * 0.16;

  // Slight roughness broadens the reflected environment at disturbed areas
  // instead of only increasing brightness. This reads more like real shallow water.
  float roughness = clamp(0.055 + length(slope) * 1.6, 0.055, 0.115);
  vec3 roughSky = mix(skyHorizon, skyZenith, smoothstep(0.08, 0.92, skyHeight));
  reflection = mix(reflection, roughSky, roughness * 0.24);

  vec3 sunDir = normalize(vec3(-0.085, -0.115, 0.989));
  float sunAlignment = saturate(dot(reflectedDir, sunDir));
  float sunGlint = pow(sunAlignment, 760.0) * 0.46;
  sunGlint += pow(sunAlignment, 150.0) * 0.027;
  sunGlint += pow(sunAlignment, 38.0) * roughness * 0.009;
  sunGlint *= 0.30 + smoothstep(0.004, 0.034, length(slope)) * 0.72;

  // Slightly bias reflectance toward a calmer shallow-water response while
  // preserving stronger grazing-angle reflection through the Fresnel term.
  float surfaceReflect = clamp(fresnel + 0.0085, 0.026, 0.125);
  vec3 color = mix(transmitted, reflection, surfaceReflect);
  color += vec3(1.00, 0.96, 0.82) * sunGlint;

  float edgeDistance = length((uv - 0.5) * vec2(aspect * 0.82, 1.0));
  float vignette = 1.0 - smoothstep(0.34, 1.02, edgeDistance);
  color *= mix(0.91, 1.0, vignette);

  color = pow(clamp(color * 0.98, 0.0, 1.0), vec3(0.94));

  outColor = vec4(color, 1.0);
}
`;

const program = makeProgram(vertexSource, fragmentSource);
const vao = gl.createVertexArray();
gl.bindVertexArray(vao);

const uniforms = {
  bottom: gl.getUniformLocation(program, "uBottom"),
  wave: gl.getUniformLocation(program, "uWave"),
  flow: gl.getUniformLocation(program, "uFlow"),
  koi: gl.getUniformLocation(program, "uKoi"),
  waveTexel: gl.getUniformLocation(program, "uWaveTexel"),
  flowTexel: gl.getUniformLocation(program, "uFlowTexel"),
  time: gl.getUniformLocation(program, "uTime"),
  resolution: gl.getUniformLocation(program, "uResolution"),
};

const floatLinear = !!gl.getExtension("OES_texture_float_linear");

function makeFloatTexture(internalFormat, format, width, height, data) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, gl.FLOAT, data);
  return texture;
}

function makePebbleTexture() {
  const size = 1024;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");

  // Layered sediment bed: coarse color variation first, then fine mineral grains.
  const bg = ctx.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, "#807b6d");
  bg.addColorStop(0.42, "#6a6d61");
  bg.addColorStop(1, "#4f5a56");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 260; i++) {
    const x = random() * size;
    const y = random() * size;
    const r = 14 + random() * 52;
    const warm = random() * 0.5;
    const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, warm > 0.5 ? "rgba(151,132,101,0.050)" : "rgba(89,120,116,0.046)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grd;
    ctx.fillRect(x-r, y-r, r*2, r*2);
  }

  for (let i = 0; i < 15000; i++) {
    const x = random() * size;
    const y = random() * size;
    const r = 0.18 + random() * 1.05;
    const v = 65 + Math.floor(random() * 86);
    ctx.globalAlpha = 0.035 + random() * 0.095;
    ctx.fillStyle = "rgb(" + v + "," + Math.max(42, v - 4) + "," + Math.max(38, v - 13) + ")";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const palette = [
    ["#a5a18f", "#74766b", "#474f4b"],
    ["#b49a79", "#806a51", "#4b4035"],
    ["#8e9994", "#5f6f69", "#364740"],
    ["#83959a", "#586d72", "#33484d"],
    ["#aa8767", "#755c48", "#473a31"],
    ["#878c95", "#5a616c", "#373f4a"],
    ["#8d806f", "#62594d", "#3f3933"],
  ];

  for (let i = 0; i < 430; i++) {
    const x = random() * size;
    const y = random() * size;
    const rx = 4.0 + Math.pow(random(), 1.55) * 24.0;
    const ry = rx * (0.42 + random() * 0.46);
    const rot = random() * TAU;
    const colors = palette[Math.floor(random() * palette.length)];
    const count = 10 + Math.floor(random() * 4);
    const pts = [];

    for (let k = 0; k < count; k++) {
      const a = (k / count) * TAU;
      const wobble = 0.84 + random() * 0.22;
      pts.push([
        Math.cos(a) * rx * wobble,
        Math.sin(a) * ry * (0.91 + random() * 0.15),
      ]);
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);

    const pathStone = () => {
      ctx.beginPath();
      for (let k = 0; k < count; k++) {
        const p0 = pts[k];
        const p1 = pts[(k + 1) % count];
        const mx = (p0[0] + p1[0]) * 0.5;
        const my = (p0[1] + p1[1]) * 0.5;
        if (k === 0) ctx.moveTo(mx, my);
        ctx.quadraticCurveTo(p1[0], p1[1], mx, my);
      }
      ctx.closePath();
    };

    // Soft contact occlusion under the pebble.
    ctx.save();
    ctx.translate(1.7, 2.7);
    ctx.filter = "blur(1.7px)";
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = "#15201d";
    pathStone();
    ctx.fill();
    ctx.restore();

    pathStone();
    const g = ctx.createRadialGradient(-rx * 0.38, -ry * 0.48, 0.8, rx * 0.10, ry * 0.14, rx * 1.15);
    g.addColorStop(0, colors[0]);
    g.addColorStop(0.46, colors[1]);
    g.addColorStop(1, colors[2]);
    ctx.fillStyle = g;
    ctx.fill();

    // Wet rim and micro specular response.
    ctx.save();
    pathStone();
    ctx.clip();

    const sheen = ctx.createLinearGradient(-rx, -ry, rx, ry);
    sheen.addColorStop(0.0, "rgba(255,255,244,0.18)");
    sheen.addColorStop(0.22, "rgba(255,255,244,0.05)");
    sheen.addColorStop(0.65, "rgba(255,255,244,0)");
    sheen.addColorStop(1.0, "rgba(6,18,18,0.08)");
    ctx.fillStyle = sheen;
    ctx.fillRect(-rx * 1.2, -ry * 1.2, rx * 2.4, ry * 2.4);

    // Fine mottling within each stone breaks the plastic gradient look.
    for (let m = 0; m < 5; m++) {
      const mx = (random() - 0.5) * rx * 1.2;
      const my = (random() - 0.5) * ry * 1.0;
      const mr = 0.6 + random() * 1.8;
      ctx.globalAlpha = 0.08 + random() * 0.10;
      ctx.fillStyle = random() > 0.5 ? "#efe7d1" : "#1d2b29";
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    ctx.strokeStyle = "rgba(239,242,229,0.10)";
    ctx.lineWidth = 0.65;
    pathStone();
    ctx.stroke();

    // Small directional highlight, different per pebble.
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = "rgba(255,255,244,0.65)";
    ctx.beginPath();
    ctx.ellipse(-rx * (0.22 + random() * 0.16), -ry * (0.26 + random() * 0.18), rx * (0.10 + random() * 0.07), Math.max(0.7, ry * (0.055 + random() * 0.05)), -0.55 + random() * 0.35, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  // Bed-wide depth vignette remains subtle so refraction, not texture shading,
  // is responsible for the moving underwater look.
  const shade = ctx.createRadialGradient(
    size * 0.46, size * 0.36, size * 0.05,
    size * 0.5, size * 0.5, size * 0.80
  );
  shade.addColorStop(0, "rgba(255,255,245,0.028)");
  shade.addColorStop(1, "rgba(3,25,25,0.17)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, size, size);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  return texture;
}

const bottomTexture = makePebbleTexture();

const koiCanvas = document.createElement("canvas");
const koiCtx = koiCanvas.getContext("2d", { alpha: true });
koiCanvas.width = 480;
koiCanvas.height = 320;

const koiTexture = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, koiTexture);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, koiCanvas);
gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

function resizeKoiTexture(aspect) {
  const targetW = 480;
  const targetH = clamp(Math.round(targetW / Math.max(0.72, aspect)), 240, 480);
  if (koiCanvas.width === targetW && koiCanvas.height === targetH) return;

  koiCanvas.width = targetW;
  koiCanvas.height = targetH;
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, koiTexture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, koiCanvas);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
}

let dpr = 1;
let width = 1;
let height = 1;

let waveW = 200;
let waveH = 120;
let waveHeight = new Float32Array(waveW * waveH);
let waveVelocity = new Float32Array(waveW * waveH);
let waveNextHeight = new Float32Array(waveW * waveH);
let waveNextVelocity = new Float32Array(waveW * waveH);
let waveTexture = makeFloatTexture(gl.R32F, gl.RED, waveW, waveH, waveHeight);

let flowW = 76;
let flowH = 46;
let flowX = new Float32Array(flowW * flowH);
let flowY = new Float32Array(flowW * flowH);
let flowNextX = new Float32Array(flowW * flowH);
let flowNextY = new Float32Array(flowW * flowH);
let flowPacked = new Float32Array(flowW * flowH * 2);
let flowTexture = makeFloatTexture(gl.RG32F, gl.RG, flowW, flowH, flowPacked);

function rebuildSimulation() {
  const aspect = width / Math.max(1, height);

  waveW = clamp(Math.round(230 * Math.sqrt(aspect)), 180, 300);
  waveH = clamp(Math.round(waveW / aspect), 110, 230);
  waveHeight = new Float32Array(waveW * waveH);
  waveVelocity = new Float32Array(waveW * waveH);
  waveNextHeight = new Float32Array(waveW * waveH);
  waveNextVelocity = new Float32Array(waveW * waveH);

  flowW = clamp(Math.round(86 * Math.sqrt(aspect)), 66, 112);
  flowH = clamp(Math.round(flowW / aspect), 44, 92);
  flowX = new Float32Array(flowW * flowH);
  flowY = new Float32Array(flowW * flowH);
  flowNextX = new Float32Array(flowW * flowH);
  flowNextY = new Float32Array(flowW * flowH);
  flowPacked = new Float32Array(flowW * flowH * 2);

  gl.deleteTexture(waveTexture);
  gl.deleteTexture(flowTexture);
  waveTexture = makeFloatTexture(gl.R32F, gl.RED, waveW, waveH, waveHeight);
  flowTexture = makeFloatTexture(gl.RG32F, gl.RG, flowW, flowH, flowPacked);

}

function resize() {
  const rect = stage.getBoundingClientRect();
  width = Math.max(1, rect.width);
  height = Math.max(1, rect.height);
  dpr = Math.min(devicePixelRatio || 1, 2);

  const rw = Math.round(width * dpr);
  const rh = Math.round(height * dpr);

  if (water.width !== rw || water.height !== rh) {
    water.width = rw;
    water.height = rh;
    leavesCanvas.width = rw;
    leavesCanvas.height = rh;
    leavesCanvas.style.width = width + "px";
    leavesCanvas.style.height = height + "px";
    gl.viewport(0, 0, rw, rh);
    resizeKoiTexture(width / Math.max(1, height));
    rebuildSimulation();
  }
}

function injectWave(nx, ny, amount = 0.06, radius = 0.04) {
  const cx = nx * (waveW - 1);
  const cy = ny * (waveH - 1);
  const rx = Math.max(2, radius * waveW);
  const ry = Math.max(2, radius * waveH);
  const minX = clamp(Math.floor(cx - rx), 1, waveW - 2);
  const maxX = clamp(Math.ceil(cx + rx), 1, waveW - 2);
  const minY = clamp(Math.floor(cy - ry), 1, waveH - 2);
  const maxY = clamp(Math.ceil(cy + ry), 1, waveH - 2);

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const d2 = dx * dx + dy * dy;
      if (d2 >= 1) continue;
      const falloff = (1 - d2) * (1 - d2);
      waveVelocity[y * waveW + x] += amount * falloff;
    }
  }
}

function injectFlow(nx, ny, vx, vy, strength = 1) {
  const cx = nx * (flowW - 1);
  const cy = ny * (flowH - 1);
  const radius = Math.max(4, Math.min(flowW, flowH) * 0.11);
  const minX = clamp(Math.floor(cx - radius), 1, flowW - 2);
  const maxX = clamp(Math.ceil(cx + radius), 1, flowW - 2);
  const minY = clamp(Math.floor(cy - radius), 1, flowH - 2);
  const maxY = clamp(Math.ceil(cy + radius), 1, flowH - 2);

  const speed = Math.hypot(vx, vy);
  const spin = clamp(speed * 0.24, 0, 0.32) * strength;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = (x - cx) / radius;
      const dy = (y - cy) / radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= 1) continue;

      const falloff = Math.pow(1 - d2, 2.2);
      const i = y * flowW + x;

      flowX[i] += (vx * 0.82 - dy * spin) * falloff * strength;
      flowY[i] += (vy * 0.82 + dx * spin) * falloff * strength;
    }
  }
}

function stepWave() {
  // Read exclusively from the previous state and write into separate buffers.
  // In-place updates bias propagation toward the scan direction and can turn
  // circular ripples into long diagonal/vertical streaks.
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 1; y < waveH - 1; y++) {
      const row = y * waveW;
      for (let x = 1; x < waveW - 1; x++) {
        const i = row + x;
        // 9-point isotropic Laplacian. Compared with the 4-neighbour stencil,
        // this reduces subtle grid-axis bias so circular ripples remain round as
        // they expand across the surface.
        const axial =
          waveHeight[i - 1] +
          waveHeight[i + 1] +
          waveHeight[i - waveW] +
          waveHeight[i + waveW];
        const diagonal =
          waveHeight[i - waveW - 1] +
          waveHeight[i - waveW + 1] +
          waveHeight[i + waveW - 1] +
          waveHeight[i + waveW + 1];
        const lap =
          (4 * axial + diagonal - waveHeight[i] * 20) / 6;

        const velocity = clamp(
          (waveVelocity[i] + lap * 0.108) * 0.9865,
          -0.028,
          0.028
        );

        waveNextVelocity[i] = velocity;
        waveNextHeight[i] = clamp(
          (waveHeight[i] + velocity) * 0.9988,
          -0.085,
          0.085
        );
      }
    }

    [waveHeight, waveNextHeight] = [waveNextHeight, waveHeight];
    [waveVelocity, waveNextVelocity] = [waveNextVelocity, waveVelocity];
  }
}

function bilinear(field, x, y, w, h) {
  x = clamp(x, 0, w - 1.001);
  y = clamp(y, 0, h - 1.001);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;

  const a = mix(field[y0 * w + x0], field[y0 * w + x1], tx);
  const b = mix(field[y1 * w + x0], field[y1 * w + x1], tx);
  return mix(a, b, ty);
}

function stepFlow(dt) {
  const dtAdvect = Math.min(dt, 1 / 30) * 9.0;

  for (let y = 1; y < flowH - 1; y++) {
    for (let x = 1; x < flowW - 1; x++) {
      const i = y * flowW + x;
      const backX = x - flowX[i] * dtAdvect;
      const backY = y - flowY[i] * dtAdvect;

      let vx = bilinear(flowX, backX, backY, flowW, flowH);
      let vy = bilinear(flowY, backX, backY, flowW, flowH);

      const avgX = (
        flowX[i - 1] + flowX[i + 1] + flowX[i - flowW] + flowX[i + flowW]
      ) * 0.25;
      const avgY = (
        flowY[i - 1] + flowY[i + 1] + flowY[i - flowW] + flowY[i + flowW]
      ) * 0.25;

      vx = mix(vx, avgX, 0.070);
      vy = mix(vy, avgY, 0.070);

      flowNextX[i] = clamp(vx * 0.982, -2.4, 2.4);
      flowNextY[i] = clamp(vy * 0.982, -2.4, 2.4);
    }
  }

  [flowX, flowNextX] = [flowNextX, flowX];
  [flowY, flowNextY] = [flowNextY, flowY];

  flowNextX.fill(0);
  flowNextY.fill(0);
}

function sampleFlow(nx, ny) {
  return [
    bilinear(flowX, nx * (flowW - 1), ny * (flowH - 1), flowW, flowH),
    bilinear(flowY, nx * (flowW - 1), ny * (flowH - 1), flowW, flowH),
  ];
}

function sampleWaveGradient(nx, ny) {
  const x = clamp(nx * (waveW - 1), 1, waveW - 2);
  const y = clamp(ny * (waveH - 1), 1, waveH - 2);
  const gx = (
    bilinear(waveHeight, x - 1, y, waveW, waveH) -
    bilinear(waveHeight, x + 1, y, waveW, waveH)
  ) * 0.5;
  const gy = (
    bilinear(waveHeight, x, y - 1, waveW, waveH) -
    bilinear(waveHeight, x, y + 1, waveW, waveH)
  ) * 0.5;
  return [gx, gy];
}

const koiPalettes = [
  { base: "#eee8d7", patches: ["#d75d32", "#292c29"] },
  { base: "#f1ead8", patches: ["#c74228", "#cb7a2c"] },
  { base: "#d8d7cf", patches: ["#262b2c", "#c35a31"] },
  { base: "#e8cf8f", patches: ["#b95c29", "#5c4631"] },
  { base: "#f4eee1", patches: ["#b53025", "#31302c"] },
];

const koi = [];
const koiCount = prefersReducedMotion ? 3 : 5;

function spawnKoi(index) {
  const fish = {
    x: 0.14 + random() * 0.72,
    y: 0.13 + random() * 0.74,
    angle: random() * TAU,
    speed: 0.025 + random() * 0.012,
    cruise: 0.024 + random() * 0.014,
    size: 0.070 + random() * 0.030,
    depth: 0.28 + random() * 0.38,
    phase: random() * TAU,
    tailPhase: random() * TAU,
    turnRate: 0.72 + random() * 0.52,
    palette: koiPalettes[index % koiPalettes.length],
    spots: [],
  };

  const spotCount = 3 + Math.floor(random() * 4);
  for (let i = 0; i < spotCount; i++) {
    fish.spots.push({
      x: -0.18 + random() * 0.48,
      y: (random() - 0.5) * 0.16,
      rx: 0.055 + random() * 0.085,
      ry: 0.035 + random() * 0.060,
      rot: (random() - 0.5) * 1.2,
      color: fish.palette.patches[Math.floor(random() * fish.palette.patches.length)],
      alpha: 0.66 + random() * 0.25,
    });
  }

  koi[index] = fish;
}

for (let i = 0; i < koiCount; i++) spawnKoi(i);

function wrapAngle(a) {
  return ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

function koiBodyPath(ctx, length, bend) {
  const w = length * 0.155;
  ctx.beginPath();
  ctx.moveTo(-length * 0.37, bend);
  ctx.bezierCurveTo(
    -length * 0.22, -w * 0.98 + bend * 0.35,
     length * 0.18, -w,
     length * 0.40, -w * 0.48
  );
  ctx.quadraticCurveTo(length * 0.51, 0, length * 0.40, w * 0.48);
  ctx.bezierCurveTo(
     length * 0.18, w,
    -length * 0.22, w * 0.98 + bend * 0.35,
    -length * 0.37, bend
  );
  ctx.closePath();
}

function drawSingleKoi(ctx, fish, time) {
  const W = koiCanvas.width;
  const H = koiCanvas.height;
  const length = fish.size * W;
  const swimRate = 4.5 + fish.speed * 58;
  const tailSwing = Math.sin(fish.tailPhase) * length * (0.045 + fish.speed * 0.70);
  const bodyBend = Math.sin(fish.tailPhase * 0.52 + fish.phase) * length * 0.012;
  const opacity = 0.72 - fish.depth * 0.18;

  ctx.save();
  ctx.translate(fish.x * W, fish.y * H);
  ctx.rotate(fish.angle);
  ctx.globalAlpha = opacity;
  ctx.filter = "blur(" + (0.15 + fish.depth * 0.55) + "px)";

  // Soft underwater body shadow / volume halo.
  ctx.save();
  ctx.globalAlpha *= 0.11;
  ctx.filter = "blur(" + (2.0 + fish.depth * 2.2) + "px)";
  ctx.fillStyle = "#0b2929";
  ctx.beginPath();
  ctx.ellipse(-length * 0.01, length * 0.025, length * 0.38, length * 0.115, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  // Tail fin, animated independently from the heavier body.
  const tailGrad = ctx.createLinearGradient(-length * 0.58, 0, -length * 0.32, 0);
  tailGrad.addColorStop(0, "rgba(233,222,194,0.22)");
  tailGrad.addColorStop(1, "rgba(238,230,207,0.72)");
  ctx.fillStyle = tailGrad;
  ctx.beginPath();
  ctx.moveTo(-length * 0.34, -length * 0.050 + bodyBend);
  ctx.quadraticCurveTo(
    -length * 0.49,
    -length * 0.145 + tailSwing,
    -length * 0.58,
    -length * 0.105 + tailSwing
  );
  ctx.quadraticCurveTo(
    -length * 0.535,
    tailSwing,
    -length * 0.58,
    length * 0.105 + tailSwing
  );
  ctx.quadraticCurveTo(
    -length * 0.49,
    length * 0.145 + tailSwing,
    -length * 0.34,
    length * 0.050 + bodyBend
  );
  ctx.closePath();
  ctx.fill();

  // Pectoral fins.
  ctx.fillStyle = "rgba(228,220,198,0.38)";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(length * 0.08, side * length * 0.095);
    ctx.quadraticCurveTo(
      length * 0.00,
      side * length * 0.205,
      -length * 0.10,
      side * length * 0.145
    );
    ctx.quadraticCurveTo(
      -length * 0.015,
      side * length * 0.090,
      length * 0.08,
      side * length * 0.095
    );
    ctx.fill();
  }

  koiBodyPath(ctx, length, bodyBend);
  const bodyGrad = ctx.createLinearGradient(-length * 0.36, -length * 0.10, length * 0.44, length * 0.07);
  bodyGrad.addColorStop(0, "#c7c4b8");
  bodyGrad.addColorStop(0.34, fish.palette.base);
  bodyGrad.addColorStop(0.76, fish.palette.base);
  bodyGrad.addColorStop(1, "#c9c8bc");
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  // Stable Kohaku/Sanke-like markings clipped to the body.
  ctx.save();
  koiBodyPath(ctx, length, bodyBend);
  ctx.clip();
  for (const spot of fish.spots) {
    ctx.globalAlpha = opacity * spot.alpha;
    ctx.fillStyle = spot.color;
    ctx.beginPath();
    ctx.ellipse(
      spot.x * length,
      spot.y * length + bodyBend * (0.35 - spot.x),
      spot.rx * length,
      spot.ry * length,
      spot.rot,
      0,
      TAU
    );
    ctx.fill();
  }

  // Fine dorsal luminance makes the back feel rounded under shallow water.
  ctx.globalAlpha = opacity * 0.24;
  const sheen = ctx.createLinearGradient(0, -length * 0.10, 0, length * 0.10);
  sheen.addColorStop(0, "rgba(255,255,243,0)");
  sheen.addColorStop(0.46, "rgba(255,255,243,0.55)");
  sheen.addColorStop(0.56, "rgba(255,255,243,0.22)");
  sheen.addColorStop(1, "rgba(255,255,243,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(-length * 0.30, -length * 0.11, length * 0.72, length * 0.22);
  ctx.restore();

  // Head, eyes, and very subtle mouth cue.
  ctx.globalAlpha = opacity * 0.70;
  ctx.fillStyle = "#202826";
  const eyeX = length * 0.335;
  const eyeY = length * 0.047;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(eyeX, side * eyeY, Math.max(0.8, length * 0.010), 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(91,77,62,0.38)";
  ctx.lineWidth = Math.max(0.55, length * 0.006);
  ctx.beginPath();
  ctx.arc(length * 0.432, 0, length * 0.026, -0.62, 0.62);
  ctx.stroke();

  ctx.restore();
}

function updateAndDrawKoi(time, dt) {
  const ctx = koiCtx;
  const aspect = width / Math.max(1, height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, koiCanvas.width, koiCanvas.height);

  for (let i = 0; i < koi.length; i++) {
    const fish = koi[i];

    let steerX = Math.cos(fish.angle);
    let steerY = Math.sin(fish.angle);

    // Two slow wander frequencies avoid visibly periodic circles.
    const wander =
      Math.sin(time * 0.00021 + fish.phase) * 0.34 +
      Math.sin(time * 0.000083 + fish.phase * 2.7) * 0.21;
    steerX += Math.cos(fish.angle + wander) * 0.28;
    steerY += Math.sin(fish.angle + wander) * 0.28;

    // Soft edge avoidance in screen-space coordinates.
    const margin = 0.12;
    if (fish.x < margin) steerX += (margin - fish.x) * 12 * aspect;
    if (fish.x > 1 - margin) steerX -= (fish.x - (1 - margin)) * 12 * aspect;
    if (fish.y < margin) steerY += (margin - fish.y) * 12;
    if (fish.y > 1 - margin) steerY -= (fish.y - (1 - margin)) * 12;

    // Mild schooling separation; koi remain independent rather than moving as one flock.
    for (let j = 0; j < koi.length; j++) {
      if (j === i) continue;
      const other = koi[j];
      const dx = (fish.x - other.x) * aspect;
      const dy = fish.y - other.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.0001 && d < 0.12) {
        const push = (0.12 - d) / 0.12;
        steerX += (dx / d) * push * 0.72;
        steerY += (dy / d) * push * 0.72;
      }
    }

    // Stirring startles nearby fish, while residual current only nudges them.
    let fear = 0;
    for (const p of pointers.values()) {
      const dx = (fish.x - p.x) * aspect;
      const dy = fish.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.0001 && d < 0.26) {
        const f = (0.26 - d) / 0.26;
        steerX += (dx / d) * f * 2.7;
        steerY += (dy / d) * f * 2.7;
        fear = Math.max(fear, f);
      }
    }

    const flow = sampleFlow(clamp(fish.x, 0, 1), clamp(fish.y, 0, 1));
    const flowSpeed = Math.hypot(flow[0], flow[1]);
    steerX += flow[0] * aspect * 0.055;
    steerY += flow[1] * 0.055;

    const desiredAngle = Math.atan2(steerY, steerX);
    const da = wrapAngle(desiredAngle - fish.angle);
    fish.angle += da * Math.min(1, dt * fish.turnRate * (1.0 + fear * 1.4));

    const targetSpeed =
      fish.cruise +
      Math.min(0.020, flowSpeed * 0.004) +
      fear * 0.030;
    fish.speed += (targetSpeed - fish.speed) * Math.min(1, dt * 1.4);

    fish.x += Math.cos(fish.angle) * fish.speed * dt / Math.max(0.75, aspect);
    fish.y += Math.sin(fish.angle) * fish.speed * dt;
    fish.x = clamp(fish.x, 0.035, 0.965);
    fish.y = clamp(fish.y, 0.045, 0.955);

    fish.tailPhase += dt * (4.0 + fish.speed * 95);
    drawSingleKoi(ctx, fish, time);
  }
}

function uploadKoiTexture() {
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, koiTexture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texSubImage2D(
    gl.TEXTURE_2D,
    0,
    0,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    koiCanvas
  );
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
}

function uploadSimulation() {
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, waveTexture);
  gl.texSubImage2D(
    gl.TEXTURE_2D,
    0,
    0,
    0,
    waveW,
    waveH,
    gl.RED,
    gl.FLOAT,
    waveHeight
  );

  for (let i = 0, p = 0; i < flowX.length; i++, p += 2) {
    flowPacked[p] = flowX[i];
    flowPacked[p + 1] = flowY[i];
  }

  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, flowTexture);
  gl.texSubImage2D(
    gl.TEXTURE_2D,
    0,
    0,
    0,
    flowW,
    flowH,
    gl.RG,
    gl.FLOAT,
    flowPacked
  );
}

function makeLeafSprite(config) {
  const c = document.createElement("canvas");
  c.width = 192;
  c.height = 220;
  const ctx = c.getContext("2d");

  const colors = config.colors;
  const halfLength = config.halfLength ?? 78;
  const maxWidth = config.maxWidth ?? 42;
  const serration = config.serration ?? 0.035;
  const asymmetry = config.asymmetry ?? 0.055;
  const lean = config.lean ?? 0.0;
  const age = config.age ?? 0.15;
  const phaseA = random() * TAU;
  const phaseB = random() * TAU;

  ctx.translate(96, 104);
  ctx.rotate(config.rotation ?? -0.05);

  const right = [];
  const left = [];
  const steps = 30;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = -halfLength + t * halfLength * 1.84;
    const profile = Math.pow(Math.max(0, Math.sin(Math.PI * t)), config.roundness ?? 0.74);
    const taper = 1.0 - t * (config.baseTaper ?? 0.10);
    const coreWidth = maxWidth * profile * taper;

    const rightRipple =
      Math.sin(t * Math.PI * (config.teeth ?? 13) + phaseA) * serration +
      Math.sin(t * Math.PI * 5.4 + phaseB) * serration * 0.42;
    const leftRipple =
      Math.sin(t * Math.PI * (config.teeth ?? 13) + phaseA + 1.55) * serration +
      Math.sin(t * Math.PI * 4.7 + phaseB + 0.8) * serration * 0.36;

    const centerShift =
      lean * (t - 0.45) * maxWidth +
      Math.sin(t * Math.PI * 1.7 + phaseB) * maxWidth * asymmetry * 0.20;

    const rightWidth = coreWidth * (1 + asymmetry * 0.55 + rightRipple);
    const leftWidth = coreWidth * (1 - asymmetry * 0.42 + leftRipple);

    right.push([centerShift + rightWidth, y]);
    left.push([centerShift - leftWidth, y]);
  }

  const leafPath = new Path2D();
  leafPath.moveTo(lean * -maxWidth * 0.42, -halfLength - 2);
  for (let i = 1; i < right.length; i++) {
    leafPath.lineTo(right[i][0], right[i][1]);
  }
  for (let i = left.length - 1; i >= 1; i--) {
    leafPath.lineTo(left[i][0], left[i][1]);
  }
  leafPath.closePath();

  // A leaf-sized contact shadow baked into the sprite only gives the edge a tiny
  // thickness cue. The actual water-contact shadow is rendered dynamically later.
  ctx.shadowColor = "rgba(2, 18, 12, 0.20)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;

  const baseGradient = ctx.createLinearGradient(-maxWidth, -halfLength * 0.75, maxWidth, halfLength * 0.72);
  baseGradient.addColorStop(0.00, colors[0]);
  baseGradient.addColorStop(0.38, colors[1]);
  baseGradient.addColorStop(0.72, colors[2]);
  baseGradient.addColorStop(1.00, colors[3] ?? colors[2]);
  ctx.fillStyle = baseGradient;
  ctx.fill(leafPath);
  ctx.shadowColor = "transparent";

  ctx.save();
  ctx.clip(leafPath);

  // Broad asymmetric curl shading keeps the blade from looking like a flat sticker.
  const curl = ctx.createLinearGradient(-maxWidth * 0.95, 0, maxWidth * 0.95, 0);
  curl.addColorStop(0, "rgba(5,23,12," + (0.10 + age * 0.05) + ")");
  curl.addColorStop(0.34, "rgba(255,255,220,0.025)");
  curl.addColorStop(0.62, "rgba(255,255,225,0.075)");
  curl.addColorStop(1, "rgba(3,18,10,0.12)");
  ctx.fillStyle = curl;
  ctx.fillRect(-70, -92, 140, 178);

  // Fine chlorophyll / weather mottling.
  for (let i = 0; i < 150; i++) {
    const t = random();
    const yy = -halfLength + t * halfLength * 1.80;
    const width = maxWidth * Math.pow(Math.max(0, Math.sin(Math.PI * t)), 0.78);
    const xx = (random() * 2 - 1) * width * 0.82 + lean * (t - 0.5) * maxWidth;
    const r = 0.28 + random() * 0.95;
    ctx.globalAlpha = 0.018 + random() * (0.030 + age * 0.035);
    ctx.fillStyle = random() > 0.57 ? "#f2edb9" : "#18341d";
    ctx.beginPath();
    ctx.arc(xx, yy, r, 0, TAU);
    ctx.fill();
  }

  // Age-related blemishes, intentionally irregular and sparse.
  const blemishCount = 3 + Math.floor(age * 8);
  for (let i = 0; i < blemishCount; i++) {
    const t = 0.18 + random() * 0.68;
    const yy = -halfLength + t * halfLength * 1.80;
    const width = maxWidth * Math.pow(Math.sin(Math.PI * t), 0.78);
    const xx = (random() * 2 - 1) * width * 0.66;
    ctx.globalAlpha = 0.07 + age * 0.10 + random() * 0.05;
    ctx.fillStyle = random() > 0.45 ? "#6f6a35" : "#493b27";
    ctx.beginPath();
    ctx.ellipse(
      xx,
      yy,
      1.0 + random() * (1.8 + age * 2.8),
      0.7 + random() * (1.2 + age * 1.7),
      random() * TAU,
      0,
      TAU
    );
    ctx.fill();
  }

  // Tiny insect/weather holes and edge bites on the older sprites.
  if (age > 0.42) {
    ctx.globalCompositeOperation = "destination-out";
    const holes = 1 + Math.floor(age * 2);
    for (let i = 0; i < holes; i++) {
      const t = 0.26 + random() * 0.50;
      const yy = -halfLength + t * halfLength * 1.78;
      const width = maxWidth * Math.pow(Math.sin(Math.PI * t), 0.80);
      const xx = (random() * 2 - 1) * width * 0.58;
      ctx.globalAlpha = 0.62;
      ctx.beginPath();
      ctx.ellipse(xx, yy, 0.9 + random() * 1.5, 0.7 + random() * 1.1, random() * TAU, 0, TAU);
      ctx.fill();
    }

    const bites = 1 + Math.floor(age * 3);
    for (let i = 0; i < bites; i++) {
      const t = 0.22 + random() * 0.58;
      const yy = -halfLength + t * halfLength * 1.80;
      const width = maxWidth * Math.pow(Math.sin(Math.PI * t), 0.76);
      const side = random() > 0.5 ? 1 : -1;
      const xx = side * width * (0.90 + random() * 0.06);
      ctx.globalAlpha = 0.76;
      ctx.beginPath();
      ctx.ellipse(
        xx,
        yy,
        2.1 + random() * 2.4,
        1.5 + random() * 2.0,
        random() * TAU,
        0,
        TAU
      );
      ctx.fill();
    }

    ctx.globalCompositeOperation = "source-over";
  }

  ctx.globalAlpha = 1;
  ctx.restore();

  // Slight translucent edge thickness.
  ctx.strokeStyle = "rgba(220,236,181,0.18)";
  ctx.lineWidth = 0.85;
  ctx.stroke(leafPath);

  // Curved main vein with a slightly off-center natural path.
  const veinLean = lean * maxWidth * 0.55;
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(226,238,178,0.46)";
  ctx.lineWidth = 2.05;
  ctx.beginPath();
  ctx.moveTo(-veinLean * 0.35, -halfLength * 0.80);
  ctx.bezierCurveTo(
    veinLean * 0.10,
    -halfLength * 0.28,
    veinLean * 0.75,
    halfLength * 0.20,
    veinLean + 3,
    halfLength * 0.72
  );
  ctx.stroke();

  ctx.strokeStyle = "rgba(38,70,37,0.30)";
  ctx.lineWidth = 0.60;
  ctx.stroke();

  // Organic alternating secondary veins, with small per-branch angle jitter.
  const branchCount = config.branches ?? 10;
  for (let i = 0; i < branchCount; i++) {
    const t = 0.17 + (i / Math.max(1, branchCount - 1)) * 0.64;
    const yy = -halfLength + t * halfLength * 1.82;
    const profile = Math.pow(Math.sin(Math.PI * t), 0.76);
    const reach = maxWidth * profile * (0.65 + random() * 0.12);
    const midX = veinLean * (t - 0.35) * 0.72 + 1.5;

    for (const side of [-1, 1]) {
      const sideScale = side > 0 ? 1.0 : 0.93;
      const jitter = (random() - 0.5) * 6.5;
      ctx.strokeStyle = "rgba(218,232,174," + (0.20 + profile * 0.15) + ")";
      ctx.lineWidth = 0.65 + profile * 0.28;
      ctx.beginPath();
      ctx.moveTo(midX, yy);
      ctx.bezierCurveTo(
        midX + side * reach * 0.35,
        yy + 2.5 + jitter * 0.18,
        midX + side * reach * 0.72,
        yy + 7.0 + jitter * 0.45,
        midX + side * reach * sideScale,
        yy + 11.0 + jitter
      );
      ctx.stroke();
    }
  }

  // Wet-surface sheen: a broken highlight, not a perfect studio stripe.
  ctx.save();
  ctx.clip(leafPath);
  ctx.globalAlpha = 0.34;
  const sheen = ctx.createLinearGradient(-30, -55, 18, 34);
  sheen.addColorStop(0.00, "rgba(255,255,232,0)");
  sheen.addColorStop(0.38, "rgba(255,255,235,0.26)");
  sheen.addColorStop(0.52, "rgba(255,255,235,0.07)");
  sheen.addColorStop(1.00, "rgba(255,255,235,0)");
  ctx.fillStyle = sheen;
  ctx.beginPath();
  ctx.ellipse(-13, -22, 4.5, 27, -0.48, 0, TAU);
  ctx.fill();

  // A few tiny water beads on fresher leaves.
  const beadCount = age < 0.45 ? 1 + Math.floor(random() * 2) : 0;
  for (let i = 0; i < beadCount; i++) {
    const bx = -16 + random() * 28;
    const by = -36 + random() * 50;
    const br = 1.1 + random() * 1.4;
    const bead = ctx.createRadialGradient(bx - br * 0.35, by - br * 0.40, 0.2, bx, by, br);
    bead.addColorStop(0, "rgba(255,255,255,0.58)");
    bead.addColorStop(0.35, "rgba(225,245,229,0.20)");
    bead.addColorStop(1, "rgba(11,40,31,0.12)");
    ctx.fillStyle = bead;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  // Petiole follows the lower asymmetry instead of always being centered.
  ctx.strokeStyle = "rgba(77,85,43,0.76)";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(veinLean + 2.5, halfLength * 0.70);
  ctx.quadraticCurveTo(
    veinLean + 4.5,
    halfLength * 0.82,
    veinLean + 7.5 + lean * 10,
    halfLength * 0.93
  );
  ctx.stroke();

  return c;
}

const leafSprites = [
  makeLeafSprite({
    colors: ["#b6c66d", "#78904c", "#48633d", "#334d37"],
    maxWidth: 44, halfLength: 73, teeth: 15, serration: 0.055,
    asymmetry: 0.085, lean: -0.070, age: 0.12, roundness: 0.62, branches: 10,
  }),
  makeLeafSprite({
    colors: ["#a9b85f", "#697f43", "#3d5935", "#2e4730"],
    maxWidth: 32, halfLength: 88, teeth: 19, serration: 0.080,
    asymmetry: 0.110, lean: 0.080, age: 0.24, roundness: 0.92, branches: 12,
  }),
  makeLeafSprite({
    colors: ["#c79a5e", "#97653d", "#6b4d36", "#47372e"],
    maxWidth: 43, halfLength: 74, teeth: 12, serration: 0.050,
    asymmetry: 0.095, lean: -0.035, age: 0.68, roundness: 0.68, branches: 9,
  }),
  makeLeafSprite({
    colors: ["#91ad72", "#5b7a55", "#3f5e49", "#314b3e"],
    maxWidth: 49, halfLength: 69, teeth: 14, serration: 0.048,
    asymmetry: 0.075, lean: 0.045, age: 0.18, roundness: 0.56, branches: 10,
  }),
  makeLeafSprite({
    colors: ["#9fa45b", "#72753d", "#565435", "#3d3c2d"],
    maxWidth: 30, halfLength: 90, teeth: 21, serration: 0.090,
    asymmetry: 0.125, lean: 0.105, age: 0.52, roundness: 0.96, branches: 12,
  }),
  makeLeafSprite({
    colors: ["#c3ae73", "#92794d", "#69573b", "#4c4030"],
    maxWidth: 41, halfLength: 76, teeth: 13, serration: 0.060,
    asymmetry: 0.095, lean: -0.090, age: 0.78, roundness: 0.72, branches: 9,
  }),
];

const leaves = [];
const leafCount = prefersReducedMotion ? 8 : 13;

function spawnLeaf(index, edge = false) {
  const leaf = leaves[index] || {};
  leaf.x = edge ? -0.08 - random() * 0.12 : 0.05 + random() * 0.9;
  leaf.y = 0.06 + random() * 0.88;
  leaf.vx = 0.008 + random() * 0.012;
  leaf.vy = (random() - 0.5) * 0.006;
  leaf.angle = random() * TAU;
  leaf.spin = (random() - 0.5) * 0.25;
  leaf.scale = 0.27 + random() * 0.23;
  leaf.sprite = leafSprites[Math.floor(random() * leafSprites.length)];
  leaf.phase = random() * TAU;
  leaf.tone = 0.86 + random() * 0.12;
  leaf.saturation = 0.78 + random() * 0.16;
  leaf.alpha = 0.86 + random() * 0.09;
  leaf.curl = (random() - 0.5) * 0.10;
  leaf.tiltBias = (random() - 0.5) * 0.05;
  leaf.nextWake = 0;
  leaves[index] = leaf;
}

for (let i = 0; i < leafCount; i++) spawnLeaf(i);

function drawLeaves(time, dt) {
  const ctx = leafCtx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  for (let i = 0; i < leaves.length; i++) {
    const leaf = leaves[i];
    const flow = sampleFlow(clamp(leaf.x, 0, 1), clamp(leaf.y, 0, 1));
    const ambientX = 0.018 + Math.sin(time * 0.00023 + leaf.phase) * 0.008;
    const ambientY = Math.cos(time * 0.00017 + leaf.phase * 1.7) * 0.006;

    const flowSpeed = Math.hypot(flow[0], flow[1]);
    const flowCoupling = 0.165 + Math.min(0.035, flowSpeed * 0.018);
    const targetVX = ambientX + flow[0] * flowCoupling;
    const targetVY = ambientY + flow[1] * flowCoupling;

    // Floating leaves lag the water slightly because of surface drag and inertia.
    // This keeps them from feeling mechanically welded to the velocity field.
    const response = 1.85 + Math.min(0.45, flowSpeed * 0.18);
    leaf.vx += (targetVX - leaf.vx) * Math.min(1, dt * response);
    leaf.vy += (targetVY - leaf.vy) * Math.min(1, dt * response);
    leaf.vx = clamp(leaf.vx, -0.34, 0.34);
    leaf.vy = clamp(leaf.vy, -0.34, 0.34);

    const speed = Math.hypot(leaf.vx, leaf.vy);
    if (speed > 0.003) {
      const targetAngle = Math.atan2(leaf.vy * height, leaf.vx * width) + Math.PI / 2;
      let da = ((targetAngle - leaf.angle + Math.PI) % TAU) - Math.PI;
      leaf.angle += da * Math.min(1, dt * 0.5);
    }
    leaf.angle += leaf.spin * dt * (0.35 + Math.min(1, speed * 7));

    // A fast floating leaf drags a tiny dimple/wake behind it. Keep this several
    // orders weaker than pointer interaction so it adds physical coupling without
    // turning leaves into obvious ripple emitters.
    if (
      !prefersReducedMotion &&
      speed > 0.055 &&
      time > leaf.nextWake &&
      leaf.x > 0.02 && leaf.x < 0.98 &&
      leaf.y > 0.02 && leaf.y < 0.98
    ) {
      const invSpeed = 1 / Math.max(speed, 0.0001);
      const wakeOffset = 0.007 + leaf.scale * 0.006;
      const wakeX = leaf.x - leaf.vx * invSpeed * wakeOffset;
      const wakeY = leaf.y - leaf.vy * invSpeed * wakeOffset;
      const wakeStrength = clamp((speed - 0.05) * 0.009, 0.00025, 0.0012);
      injectWave(wakeX, wakeY, -wakeStrength, 0.006 + leaf.scale * 0.004);
      leaf.nextWake = time + 120 + (i % 4) * 25;
    }

    leaf.x += leaf.vx * dt;
    leaf.y += leaf.vy * dt;

    if (leaf.x > 1.13 || leaf.y < -0.15 || leaf.y > 1.15) {
      spawnLeaf(i, true);
      continue;
    }

    const x = leaf.x * width;
    const y = leaf.y * height;
    const g = sampleWaveGradient(clamp(leaf.x, 0, 1), clamp(leaf.y, 0, 1));
    const bob = Math.sin(time * 0.0018 + leaf.phase) * 1.5;

    ctx.save();
    ctx.translate(x + g[0] * 105, y + 2.2 + g[1] * 90);
    ctx.rotate(leaf.angle + 0.045);
    ctx.scale(leaf.scale * 0.91, leaf.scale * (0.27 + Math.abs(leaf.curl) * 0.22));
    ctx.globalAlpha = 0.070;
    ctx.filter = "brightness(0) blur(1.8px)";
    ctx.drawImage(leaf.sprite, -96, -110);
    ctx.restore();

    ctx.save();
    ctx.translate(x - g[0] * 42, y + 2.6 - g[1] * 38);
    ctx.rotate(leaf.angle + 0.035);
    ctx.scale(leaf.scale * 0.76, leaf.scale * (0.16 + Math.abs(leaf.curl) * 0.16));
    ctx.globalAlpha = 0.035;
    ctx.filter = "brightness(0.82) saturate(0.72) blur(1.6px)";
    ctx.drawImage(leaf.sprite, -96, -110);
    ctx.restore();

    ctx.save();
    ctx.translate(x, y + bob);
    ctx.rotate(leaf.angle + g[0] * 2.8);
    const wavePitch = clamp(g[1] * 4.2, -0.070, 0.070);
    const waveRoll = clamp(g[0] * 2.8, -0.045, 0.045);
    const perspective =
      0.90 +
      leaf.tiltBias +
      Math.cos(time * 0.0012 + leaf.phase) * 0.050 +
      wavePitch;
    const lateralRoll =
      1.0 +
      leaf.curl +
      Math.sin(time * 0.0010 + leaf.phase * 1.3) * 0.030 +
      waveRoll;
    ctx.scale(leaf.scale * lateralRoll, leaf.scale * perspective);
    ctx.globalAlpha = leaf.alpha;
    ctx.filter = "brightness(" + leaf.tone + ") saturate(" + leaf.saturation + ")";
    ctx.drawImage(leaf.sprite, -96, -110);
    ctx.filter = "none";
    ctx.restore();
  }
}

const isIOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const hintText = hint?.querySelector("span");
if (isIOS && hintText) {
  hintText.textContent = "水面をタップしてモーション許可 → iPhoneを揺らす";
}
if (isIOS) {
  stage.setAttribute(
    "aria-label",
    "指で水面をかき混ぜたり、iPhoneを揺らして波紋を起こせるインタラクティブな池"
  );
}

const motionState = {
  permission: typeof DeviceMotionEvent === "undefined" ? "unsupported" : "idle",
  attached: false,
  gravityReady: false,
  gravityX: 0,
  gravityY: 0,
  gravityZ: 0,
  filteredX: 0,
  filteredY: 0,
  filteredZ: 0,
  lastMagnitude: 0,
  lastFlow: 0,
  lastRipple: 0,
  phase: 0,
};

function resetMotionFilters() {
  motionState.gravityReady = false;
  motionState.filteredX = 0;
  motionState.filteredY = 0;
  motionState.filteredZ = 0;
  motionState.lastMagnitude = 0;
}

function motionAxesToScreen(x, y) {
  let angle = 0;

  if (screen.orientation && Number.isFinite(screen.orientation.angle)) {
    angle = screen.orientation.angle;
  } else if (typeof window.orientation === "number") {
    angle = window.orientation;
  }

  angle = ((angle % 360) + 360) % 360;

  let sx = x;
  let sy = y;

  if (angle === 90) {
    sx = -y;
    sy = x;
  } else if (angle === 180) {
    sx = -x;
    sy = -y;
  } else if (angle === 270) {
    sx = y;
    sy = -x;
  }

  // Device coordinates use +Y toward the top of the phone, while screen-space
  // simulation coordinates use +Y downward.
  return { x: sx, y: -sy };
}

function linearAccelerationFromMotion(e) {
  const direct = e.acceleration;
  if (
    direct &&
    [direct.x, direct.y, direct.z].some((v) => Number.isFinite(v))
  ) {
    return {
      x: Number.isFinite(direct.x) ? direct.x : 0,
      y: Number.isFinite(direct.y) ? direct.y : 0,
      z: Number.isFinite(direct.z) ? direct.z : 0,
    };
  }

  // Some iOS/WebView variants expose only accelerationIncludingGravity.
  // Track gravity with a slow low-pass filter and use the high-pass remainder
  // so a static phone does not continuously disturb the pond.
  const withGravity = e.accelerationIncludingGravity;
  if (!withGravity) return null;

  const gx = Number.isFinite(withGravity.x) ? withGravity.x : 0;
  const gy = Number.isFinite(withGravity.y) ? withGravity.y : 0;
  const gz = Number.isFinite(withGravity.z) ? withGravity.z : 0;

  if (!motionState.gravityReady) {
    motionState.gravityReady = true;
    motionState.gravityX = gx;
    motionState.gravityY = gy;
    motionState.gravityZ = gz;
    return { x: 0, y: 0, z: 0 };
  }

  const gravityResponse = 0.10;
  motionState.gravityX += (gx - motionState.gravityX) * gravityResponse;
  motionState.gravityY += (gy - motionState.gravityY) * gravityResponse;
  motionState.gravityZ += (gz - motionState.gravityZ) * gravityResponse;

  return {
    x: gx - motionState.gravityX,
    y: gy - motionState.gravityY,
    z: gz - motionState.gravityZ,
  };
}

function handleDeviceMotion(e) {
  if (document.hidden) return;

  const acceleration = linearAccelerationFromMotion(e);
  if (!acceleration) return;

  const screenAxes = motionAxesToScreen(acceleration.x, acceleration.y);
  const smoothing = 0.34;

  motionState.filteredX = mix(motionState.filteredX, screenAxes.x, smoothing);
  motionState.filteredY = mix(motionState.filteredY, screenAxes.y, smoothing);
  motionState.filteredZ = mix(motionState.filteredZ, acceleration.z, smoothing);

  const magnitude = Math.hypot(
    motionState.filteredX,
    motionState.filteredY,
    motionState.filteredZ
  );
  const jerk = Math.abs(magnitude - motionState.lastMagnitude);
  motionState.lastMagnitude = magnitude;

  const rotation = e.rotationRate;
  const rotationSpeed = rotation
    ? Math.hypot(
        Number.isFinite(rotation.alpha) ? rotation.alpha : 0,
        Number.isFinite(rotation.beta) ? rotation.beta : 0,
        Number.isFinite(rotation.gamma) ? rotation.gamma : 0
      )
    : 0;

  // Combine translation, abrupt change (jerk), and rotational shake. The
  // dead-zone prevents normal hand tremor from keeping the water permanently rough.
  const translationalEnergy = clamp((magnitude - 0.55) / 5.8, 0, 1.15);
  const jerkEnergy = clamp((jerk - 0.10) / 3.8, 0, 1);
  const rotationEnergy = clamp((rotationSpeed - 18) / 150, 0, 1);
  const shakeEnergy = clamp(
    translationalEnergy + jerkEnergy * 0.30 + rotationEnergy * 0.22,
    0,
    1.25
  );

  if (shakeEnergy < 0.045) return;

  const now = performance.now();
  const planar = Math.hypot(motionState.filteredX, motionState.filteredY);

  let dirX;
  let dirY;

  if (planar > 0.12) {
    dirX = motionState.filteredX / planar;
    dirY = motionState.filteredY / planar;
  } else {
    motionState.phase += 0.91;
    dirX = Math.cos(motionState.phase);
    dirY = Math.sin(motionState.phase);
  }

  const reducedScale = prefersReducedMotion ? 0.50 : 1.0;

  // Phone movement displaces the whole body of water. Injecting the same
  // directional current at three separated points reads as a broad slosh rather
  // than a single artificial whirlpool, and floating leaves inherit the motion.
  if (now - motionState.lastFlow > 32) {
    const flowSpeed = (0.28 + shakeEnergy * 0.78) * reducedScale;
    const flowVX = clamp(-dirX * flowSpeed, -1.2, 1.2);
    const flowVY = clamp(-dirY * flowSpeed, -1.2, 1.2);
    const flowStrength = 0.48 + shakeEnergy * 0.62;

    injectFlow(0.50, 0.50, flowVX, flowVY, flowStrength);

    const sideX = dirY * 0.22;
    const sideY = -dirX * 0.22;
    injectFlow(
      clamp(0.50 + sideX, 0.10, 0.90),
      clamp(0.50 + sideY, 0.10, 0.90),
      flowVX,
      flowVY,
      flowStrength * 0.72
    );
    injectFlow(
      clamp(0.50 - sideX, 0.10, 0.90),
      clamp(0.50 - sideY, 0.10, 0.90),
      flowVX,
      flowVY,
      flowStrength * 0.72
    );

    motionState.lastFlow = now;
  }

  if (shakeEnergy > 0.14) {
    const interval = mix(126, 58, clamp(shakeEnergy, 0, 1));

    if (now - motionState.lastRipple > interval) {
      // Golden-angle phase spacing avoids repeated ripples at the exact same
      // positions while keeping the response deterministic and stable.
      motionState.phase += 2.399963229728653;
      const lateral = Math.sin(motionState.phase) * 0.16;
      const crossX = -dirY * lateral;
      const crossY = dirX * lateral;

      const leadX = clamp(0.50 - dirX * 0.23 + crossX, 0.08, 0.92);
      const leadY = clamp(0.50 - dirY * 0.23 + crossY, 0.08, 0.92);
      const trailX = clamp(0.50 + dirX * 0.23 - crossX * 0.72, 0.08, 0.92);
      const trailY = clamp(0.50 + dirY * 0.23 - crossY * 0.72, 0.08, 0.92);

      const waveAmount = clamp(
        (0.0030 + shakeEnergy * 0.0135) * reducedScale,
        0.0022,
        0.0175
      );
      const radius = 0.030 + clamp(shakeEnergy, 0, 1) * 0.018;

      // Opposing pulses mimic the surface sloshing against inertia instead of
      // spawning identical rings everywhere.
      injectWave(leadX, leadY, -waveAmount, radius);
      injectWave(trailX, trailY, waveAmount * 0.72, radius * 1.14);

      if (shakeEnergy > 0.78) {
        const burstX = clamp(0.50 + Math.cos(motionState.phase) * 0.13, 0.12, 0.88);
        const burstY = clamp(0.50 + Math.sin(motionState.phase) * 0.13, 0.12, 0.88);
        injectWave(burstX, burstY, -waveAmount * 0.46, radius * 0.68);
      }

      motionState.lastRipple = now;
      revealInteraction();
    }
  }
}

function attachMotionListener() {
  if (motionState.attached || typeof DeviceMotionEvent === "undefined") return false;

  window.addEventListener("devicemotion", handleDeviceMotion, { passive: true });
  motionState.attached = true;
  motionState.permission = "granted";
  resetMotionFilters();
  return true;
}

async function ensureMotionPermission() {
  if (typeof DeviceMotionEvent === "undefined") {
    motionState.permission = "unsupported";
    return false;
  }
  if (motionState.attached) return true;
  if (motionState.permission === "requesting") return false;
  if (motionState.permission === "denied") return false;

  motionState.permission = "requesting";

  try {
    if (typeof DeviceMotionEvent.requestPermission === "function") {
      // iOS requires this call to originate from a user gesture.
      const result = await DeviceMotionEvent.requestPermission();
      if (result !== "granted") {
        motionState.permission = "denied";
        if (hintText) {
          hintText.textContent = "モーション未許可 / 指で水面をなぞれます";
          hint.classList.remove("is-hidden");
        }
        return false;
      }
    }

    const attached = attachMotionListener();

    if (attached && isIOS && hintText) {
      hintText.textContent = "iPhoneを揺らす / 指で水面をなぞる";
      hint.classList.remove("is-hidden");
      setTimeout(() => hint.classList.add("is-hidden"), 2200);
    }

    return attached;
  } catch {
    motionState.permission = "denied";
    if (hintText) {
      hintText.textContent = "モーションを有効化できません / 指操作は使えます";
      hint.classList.remove("is-hidden");
    }
    return false;
  }
}

// Browsers that do not gate motion behind an explicit permission prompt can
// subscribe immediately. iOS waits until the first touch/pointer gesture below.
if (
  typeof DeviceMotionEvent !== "undefined" &&
  typeof DeviceMotionEvent.requestPermission !== "function"
) {
  attachMotionListener();
}

addEventListener("orientationchange", resetMotionFilters, { passive: true });

const pointers = new Map();
let interacted = false;

function pointerPosition(e) {
  const rect = stage.getBoundingClientRect();
  return {
    x: clamp((e.clientX - rect.left) / rect.width, 0, 1),
    y: clamp((e.clientY - rect.top) / rect.height, 0, 1),
  };
}

function touchPosition(touch) {
  const rect = stage.getBoundingClientRect();
  return {
    x: clamp((touch.clientX - rect.left) / rect.width, 0, 1),
    y: clamp((touch.clientY - rect.top) / rect.height, 0, 1),
  };
}

function revealInteraction() {
  if (interacted) return;
  interacted = true;
  hint.classList.add("is-hidden");
}

function beginInteraction(id, x, y, pointerType = "touch") {
  const now = performance.now();
  pointers.set(id, { x, y, t: now, rippleT: now, vx: 0, vy: 0, speed: 0 });
  stage.classList.add("is-stirring");

  const touchLike = pointerType === "touch" || pointerType === "pen";
  // Tap = short displacement pulse plus a slightly wider counter-pulse.
  // This gives a readable expanding ring immediately, instead of waiting for drag motion.
  injectWave(x, y, touchLike ? -0.040 : -0.026, touchLike ? 0.034 : 0.030);
  injectWave(x, y, touchLike ? 0.017 : 0.012, touchLike ? 0.064 : 0.055);
  revealInteraction();
}

function moveInteraction(id, x, y, pointerType = "touch") {
  const now = performance.now();
  const previous = pointers.get(id);
  if (!previous) return;

  const dt = clamp((now - previous.t) / 1000, 1 / 240, 0.08);
  const vx = clamp((x - previous.x) / dt, -2.6, 2.6);
  const vy = clamp((y - previous.y) / dt, -2.6, 2.6);
  const speed = Math.hypot(vx, vy);
  const touchLike = pointerType === "touch" || pointerType === "pen";

  injectFlow(x, y, vx, vy, touchLike ? 2.05 : 1.15);
  injectWave(
    x,
    y,
    touchLike
      ? clamp(speed * 0.0050, 0.0028, 0.0150)
      : clamp(speed * 0.0042, 0.0022, 0.0125),
    touchLike ? 0.042 : 0.034
  );

  let rippleT = previous.rippleT || now;
  if (touchLike && now - rippleT > 54) {
    rippleT = now;
  }

  pointers.set(id, { x, y, t: now, rippleT, vx, vy, speed });
  revealInteraction();
}

function endInteraction(id) {
  const previous = pointers.get(id);
  if (previous) {
    const speed = previous.speed || 0;
    if (speed > 0.18) {
      const flick = clamp(speed, 0, 2.6);
      // Release a compact trailing impulse in the flick direction so fast gestures
      // have a visible wake even after the finger leaves the glass.
      const tailX = clamp(previous.x + previous.vx * 0.022, 0, 1);
      const tailY = clamp(previous.y + previous.vy * 0.022, 0, 1);
      injectFlow(previous.x, previous.y, previous.vx, previous.vy, 1.10);
      injectWave(previous.x, previous.y, clamp(flick * 0.0055, 0.0035, 0.0150), 0.040);
      injectWave(tailX, tailY, clamp(-flick * 0.0030, -0.0080, -0.0022), 0.030);
    }
  }

  pointers.delete(id);
  if (pointers.size === 0) stage.classList.remove("is-stirring");
}

stage.addEventListener("pointerdown", (e) => {
  if (isIOS && e.pointerType !== "mouse") return;

  const p = pointerPosition(e);
  try {
    stage.setPointerCapture?.(e.pointerId);
  } catch {
    // Embedded browsers can reject pointer capture even when pointer events work.
  }

  if (e.pointerType !== "mouse") e.preventDefault();
  beginInteraction(e.pointerId, p.x, p.y, e.pointerType);
}, { passive: false });

stage.addEventListener("pointermove", (e) => {
  if (isIOS && e.pointerType !== "mouse") return;

  const p = pointerPosition(e);
  const previous = pointers.get(e.pointerId);

  if (previous) {
    if (e.pointerType !== "mouse") e.preventDefault();
    moveInteraction(e.pointerId, p.x, p.y, e.pointerType);
  } else if (e.pointerType === "mouse") {
    const now = performance.now();
    const hover = stage._hover || { ...p, t: now };
    const dt = clamp((now - hover.t) / 1000, 1 / 240, 0.12);
    const vx = clamp((p.x - hover.x) / dt, -1.4, 1.4);
    const vy = clamp((p.y - hover.y) / dt, -1.4, 1.4);
    const speed = Math.hypot(vx, vy);

    // Hover motion creates only a faint capillary response. Persistent current is
    // reserved for an intentional drag, so simply moving the cursor cannot flood
    // the whole scene with long-lived flow streaks.
    if (speed > 0.08) {
      injectWave(p.x, p.y, clamp(speed * 0.00075, 0.00035, 0.00135), 0.018);
    }
    stage._hover = { ...p, t: now };
  }
}, { passive: false });

stage.addEventListener("pointerup", (e) => {
  if (isIOS && e.pointerType !== "mouse") return;
  endInteraction(e.pointerId);
});

stage.addEventListener("pointercancel", (e) => {
  if (isIOS && e.pointerType !== "mouse") return;
  endInteraction(e.pointerId);
});

stage.addEventListener("pointerleave", (e) => {
  if (e.pointerType === "mouse" && !pointers.has(e.pointerId)) stage._hover = null;
});

if (isIOS) {
  stage.addEventListener("touchstart", (e) => {
    if (motionState.permission === "idle") void ensureMotionPermission();

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const p = touchPosition(touch);
      beginInteraction(`touch-${touch.identifier}`, p.x, p.y, "touch");
    }
    e.preventDefault();
  }, { passive: false });

  stage.addEventListener("touchmove", (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const p = touchPosition(touch);
      moveInteraction(`touch-${touch.identifier}`, p.x, p.y, "touch");
    }
    e.preventDefault();
  }, { passive: false });

  const endTouch = (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      endInteraction(`touch-${e.changedTouches[i].identifier}`);
    }
    e.preventDefault();
  };

  stage.addEventListener("touchend", endTouch, { passive: false });
  stage.addEventListener("touchcancel", endTouch, { passive: false });
}

let lastTime = performance.now();
let waveAccumulator = 0;
const WAVE_STEP = 1 / 60;
let nextAmbientRipple = lastTime + 900;

function render(now) {
  resize();

  const dt = clamp((now - lastTime) / 1000, 1 / 120, 1 / 30);
  lastTime = now;

  stepFlow(dt);

  // Run the wave solver at a fixed rate so propagation and damping are
  // consistent on 30/60/120 Hz displays.
  waveAccumulator = Math.min(waveAccumulator + dt, WAVE_STEP * 4);
  let waveSteps = 0;
  while (waveAccumulator >= WAVE_STEP && waveSteps < 4) {
    stepWave();
    waveAccumulator -= WAVE_STEP;
    waveSteps++;
  }

  if (!prefersReducedMotion && now > nextAmbientRipple) {
    injectWave(
      0.08 + random() * 0.84,
      0.08 + random() * 0.84,
      (random() - 0.5) * 0.003,
      0.02 + random() * 0.018
    );
    nextAmbientRipple = now + 800 + random() * 1700;
  }

  updateAndDrawKoi(now, dt);
  uploadKoiTexture();
  uploadSimulation();

  gl.useProgram(program);
  gl.bindVertexArray(vao);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, bottomTexture);
  gl.uniform1i(uniforms.bottom, 0);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, waveTexture);
  gl.uniform1i(uniforms.wave, 1);

  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, flowTexture);
  gl.uniform1i(uniforms.flow, 2);

  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, koiTexture);
  gl.uniform1i(uniforms.koi, 3);

  gl.uniform2f(uniforms.waveTexel, 1 / waveW, 1 / waveH);
  gl.uniform2f(uniforms.flowTexel, 1 / flowW, 1 / flowH);
  gl.uniform1f(uniforms.time, now / 1000);
  gl.uniform2f(uniforms.resolution, width, height);

  gl.drawArrays(gl.TRIANGLES, 0, 3);

  drawLeaves(now, dt);
  requestAnimationFrame(render);
}

addEventListener("resize", resize, { passive: true });
document.addEventListener("visibilitychange", () => {
  lastTime = performance.now();
  waveAccumulator = 0;
  resetMotionFilters();
});

resize();
requestAnimationFrame(render);

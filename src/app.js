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
  vec2 q = p * 42.0;
  float a = sin(q.x + sin(q.y * 1.23 + t * 0.72) * 1.18);
  float b = sin(q.y * 0.91 + sin(q.x * 1.37 - t * 0.58) * 1.12);
  float ridge = 1.0 - min(1.0, abs(a + b) * 0.56);
  return pow(ridge, 7.0);
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
  float waveFrontMask = smoothstep(0.0007, 0.0075, abs(signedCurvature));

  vec2 narrowSlope = vec2(hl - hr, hu - hd) * 6.0;
  vec2 broadSlope = vec2(hwl - hwr, hwu - hwd) * 1.8;
  vec2 simSlope = (narrowSlope - broadSlope) * 0.46 * waveFrontMask;
  simSlope += flow * 0.0008;
  float simMagnitude = length(simSlope);
  if (simMagnitude > 0.024) {
    simSlope *= 0.024 / simMagnitude;
  }

  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  vec2 fineSlope = vec2(0.0);
  fineSlope += waveSlope(p, vec2(1.0, 0.24), 39.0, 0.78, 0.0105, uTime);
  fineSlope += waveSlope(p, vec2(-0.37, 1.0), 54.0, -0.57, 0.0082, uTime);
  fineSlope += waveSlope(p, vec2(0.71, 1.0), 73.0, 0.43, 0.0058, uTime);
  fineSlope += waveSlope(p, vec2(-1.0, 0.58), 94.0, -0.34, 0.0038, uTime);

  vec2 slope = simSlope + fineSlope;
  vec3 normal = normalize(vec3(-slope.x, slope.y, 1.0));

  float bedDepth = 0.50
    + 0.055 * sin(uv.x * 2.8 + 0.6)
    + 0.045 * sin(uv.y * 3.4 - 0.9);

  vec2 refractOffset = normal.xy * (0.027 + bedDepth * 0.004);
  refractOffset += flow * 0.00012;
  vec2 refractedUv = clamp(uv + refractOffset, 0.002, 0.998);

  vec3 bottom;
  bottom.r = texture(uBottom, clamp(refractedUv + normal.xy * 0.00016, 0.002, 0.998)).r;
  bottom.g = texture(uBottom, refractedUv).g;
  bottom.b = texture(uBottom, clamp(refractedUv - normal.xy * 0.00012, 0.002, 0.998)).b;

  vec3 extinction = vec3(0.25, 0.080, 0.038);
  vec3 transmittance = exp(-extinction * bedDepth);
  vec3 waterScatter = vec3(0.016, 0.070, 0.080);
  vec3 transmitted = bottom * transmittance
    + waterScatter * (1.0 - transmittance) * 0.42;

  float curvature = abs(signedCurvature);
  float caustic = smoothstep(0.0018, 0.014, curvature);
  caustic = pow(caustic, 2.8) * 0.022;
  caustic += smoothstep(0.028, 0.075, length(fineSlope)) * 0.006;
  float floorShimmer = causticPattern(
    (refractedUv - 0.5) * vec2(aspect, 1.0),
    uTime
  );
  transmitted += vec3(0.76, 0.84, 0.68) * caustic;
  transmitted += vec3(0.46, 0.52, 0.40) * floorShimmer * 0.020;
  transmitted += vec3(0.20, 0.28, 0.27)
    * clamp(signedCurvature * 4.0, -0.016, 0.016);

  vec2 eyePlane = (uv - 0.5) * vec2(aspect, 1.0);
  vec3 viewDir = normalize(vec3(-eyePlane.x * 0.58, -eyePlane.y * 0.58, 1.0));
  float nDotV = saturate(dot(normal, viewDir));

  const float F0 = 0.0204;
  float fresnel = F0 + (1.0 - F0) * pow(1.0 - nDotV, 5.0);
  fresnel += smoothstep(0.020, 0.10, length(slope)) * 0.055;
  fresnel = clamp(fresnel, F0, 0.16);

  float skyT = saturate(0.52 + normal.y * 0.70 - eyePlane.y * 0.16);
  vec3 skyZenith = vec3(0.10, 0.20, 0.23);
  vec3 skyHorizon = vec3(0.47, 0.60, 0.60);
  vec3 reflection = mix(skyZenith, skyHorizon, skyT);

  float broadCloud = 0.5 + 0.5 * sin(
    p.x * 2.1
    + sin(p.y * 1.7 + uTime * 0.035) * 0.75
    - uTime * 0.018
  );
  reflection *= mix(0.91, 1.045, broadCloud * broadCloud);

  vec3 lightDir = normalize(vec3(-0.18, -0.24, 0.95));
  vec3 halfDir = normalize(lightDir + viewDir);
  float nDotH = saturate(dot(normal, halfDir));
  float sunGlint = pow(nDotH, 220.0) * 0.22;
  sunGlint += pow(nDotH, 72.0) * 0.028;
  sunGlint *= 0.45 + smoothstep(0.01, 0.08, length(slope)) * 0.8;

  float surfaceReflect = clamp(fresnel + 0.016, 0.038, 0.15);
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

  const bg = ctx.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, "#777466");
  bg.addColorStop(0.48, "#66685d");
  bg.addColorStop(1, "#505b57");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // Fine sand and mineral grains.
  for (let i = 0; i < 11000; i++) {
    const x = random() * size;
    const y = random() * size;
    const r = 0.25 + random() * 1.1;
    const v = 74 + Math.floor(random() * 72);
    ctx.globalAlpha = 0.045 + random() * 0.11;
    ctx.fillStyle = "rgb(" + v + ", " + Math.max(45, v - 4) + ", " + Math.max(42, v - 12) + ")";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const palette = [
    ["#9b9a8b", "#666a62", "#3d4542"],
    ["#ad987b", "#776753", "#493f35"],
    ["#87908b", "#596763", "#34433f"],
    ["#7f8f91", "#52666a", "#314449"],
    ["#a3866b", "#6b5849", "#423a33"],
    ["#81848a", "#585e66", "#373e46"],
  ];

  for (let i = 0; i < 650; i++) {
    const x = random() * size;
    const y = random() * size;
    const rx = 4.5 + random() * 18;
    const ry = rx * (0.52 + random() * 0.42);
    const rot = random() * TAU;
    const colors = palette[Math.floor(random() * palette.length)];
    const count = 9;
    const pts = [];

    for (let k = 0; k < count; k++) {
      const a = (k / count) * TAU;
      const wobble = 0.82 + random() * 0.25;
      pts.push([
        Math.cos(a) * rx * wobble,
        Math.sin(a) * ry * (0.90 + random() * 0.18),
      ]);
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);

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

    ctx.shadowColor = "rgba(8, 18, 18, 0.24)";
    ctx.shadowBlur = 2.6;
    ctx.shadowOffsetX = 1.2;
    ctx.shadowOffsetY = 2.1;

    const g = ctx.createRadialGradient(-rx * 0.32, -ry * 0.44, 0.5, 0, 0, rx * 1.05);
    g.addColorStop(0, colors[0]);
    g.addColorStop(0.50, colors[1]);
    g.addColorStop(1, colors[2]);
    ctx.fillStyle = g;
    ctx.fill();

    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "rgba(236, 239, 224, 0.11)";
    ctx.lineWidth = 0.7;
    ctx.stroke();

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#f0ead4";
    const flecks = 1 + Math.floor(random() * 4);
    for (let k = 0; k < flecks; k++) {
      ctx.beginPath();
      ctx.arc(
        (random() - 0.5) * rx * 0.9,
        (random() - 0.5) * ry * 0.75,
        0.35 + random() * 0.8,
        0,
        TAU
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  const shade = ctx.createRadialGradient(
    size * 0.48,
    size * 0.38,
    size * 0.08,
    size * 0.5,
    size * 0.5,
    size * 0.78
  );
  shade.addColorStop(0, "rgba(255,255,245,0.035)");
  shade.addColorStop(1, "rgba(3,28,28,0.20)");
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

let dpr = 1;
let width = 1;
let height = 1;

let waveW = 200;
let waveH = 120;
let waveHeight = new Float32Array(waveW * waveH);
let waveVelocity = new Float32Array(waveW * waveH);
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
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 1; y < waveH - 1; y++) {
      const row = y * waveW;
      for (let x = 1; x < waveW - 1; x++) {
        const i = row + x;
        const lap =
          waveHeight[i - 1] +
          waveHeight[i + 1] +
          waveHeight[i - waveW] +
          waveHeight[i + waveW] -
          waveHeight[i] * 4;

        waveVelocity[i] = (waveVelocity[i] + lap * 0.108) * 0.9865;
        waveHeight[i] = (waveHeight[i] + waveVelocity[i]) * 0.9988;
      }
    }
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
  const dtAdvect = Math.min(dt, 1 / 30) * 11.5;

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

      vx = mix(vx, avgX, 0.055);
      vy = mix(vy, avgY, 0.055);

      flowNextX[i] = vx * 0.989;
      flowNextY[i] = vy * 0.989;
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

function makeLeafSprite(colors) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 160;
  const ctx = c.getContext("2d");

  ctx.translate(64, 78);
  ctx.rotate(-0.08);

  ctx.shadowColor = "rgba(0, 20, 15, 0.38)";
  ctx.shadowBlur = 9;
  ctx.shadowOffsetY = 5;

  const g = ctx.createLinearGradient(-36, -56, 32, 58);
  g.addColorStop(0, colors[0]);
  g.addColorStop(0.52, colors[1]);
  g.addColorStop(1, colors[2]);
  ctx.fillStyle = g;

  ctx.beginPath();
  ctx.moveTo(0, -62);
  ctx.bezierCurveTo(37, -45, 44, 5, 6, 60);
  ctx.bezierCurveTo(-34, 36, -48, -17, 0, -62);
  ctx.closePath();
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "rgba(226, 255, 210, 0.40)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(1, -51);
  ctx.quadraticCurveTo(0, 3, 5, 55);
  ctx.stroke();

  ctx.lineWidth = 1.2;
  ctx.globalAlpha = 0.42;
  for (let i = -35; i <= 35; i += 10) {
    const yy = i;
    const reach = 24 * (1 - Math.abs(yy) / 62);
    ctx.beginPath();
    ctx.moveTo(2, yy);
    ctx.quadraticCurveTo(reach * 0.48, yy + 6, reach, yy + 12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(1, yy + 3);
    ctx.quadraticCurveTo(-reach * 0.5, yy + 10, -reach, yy + 15);
    ctx.stroke();
  }

  ctx.globalAlpha = 0.72;
  ctx.fillStyle = "rgba(255,255,230,0.42)";
  ctx.beginPath();
  ctx.ellipse(-12, -27, 6, 15, -0.55, 0, TAU);
  ctx.fill();

  return c;
}

const leafSprites = [
  makeLeafSprite(["#c7d86d", "#6e923f", "#315a2f"]),
  makeLeafSprite(["#b6c95b", "#66853b", "#294a2a"]),
  makeLeafSprite(["#d5a85c", "#9a6737", "#5c402a"]),
  makeLeafSprite(["#a4c675", "#587d4e", "#31513d"]),
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
  leaf.scale = 0.36 + random() * 0.36;
  leaf.sprite = leafSprites[Math.floor(random() * leafSprites.length)];
  leaf.phase = random() * TAU;
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

    const targetVX = ambientX + flow[0] * 0.115;
    const targetVY = ambientY + flow[1] * 0.115;

    leaf.vx += (targetVX - leaf.vx) * Math.min(1, dt * 1.9);
    leaf.vy += (targetVY - leaf.vy) * Math.min(1, dt * 1.9);

    const speed = Math.hypot(leaf.vx, leaf.vy);
    if (speed > 0.003) {
      const targetAngle = Math.atan2(leaf.vy * height, leaf.vx * width) + Math.PI / 2;
      let da = ((targetAngle - leaf.angle + Math.PI) % TAU) - Math.PI;
      leaf.angle += da * Math.min(1, dt * 0.5);
    }
    leaf.angle += leaf.spin * dt * (0.35 + Math.min(1, speed * 7));

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
    ctx.translate(x + g[0] * 130, y + 8 + g[1] * 110);
    ctx.rotate(leaf.angle + 0.08);
    ctx.scale(leaf.scale * 0.94, leaf.scale * 0.54);
    ctx.globalAlpha = 0.18;
    ctx.filter = "blur(3px)";
    ctx.fillStyle = "#001411";
    ctx.beginPath();
    ctx.ellipse(0, 0, 44, 58, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(x, y + bob);
    ctx.rotate(leaf.angle + g[0] * 2.8);
    const perspective = 0.92 + Math.cos(time * 0.0012 + leaf.phase) * 0.06;
    ctx.scale(leaf.scale, leaf.scale * perspective);
    ctx.globalAlpha = 0.96;
    ctx.drawImage(leaf.sprite, -64, -80);
    ctx.restore();
  }
}

const isIOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

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
  pointers.set(id, { x, y, t: now, rippleT: now });
  stage.classList.add("is-stirring");

  const touchLike = pointerType === "touch" || pointerType === "pen";
  injectWave(x, y, touchLike ? -0.016 : -0.009, touchLike ? 0.030 : 0.027);
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

  injectFlow(x, y, vx, vy, touchLike ? 1.75 : 1.0);
  injectWave(
    x,
    y,
    touchLike
      ? clamp(speed * 0.0032, 0.0018, 0.0090)
      : clamp(speed * 0.0032, 0.0020, 0.010),
    touchLike ? 0.038 : 0.030
  );

  let rippleT = previous.rippleT || now;
  if (touchLike && now - rippleT > 54) {
    rippleT = now;
  }

  pointers.set(id, { x, y, t: now, rippleT });
  revealInteraction();
}

function endInteraction(id) {
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

    if (speed > 0.03) {
      injectFlow(p.x, p.y, vx, vy, 0.18);
      injectWave(p.x, p.y, clamp(speed * 0.002, 0.001, 0.0045), 0.024);
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
let nextAmbientRipple = lastTime + 900;

function render(now) {
  resize();

  const dt = clamp((now - lastTime) / 1000, 1 / 120, 1 / 30);
  lastTime = now;

  stepFlow(dt);
  stepWave();

  if (!prefersReducedMotion && now > nextAmbientRipple) {
    injectWave(
      0.08 + random() * 0.84,
      0.08 + random() * 0.84,
      (random() - 0.5) * 0.003,
      0.02 + random() * 0.018
    );
    nextAmbientRipple = now + 800 + random() * 1700;
  }

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
});

resize();
requestAnimationFrame(render);

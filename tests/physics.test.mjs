import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './harness.mjs';

test('flow does not decay or diffuse when no time has elapsed', () => {
  const app = loadApp();
  assert.equal(app.run(`flowX.fill(0.2); stepFlow(0); flowX[Math.floor(flowH / 2) * flowW + Math.floor(flowW / 2)]`), Math.fround(0.2));
});

test('flow damping is consistent at 30, 60, 120 and 240 Hz', () => {
  const results = [30, 60, 120, 240].map(hz => {
    const app = loadApp();
    return app.run(`flowX.fill(0.2); for(let i=0;i<${hz};i++) stepFlow(1/${hz}); flowX[Math.floor(flowH/2)*flowW+Math.floor(flowW/2)]`);
  });
  assert.ok(Math.max(...results) - Math.min(...results) < 0.00002, JSON.stringify(results));
});

for (const [width, height] of [[1280, 720], [390, 844], [844, 390], [2560, 1080]]) {
  test(`simulation cells remain square at ${width}x${height}`, () => {
    const app = loadApp({ width, height });
    const ratio = app.run('(width / (waveW - 1)) / (height / (waveH - 1))');
    assert.ok(Math.abs(ratio - 1) < 0.03, `cell aspect ${ratio}`);
  });
  test(`koi layer preserves screen aspect at ${width}x${height}`, () => {
    const app = loadApp({ width, height });
    const ratio = app.run('(koiCanvas.width / koiCanvas.height) / (width / height)');
    assert.ok(Math.abs(ratio - 1) < 0.02, `koi aspect ${ratio}`);
  });
}

test('leaf follows the shortest turn across the angle boundary', () => {
  const app = loadApp();
  const delta = app.run(`leaves.length=1; Object.assign(leaves[0], {x:0.5,y:0.5,angle:6.0,spin:0,vx:0.1,vy:0}); const before=leaves[0].angle; drawLeaves(0,1/60); wrapAngle(leaves[0].angle-before);`);
  assert.ok(delta > 0 && delta < 0.1, `turn was ${delta}`);
});

test('portrait koi travel along their visible heading', () => {
  const app = loadApp({ width: 390, height: 844 });
  const ratio = app.run(`koi.length=1; Object.assign(koi[0], {x:0.5,y:0.5,angle:Math.PI/4,turnRate:0,speed:0.03,cruise:0.03}); updateAndDrawKoi(0,0.1); ((koi[0].x-0.5)*width)/((koi[0].y-0.5)*height);`);
  assert.ok(Math.abs(ratio - 1) < 0.01, `heading ratio ${ratio}`);
});

test('tap impulse is circular in screen pixels on a wide viewport', () => {
  const app = loadApp({ width: 1280, height: 720 });
  const values = app.run(`injectWave(0.5,0.5,0.04,0.06); [bilinear(waveVelocity,(0.5+20/width)*(waveW-1),0.5*(waveH-1),waveW,waveH),bilinear(waveVelocity,0.5*(waveW-1),(0.5+20/height)*(waveH-1),waveW,waveH)]`);
  assert.ok(Math.abs(values[0]-values[1]) < 0.001, `impulse ${values}`);
});

test('wave solver stays finite and bounded under repeated input', () => {
  const app = loadApp();
  assert.equal(app.run(`for(let i=0;i<120;i++){injectWave(0.5,0.5,0.08,0.04);stepWave();} waveHeight.every(v=>Number.isFinite(v)&&Math.abs(v)<=0.085001)`), true);
});

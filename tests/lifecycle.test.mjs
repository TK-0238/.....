import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './harness.mjs';

test('hiding the page cancels active gestures and the animation callback', () => {
  const app = loadApp();
  app.run('beginInteraction(1,0.5,0.5,"mouse")');
  app.document.hidden = true; app.document.dispatch('visibilitychange');
  assert.equal(app.run('pointers.size'), 0);
  assert.equal(app.elements.stage.classList.contains('is-stirring'), false);
  assert.equal(app.frames.size, 0);
});

test('showing the page starts exactly one animation callback', () => {
  const app = loadApp();
  app.document.hidden = true; app.document.dispatch('visibilitychange');
  app.document.hidden = false; app.document.dispatch('visibilitychange');
  app.document.dispatch('visibilitychange');
  assert.equal(app.frames.size, 1);
});

test('pointer cancellation does not create a release flick', () => {
  const app = loadApp();
  app.run('beginInteraction(7,0.5,0.5,"mouse")'); app.setTime(16);
  app.run('moveInteraction(7,0.55,0.5,"mouse")');
  const before = app.run('Array.from(waveVelocity)');
  app.elements.stage.dispatch('pointercancel', { pointerId: 7, pointerType: 'mouse' });
  assert.deepEqual(app.run('Array.from(waveVelocity)'), before);
  assert.equal(app.run('pointers.size'), 0);
});

test('lost pointer capture clears the drag without a flick', () => {
  const app = loadApp(); app.run('beginInteraction(2,0.5,0.5,"mouse")');
  app.elements.stage.dispatch('lostpointercapture', { pointerId: 2, pointerType: 'mouse' });
  assert.equal(app.run('pointers.size'), 0);
});

test('window release clears a drag when pointer capture was unavailable', () => {
  const app = loadApp(); app.run('beginInteraction(3,0.5,0.5,"mouse")');
  app.window.dispatch('pointerup', { pointerId: 3, pointerType: 'mouse' });
  assert.equal(app.run('pointers.size'), 0);
});

test('240 Hz rendering does not run physics twice as fast', () => {
  const app = loadApp();
  app.run('globalThis.elapsed=0; stepFlow=dt=>{elapsed+=dt}; stepWave=()=>{}; updateAndDrawKoi=()=>{}; drawLeaves=()=>{}');
  for(let i=1;i<=240;i++) app.frame(i*1000/240);
  const elapsed = app.run('elapsed');
  assert.ok(Math.abs(elapsed-1) < 0.0001, `physics advanced ${elapsed}s`);
});

test('WebGL loss is prevented and rendering is suspended', () => {
  const app = loadApp(); let prevented = false;
  app.elements.water.dispatch('webglcontextlost', { preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(app.frames.size, 0);
  assert.equal(app.elements.unsupported.hidden, false);
});

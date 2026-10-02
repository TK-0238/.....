import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './harness.mjs';

test('empty sensor events do not report motion as working', async () => {
  const app = loadApp({ ios: true });
  await app.run('ensureMotionPermission()');
  app.window.dispatch('devicemotion', { acceleration: {x:null,y:null,z:null}, accelerationIncludingGravity: {x:null,y:null,z:null} });
  assert.equal(app.run('motionState.eventSeen'), false);
});

test('valid stationary sensor values confirm availability without adding slosh', async () => {
  const app = loadApp({ ios: true });
  await app.run('ensureMotionPermission()');
  app.window.dispatch('devicemotion', { acceleration: {x:0,y:0,z:0} });
  assert.equal(app.run('motionState.eventSeen'), true);
  assert.equal(app.run('motionState.sloshEnergy'), 0);
});

test('retry after a no-data timeout returns to sensor-waiting state', async () => {
  const app = loadApp({ ios: true });
  await app.run('ensureMotionPermission()'); app.tick(2500);
  assert.equal(app.elements.motionEnable.dataset.state, 'error');
  assert.equal(await app.run('ensureMotionPermission()'), true);
  assert.equal(app.run('motionState.permission'), 'granted');
  assert.equal(app.elements.motionEnable.disabled, true);
});

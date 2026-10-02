// Execute the real app with only browser I/O stubbed. No duplicated simulation.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
export function loadApp({ width = 1200, height = 800, ios = false } = {}) {
  let now = 0, nextId = 0;
  const frames = new Map(), timers = new Map(), drawCalls = [];
  const noop = () => {};
  const events = (base = {}) => {
    const listeners = new Map();
    return Object.assign(base, {
      addEventListener(type, fn) { const list = listeners.get(type) || []; list.push(fn); listeners.set(type, list); },
      removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) || []).filter(f => f !== fn)); },
      dispatch(type, event = {}) { for (const fn of listeners.get(type) || []) fn({ preventDefault: noop, stopPropagation: noop, ...event }); },
    });
  };
  const classList = () => { const values = new Set(); return {
    add: (...xs) => xs.forEach(x => values.add(x)), remove: (...xs) => xs.forEach(x => values.delete(x)),
    contains: x => values.has(x), toggle: (x, yes = !values.has(x)) => yes ? values.add(x) : values.delete(x),
  }; };
  const context2d = () => new Proxy({
    createLinearGradient: () => ({ addColorStop: noop }), createRadialGradient: () => ({ addColorStop: noop }),
    drawImage: (...args) => drawCalls.push(args),
  }, { get(target, key) { return key in target ? target[key] : noop; } });
  const glCalls = [];
  const gl = new Proxy({
    getShaderParameter: () => true, getProgramParameter: () => true, getExtension: () => null,
    isContextLost: () => false, getError: () => 0, getParameter: () => 4096,
  }, { get(target, key) { if (key in target) return target[key]; if (/^[A-Z_0-9]+$/.test(key)) return key;
    return (...args) => { glCalls.push([key, ...args]); return {}; }; } });
  const element = (id = '') => events({ id, hidden: true, disabled: false, dataset: {}, style: {},
    classList: classList(), textContent: '', width: 0, height: 0,
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
    setAttribute: noop, getAttribute: () => null, setPointerCapture: noop, releasePointerCapture: noop,
    closest() { return null; }, querySelector: () => ({ textContent: '' }),
    getContext(kind) { return kind === 'webgl2' ? gl : context2d(); },
  });
  const elements = Object.fromEntries(['stage', 'water', 'leaves', 'hint', 'motionEnable', 'unsupported', 'pauseToggle']
    .map(id => [id, element(id)]));
  const document = events({ hidden: false, getElementById: id => elements[id] || null,
    createElement: () => element(), body: element('body') });
  const media = events({ matches: false });
  const window = events({ orientation: 0 });
  const sandbox = { document, window, screen: { orientation: { angle: 0 } },
    navigator: { userAgent: ios ? 'iPhone' : 'Test desktop', platform: ios ? 'iPhone' : 'Linux', maxTouchPoints: ios ? 5 : 0 },
    performance: { now: () => now }, matchMedia: () => media, devicePixelRatio: 1,
    requestAnimationFrame: fn => { const id = ++nextId; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout: (fn, delay = 0) => { const id = ++nextId; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout: id => timers.delete(id), console,
    addEventListener: window.addEventListener, removeEventListener: window.removeEventListener,
    Path2D: class { moveTo() {} lineTo() {} bezierCurveTo() {} quadraticCurveTo() {} closePath() {} },
  };
  if (ios) sandbox.DeviceMotionEvent = class { static requestPermission() { return Promise.resolve('granted'); } };
  Object.assign(window, sandbox);
  const context = vm.createContext(sandbox);
  const source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  vm.runInContext(source, context, { filename: 'src/app.js', timeout: 10000 });
  return { context, elements, document, window, media, frames, timers, drawCalls, glCalls, gl,
    run: code => vm.runInContext(code, context, { timeout: 10000 }),
    setTime: value => { now = value; },
    resize(w, h) { width = w; height = h; window.dispatch('resize'); },
    frame(value) { now = value; const pending = [...frames.values()]; frames.clear(); for (const fn of pending) fn(now); },
    tick(value) { now = value; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); } },
  };
}

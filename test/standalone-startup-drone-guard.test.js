import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';

function createMockStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get length() { return map.size; },
    key(idx) { return Array.from(map.keys())[idx] ?? null; },
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
    clear() { map.clear(); }
  };
}

function setupMockJuceDom({ storageEntries = {} } = {}) {
  const elementsById = new Map();
  const listeners = new Map();
  const emittedToNative = [];

  const makeEl = (id, tag = 'div') => {
    const classes = new Set();
    const children = [];
    const el = {
      id,
      tagName: tag.toUpperCase(),
      value: '',
      textContent: '',
      style: {},
      dataset: {},
      children,
      classList: {
        add: (...c) => c.forEach(x => classes.add(x)),
        remove: (...c) => c.forEach(x => classes.delete(x)),
        toggle: (c, force) => {
          const next = force !== undefined ? Boolean(force) : !classes.has(c);
          if (next) classes.add(c);
          else classes.delete(c);
          return next;
        },
        contains: (c) => classes.has(c)
      },
      addEventListener: () => {},
      removeEventListener: () => {},
      appendChild: (child) => { children.push(child); return child; },
      querySelector: (sel) => {
        if (sel === '.braun-status-text') return el._statusText || (el._statusText = makeEl(`${id}-text`, 'span'));
        if (sel === '.braun-led') return el._led || (el._led = makeEl(`${id}-led`, 'span'));
        if (sel === '.braun-vector-canvas') {
          if (!el._vecCanvas) {
            el._vecCanvas = makeEl(`${id}-canvas`, 'canvas');
            el._vecCanvas.getContext = () => ({
              clearRect: () => {}, fillRect: () => {}, beginPath: () => {},
              moveTo: () => {}, lineTo: () => {}, stroke: () => {},
              arc: () => {}, fill: () => {}, fillText: () => {},
              createLinearGradient: () => ({ addColorStop: () => {} })
            });
          }
          return el._vecCanvas;
        }
        if (!el._queries) el._queries = {};
        if (!el._queries[sel]) el._queries[sel] = makeEl(`${id}-${sel}`, 'div');
        return el._queries[sel];
      },
      querySelectorAll: () => [],
      getAttribute: () => null,
      setAttribute: () => {},
      blur: () => {},
      focus: () => {},
      getBoundingClientRect: () => ({ width: 320, height: 140, left: 0, top: 0 })
    };
    return el;
  };

  for (const id of ['btn-power', 'btn-drone1-active', 'btn-drone2-active', 'toggle-freeze', 'toggle-drone-track']) {
    const btn = makeEl(id, 'button');
    btn._statusText = makeEl(`${id}-text`, 'span');
    btn._led = makeEl(`${id}-led`, 'span');
    elementsById.set(id, btn);
  }
  const presetSelect = makeEl('select-preset', 'select');
  presetSelect.value = 'DEFAULT';
  elementsById.set('select-preset', presetSelect);

  const scopeCanvas = makeEl('oscilloscope', 'canvas');
  scopeCanvas.getContext = () => ({
    clearRect: () => {},
    fillRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    arc: () => {},
    fill: () => {},
    fillText: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} })
  });
  elementsById.set('oscilloscope', scopeCanvas);

  const localStorage = createMockStorage(storageEntries);
  const sessionStorage = createMockStorage(storageEntries);

  const backend = {
    addEventListener(eventName, cb) {
      if (!listeners.has(eventName)) listeners.set(eventName, []);
      listeners.get(eventName).push(cb);
    },
    emitEvent(eventName, payload) {
      emittedToNative.push({ eventName, payload });
    }
  };

  globalThis.window = {
    __IS_JUCE__: true,
    __JUCE__: { backend },
    location: { hostname: 'juce.backend' },
    devicePixelRatio: 1,
    localStorage,
    sessionStorage,
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  globalThis.document = {
    readyState: 'complete',
    visibilityState: 'visible',
    activeElement: null,
    body: {
      focus: () => {},
      getAttribute: () => 'light',
      setAttribute: () => {},
      appendChild: () => {},
      removeChild: () => {}
    },
    getElementById: (id) => {
      if (!elementsById.has(id)) {
        elementsById.set(id, makeEl(id, 'div'));
      }
      return elementsById.get(id);
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => makeEl(`dyn-${tag}`, tag),
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  globalThis.atob = (b64) => Buffer.from(b64, 'base64').toString('binary');

  const emitFromNative = (eventName, payload) => {
    for (const cb of (listeners.get(eventName) || [])) {
      cb(payload);
    }
  };

  return { elementsById, emittedToNative, emitFromNative, localStorage, sessionStorage };
}

afterEach(() => {
  delete globalThis.window;
  delete globalThis.document;
});

describe('Standalone WebView2 Startup Drone Disarm & Sync Guard (v1.5.0)', () => {
  it('purges residual WebView2 drone/freeze storage keys and boots with both drones OFF', async () => {
    const { elementsById, emittedToNative, emitFromNative, localStorage, sessionStorage } = setupMockJuceDom({
      storageEntries: {
        braun_drone1_active: 'true',
        drone2Active: '1',
        as42_shimmer_freeze: '1',
        unrelated_user_note: 'keep-me'
      }
    });

    // Simulate active class left on DOM buttons prior to bridge init
    elementsById.get('btn-drone1-active').classList.add('is-active');
    elementsById.get('btn-drone2-active').classList.add('is-active');

    const { AmbientApp } = await import('../js/app.js');
    const app = new AmbientApp();

    // Residual synth keys purged while unrelated keys remain intact
    assert.strictEqual(localStorage.getItem('braun_drone1_active'), null);
    assert.strictEqual(localStorage.getItem('drone2Active'), null);
    assert.strictEqual(sessionStorage.getItem('as42_shimmer_freeze'), null);
    assert.strictEqual(localStorage.getItem('unrelated_user_note'), 'keep-me');

    // Both drones and power start strictly OFF
    assert.strictEqual(app.isPowerOn, false);
    assert.strictEqual(app.engine.droneParams[1].active, false);
    assert.strictEqual(app.engine.droneParams[2].active, false);
    assert.strictEqual(elementsById.get('btn-drone1-active').classList.contains('is-active'), false);
    assert.strictEqual(elementsById.get('btn-drone2-active').classList.contains('is-active'), false);

    // Simulate C++ Standalone startup sync response (Standby, drones disarmed, program 2 restored)
    const countBeforeSync = emittedToNative.length;
    emitFromNative('paramUpdate', { id: 'power', value: 0.0 });
    emitFromNative('paramUpdate', { id: 'drone1_active', value: 0.0 });
    emitFromNative('paramUpdate', { id: 'drone2_active', value: 0.0 });
    emitFromNative('paramUpdate', { id: 'shimmer_freeze', value: 0.0 });
    emitFromNative('paramUpdate', { id: 'currentProgram', value: 2.0 });

    assert.strictEqual(app.isPowerOn, false);
    assert.strictEqual(app.engine.droneParams[1].active, false);
    assert.strictEqual(app.engine.droneParams[2].active, false);
    assert.strictEqual(app.currentPresetKey, 'VANGELIS');
    assert.strictEqual(elementsById.get('select-preset').value, 'VANGELIS');
    assert.strictEqual(emittedToNative.length, countBeforeSync, 'Host sync must not echo paramChange back to C++');
  });

  it('ignores late scopeFrame packets while powered off in Standby', async () => {
    const { emitFromNative } = setupMockJuceDom();
    const { AmbientApp } = await import('../js/app.js');
    const app = new AmbientApp();

    assert.strictEqual(app.isPowerOn, false);
    assert.strictEqual(app.scope.isPowered, false);

    const silentBytes = Buffer.alloc(64, 128).toString('base64');
    emitFromNative('scopeFrame', { l: silentBytes, r: silentBytes });

    assert.strictEqual(app.scope.isPowered, false, 'Standby scope must not wake from in-flight scopeFrame');
  });
});

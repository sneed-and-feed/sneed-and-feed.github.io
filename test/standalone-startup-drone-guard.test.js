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

describe('Standalone WebView2 Startup Drone Disarm, Minimize/Reopen & Power-Off Guard (v1.5.1)', () => {
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

  it('never overwrites C++ APVTS with PRESETS.DEFAULT on WebView boot/reopen and cancels slow strums on power off', async () => {
    const { emittedToNative } = setupMockJuceDom();
    const { AmbientApp } = await import('../js/app.js');
    const { BraunPlaySurface } = await import('../js/ui/keyboard.js');
    const app = new AmbientApp();

    assert.strictEqual(emittedToNative.length, 1,
      `Expected only requestSync on JUCE boot, got: ${JSON.stringify(emittedToNative)}`);
    assert.strictEqual(emittedToNative[0].payload.id, 'requestSync');

    const strip = globalThis.document.getElementById('chime-strip');
    const chords = globalThis.document.getElementById('chord-macros');
    app.playSurface = new BraunPlaySurface(strip, chords, app.engine);
    app.playSurface.setChordSpeed('slow');

    await app.startAudio();
    app.playSurface.playChord('BUDD_FIFTHS');
    await new Promise(r => setTimeout(r, 20));
    await app.togglePower({ emitToNative: true });
    assert.strictEqual(app.isPowerOn, false);

    const emittedCountAtPowerOff = emittedToNative.length;
    await new Promise(r => setTimeout(r, 380));
    const lateNoteOns = emittedToNative.slice(emittedCountAtPowerOff).filter(e => e.eventName === 'noteOn');
    assert.strictEqual(lateNoteOns.length, 0);
    assert.strictEqual(app.isPowerOn, false);
  });

  it('preserves latched Vector Pad, CUSTOM patch, engine knob cache, Freeze disarm, and async startAudio cancellation', async () => {
    const { elementsById, emittedToNative, emitFromNative } = setupMockJuceDom();
    const { AmbientApp } = await import('../js/app.js');
    const app = new AmbientApp();

    const customPatch = {
      format: 'BRAUN_AS42_PATCH',
      version: 1,
      name: 'Minimize Restore Custom',
      knobs: { feltTone: 79, drone2Beat: 2.4 }
    };

    emitFromNative('paramUpdate', { id: 'syncBegin', value: 1.0 });
    emitFromNative('paramUpdate', { id: 'currentProgram', value: 0 });
    emitFromNative('paramUpdate', { id: 'customPatchJson', value: JSON.stringify(customPatch) });
    emitFromNative('paramUpdate', { id: 'felt_tone', value: 0.79 });
    emitFromNative('paramUpdate', { id: 'shimmer_amount', value: 0.64 });
    emitFromNative('paramUpdate', { id: 'drone2_beat', value: 2.40 });
    emitFromNative('paramUpdate', { id: 'drone1_isSubBass', value: 1.0 });
    emitFromNative('paramUpdate', { id: 'vectorMode', value: 'latch' });
    emitFromNative('paramUpdate', { id: 'vectorX', value: 0.82 });
    emitFromNative('paramUpdate', { id: 'vectorY', value: 0.22 });
    emitFromNative('paramUpdate', { id: 'syncEnd', value: 1.0 });

    assert.strictEqual(app.currentPresetKey, 'CUSTOM');
    assert.strictEqual(elementsById.get('select-preset').value, 'CUSTOM');
    assert.strictEqual(app.vectorPad.mode, 'latch');
    assert.strictEqual(app.vectorPad.x, 0.82);
    assert.strictEqual(app.vectorPad.y, 0.22);
    assert.strictEqual(app.engine.droneSnap[1], 'sub-bass');
    assert.strictEqual(app.engine.droneParams[2].beat, 2.40);

    emittedToNative.length = 0;
    app.vectorPad.setCoordinates(0.68, 0.41, true);
    const paramChanges = emittedToNative.filter(e => e.eventName === 'paramChange');
    const vecStates = emittedToNative.filter(e => e.eventName === 'vectorState');
    assert.strictEqual(paramChanges.length, 5);
    assert.strictEqual(vecStates.length, 1);
    assert.strictEqual(vecStates[0].payload.mode, 'latch');

    await app.startAudio();
    app.engine.setReverbFreeze(true);
    app._syncFreezeUI(true);
    assert.strictEqual(elementsById.get('toggle-freeze').classList.contains('is-active'), true);

    emittedToNative.length = 0;
    await app.togglePower({ emitToNative: true });
    assert.strictEqual(app.isPowerOn, false);
    assert.strictEqual(app.engine.reverbParams.freeze, false);
    assert.strictEqual(elementsById.get('toggle-freeze').classList.contains('is-active'), false);
    assert.ok(emittedToNative.some(e => e.eventName === 'paramChange' && e.payload.id === 'shimmer_freeze' && e.payload.value === 0.0));
    assert.strictEqual(app._startingAudioPromise, null);
    await app.togglePower({ emitToNative: true });
    assert.strictEqual(app.isPowerOn, true);
    await app.togglePower({ emitToNative: true });
    assert.strictEqual(app.isPowerOn, false);

    globalThis.window.__IS_JUCE__ = false;
    delete globalThis.window.__JUCE__;
    globalThis.window.location.hostname = 'localhost';
    app.isJuce = false;
    let resolveInit;
    app.engine.init = () => new Promise(r => { resolveInit = r; });
    const startP = app.startAudio({ emitToNative: false });
    assert.strictEqual(app._startingAudio, true);
    await app.togglePower({ emitToNative: false });
    resolveInit();
    await startP;
    assert.strictEqual(app.isPowerOn, false);
  });
});

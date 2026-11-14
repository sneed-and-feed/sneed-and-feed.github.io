/**
 * @file v150-audit-regressions.test.js
 * @brief Comprehensive v1.5.0 Web Audio DSP, MIDI, UI/BFCache reload drone safety, and HTTP server regression suite.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  applySmoothBoundaryKnee,
  makeFreezeLimiterCurve,
  makeShimmerLimiterCurve,
  makeSoftClipCurve,
  makeTapeSaturationCurve,
  makeWavefoldCurve
} from '../js/audio/wavefolder.js';
import { TapeDelay } from '../js/audio/tape-delay.js';
import { ShimmerReverb } from '../js/audio/shimmer-reverb.js';
import { SolarDroneVoice } from '../js/audio/drone-voice.js';
import { FeltPianoVoice, FeltPianoSynthesizer } from '../js/audio/felt-piano.js';
import { AudioEngine } from '../js/audio/engine.js';
import { BraunMidiManager } from '../js/midi/midi-manager.js';
import { AmbientApp } from '../js/app.js';
import { createStaticServer } from '../server.js';

// --- Lightweight Mock Web Audio Infrastructure ---
class MockParam {
  constructor(initial = 0, supportCancelAndHold = true) {
    this._value = initial;
    this.defaultValue = initial;
    this.events = [];
    if (supportCancelAndHold) {
      this.cancelAndHoldAtTime = (t) => {
        this.events.push({ type: 'cancelAndHoldAtTime', t, heldValue: this._value });
        return this;
      };
    }
  }
  get value() { return this._value; }
  set value(v) { this._value = v; }
  setValueAtTime(v, t) {
    this._value = v;
    this.events.push({ type: 'setValueAtTime', v, t });
    return this;
  }
  linearRampToValueAtTime(v, t) {
    this._value = v;
    this.events.push({ type: 'linearRampToValueAtTime', v, t });
    return this;
  }
  exponentialRampToValueAtTime(v, t) {
    this._value = v;
    this.events.push({ type: 'exponentialRampToValueAtTime', v, t });
    return this;
  }
  setTargetAtTime(v, t, tau) {
    this._value = v;
    this.events.push({ type: 'setTargetAtTime', v, t, tau });
    return this;
  }
  cancelScheduledValues(t) {
    this.events.push({ type: 'cancelScheduledValues', t });
    return this;
  }
}

class MockNode {
  constructor() {
    this.connected = [];
    this.disconnected = false;
  }
  connect(dest) {
    this.connected.push(dest);
    return dest;
  }
  disconnect() {
    this.disconnected = true;
    this.connected.length = 0;
  }
}

function createMockAudioContext({ sampleRate = 48000, supportCancelAndHold = true, initialState = 'running' } = {}) {
  const ctx = {
    sampleRate,
    currentTime: 1.0,
    state: initialState,
    resumeCalls: 0,
    suspendCalls: 0,
    destination: new MockNode(),
    bufferSources: [],
    async resume() {
      this.resumeCalls++;
      this.state = 'running';
    },
    async suspend() {
      this.suspendCalls++;
      this.state = 'suspended';
    },
    createGain() {
      const n = new MockNode();
      n.gain = new MockParam(1.0, supportCancelAndHold);
      return n;
    },
    createBiquadFilter() {
      const n = new MockNode();
      n.type = 'lowpass';
      n.frequency = new MockParam(1000, supportCancelAndHold);
      n.Q = new MockParam(1.0, supportCancelAndHold);
      n.gain = new MockParam(0.0, supportCancelAndHold);
      return n;
    },
    createDelay(maxDelay = 1.0) {
      const n = new MockNode();
      n.maxDelay = maxDelay;
      n.delayTime = new MockParam(0.0, supportCancelAndHold);
      return n;
    },
    createWaveShaper() {
      const n = new MockNode();
      n.curve = null;
      n.oversample = 'none';
      return n;
    },
    createOscillator() {
      const n = new MockNode();
      n.type = 'sine';
      n.frequency = new MockParam(440, supportCancelAndHold);
      n.detune = new MockParam(0, supportCancelAndHold);
      n.periodicWave = null;
      n.setPeriodicWave = (w) => { n.periodicWave = w; };
      n.start = () => {};
      n.stop = () => {};
      return n;
    },
    createStereoPanner() {
      const n = new MockNode();
      n.pan = new MockParam(0.0, supportCancelAndHold);
      return n;
    },
    createDynamicsCompressor() {
      const n = new MockNode();
      n.threshold = new MockParam(-12, supportCancelAndHold);
      n.knee = new MockParam(12, supportCancelAndHold);
      n.ratio = new MockParam(4, supportCancelAndHold);
      n.attack = new MockParam(0.003, supportCancelAndHold);
      n.release = new MockParam(0.25, supportCancelAndHold);
      return n;
    },
    createAnalyser() {
      const n = new MockNode();
      n.fftSize = 2048;
      n.frequencyBinCount = 1024;
      n.smoothingTimeConstant = 0.85;
      n.getByteTimeDomainData = (arr) => arr.fill(128);
      n.getByteFrequencyData = (arr) => arr.fill(0);
      return n;
    },
    createConvolver() {
      const n = new MockNode();
      n.normalize = true;
      n.buffer = null;
      return n;
    },
    createChannelSplitter() {
      return new MockNode();
    },
    createChannelMerger() {
      return new MockNode();
    },
    createBuffer(channels, length, sr) {
      const chans = Array.from({ length: channels }, () => new Float32Array(length));
      return {
        numberOfChannels: channels,
        length,
        sampleRate: sr,
        getChannelData: (c) => chans[c] || chans[0]
      };
    },
    createBufferSource() {
      const n = new MockNode();
      n.buffer = null;
      n.loop = false;
      n.onended = null;
      n.start = () => {};
      n.stop = () => {};
      ctx.bufferSources.push(n);
      return n;
    },
    createPeriodicWave(real, imag) {
      return { real, imag };
    }
  };
  return ctx;
}

// --- Minimal DOM Harness for AmbientApp Lifecycle & Reload / BFCache Tests ---
function createMockElement(id = '', tagName = 'DIV') {
  const classes = new Set();
  const attrs = new Map();
  const listeners = new Map();
  const children = [];
  const el = {
    id,
    tagName: tagName.toUpperCase(),
    value: '',
    textContent: '',
    innerHTML: '',
    style: {},
    offsetWidth: 100,
    clientWidth: 288,
    clientHeight: 180,
    children,
    parentElement: null,
    classList: {
      add: (...names) => names.forEach(n => classes.add(n)),
      remove: (...names) => names.forEach(n => classes.delete(n)),
      toggle: (n, force) => {
        const shouldAdd = force !== undefined ? Boolean(force) : !classes.has(n);
        if (shouldAdd) classes.add(n);
        else classes.delete(n);
        return shouldAdd;
      },
      contains: (n) => classes.has(n)
    },
    setAttribute: (k, v) => attrs.set(k, String(v)),
    getAttribute: (k) => attrs.has(k) ? attrs.get(k) : null,
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener: (type, fn) => {
      const arr = listeners.get(type);
      if (!arr) return;
      const idx = arr.indexOf(fn);
      if (idx !== -1) arr.splice(idx, 1);
    },
    dispatchEvent: async (type, eventObj = {}) => {
      const arr = listeners.get(type) || [];
      for (const fn of [...arr]) {
        await fn({ type, target: el, preventDefault() {}, ...eventObj });
      }
    },
    appendChild: (child) => {
      child.parentElement = el;
      children.push(child);
      return child;
    },
    querySelector: (sel) => {
      if (sel === '.braun-led') return children.find(c => c.classList.contains('braun-led')) || null;
      if (sel === '.braun-status-text') return children.find(c => c.classList.contains('braun-status-text')) || null;
      if (sel === '.braun-record-text') return children.find(c => c.classList.contains('braun-record-text')) || null;
      return null;
    },
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 288, height: 180 }),
    blur: () => {},
    focus: () => {},
    click: async () => {
      await el.dispatchEvent('click');
    }
  };
  return el;
}

function createButtonWithLedAndText(id, initialText, initiallyActive = false) {
  const btn = createMockElement(id, 'BUTTON');
  const led = createMockElement(`${id}-led`, 'SPAN');
  led.classList.add('braun-led');
  const txt = createMockElement(`${id}-text`, 'SPAN');
  txt.classList.add('braun-status-text');
  txt.textContent = initialText;
  if (initiallyActive) {
    btn.classList.add('is-active');
    led.classList.add('is-active');
  }
  btn.appendChild(led);
  btn.appendChild(txt);
  return { btn, led, txt };
}

function createStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key: (i) => Array.from(map.keys())[i] ?? null,
    getItem: (k) => map.has(k) ? map.get(k) : null,
    setItem: (k, v) => map.set(String(k), String(v)),
    removeItem: (k) => map.delete(String(k)),
    clear: () => map.clear()
  };
}

function installMockBrowserEnv(MockAudioCtxClass) {
  const savedWindow = globalThis.window;
  const savedDocument = globalThis.document;
  const savedAudioContext = globalThis.AudioContext;

  const elementsById = new Map();
  const register = (el) => {
    if (el.id) elementsById.set(el.id, el);
    return el;
  };

  const power = createButtonWithLedAndText('btn-power', 'SYSTEM ON', true);
  const drone1 = createButtonWithLedAndText('btn-drone1-active', 'DRONE 1 ON', true);
  const drone2 = createButtonWithLedAndText('btn-drone2-active', 'DRONE 2 ON', true);
  const freeze = createButtonWithLedAndText('toggle-freeze', 'FREEZE ON', true);
  const evolve = createButtonWithLedAndText('toggle-auto-evolve', 'AUTO EVOLVE ON', true);
  const loops = createButtonWithLedAndText('toggle-phase-loops', 'AIRPORTS LOOPS ON', true);
  const resetBtn = createMockElement('btn-reset-all', 'BUTTON');

  const presetSelect = createMockElement('select-preset', 'SELECT');
  presetSelect.value = 'VANGELIS'; // Simulate soft-reload form restoration mutating select before JS boot
  const scaleSelect = createMockElement('select-scale', 'SELECT');
  const rootSelect = createMockElement('select-root', 'SELECT');
  const tuningSelect = createMockElement('select-tuning', 'SELECT');
  tuningSelect.value = '432';
  const themeSelect = createMockElement('select-theme', 'SELECT');
  themeSelect.value = 'light';

  [
    power.btn, drone1.btn, drone2.btn, freeze.btn, evolve.btn, loops.btn,
    resetBtn, presetSelect, scaleSelect, rootSelect, tuningSelect, themeSelect
  ].forEach(register);

  const snapBtns1 = ['sub-bass', 'deep-tonic', 'warm-root', 'octave-up'].map(snap => {
    const b = createMockElement('', 'BUTTON');
    b.classList.add('drone1-snap-btn');
    b.setAttribute('data-snap', snap);
    return b;
  });

  const docListeners = new Map();
  const winListeners = new Map();
  const body = createMockElement('body', 'BODY');

  const mockDocument = {
    readyState: 'complete',
    visibilityState: 'visible',
    hidden: false,
    body,
    activeElement: body,
    getElementById: (id) => {
      if (elementsById.has(id)) return elementsById.get(id);
      if (typeof id === 'string' && id.startsWith('knob-')) {
        const knobContainer = createMockElement(id, 'DIV');
        elementsById.set(id, knobContainer);
        return knobContainer;
      }
      return null;
    },
    createElement: (tag) => createMockElement('', tag),
    querySelector: () => null,
    querySelectorAll: (sel) => {
      if (sel === '.drone1-snap-btn') return snapBtns1;
      if (sel === 'select, .braun-select') return [presetSelect, scaleSelect, rootSelect, tuningSelect, themeSelect];
      if (sel === 'button') return [power.btn, drone1.btn, drone2.btn, freeze.btn, evolve.btn, loops.btn, resetBtn, ...snapBtns1];
      return [];
    },
    addEventListener: (type, fn) => {
      if (!docListeners.has(type)) docListeners.set(type, []);
      docListeners.get(type).push(fn);
    },
    removeEventListener: () => {},
    emit: async (type, ev = {}) => {
      for (const fn of (docListeners.get(type) || [])) {
        await fn({ type, ...ev });
      }
    }
  };

  const localStorage = createStorage();
  const sessionStorage = createStorage();
  localStorage.setItem('braun_drone1_active', 'true');
  sessionStorage.setItem('as42_power_latch', '1');

  const mockWindow = {
    AudioContext: MockAudioCtxClass,
    localStorage,
    sessionStorage,
    devicePixelRatio: 1,
    location: { hostname: 'localhost' },
    addEventListener: (type, fn) => {
      if (!winListeners.has(type)) winListeners.set(type, []);
      winListeners.get(type).push(fn);
    },
    removeEventListener: () => {},
    emit: async (type, ev = {}) => {
      for (const fn of (winListeners.get(type) || [])) {
        await fn({ type, ...ev });
      }
    }
  };

  globalThis.window = mockWindow;
  globalThis.document = mockDocument;
  globalThis.AudioContext = MockAudioCtxClass;

  return {
    ui: { power, drone1, drone2, freeze, evolve, loops, presetSelect, tuningSelect, snapBtns1, resetBtn },
    localStorage,
    sessionStorage,
    mockWindow,
    mockDocument,
    restore() {
      if (savedWindow === undefined) delete globalThis.window;
      else globalThis.window = savedWindow;
      if (savedDocument === undefined) delete globalThis.document;
      else globalThis.document = savedDocument;
      if (savedAudioContext === undefined) delete globalThis.AudioContext;
      else globalThis.AudioContext = savedAudioContext;
    }
  };
}

describe('v1.5.0 Deep Audit Regression Suite', () => {
  let cleanupEnv = null;
  afterEach(() => {
    if (cleanupEnv) {
      cleanupEnv();
      cleanupEnv = null;
    }
  });

  describe('1. Reload, BFCache, Visibility & Drone Toggle State Synchronization (Board #9)', () => {
    it('disarms drones, freeze, power, storage latches, and form-restored selects on cold boot / soft reload', () => {
      const env = installMockBrowserEnv(function() { return createMockAudioContext(); });
      cleanupEnv = () => env.restore();

      const app = new AmbientApp();

      assert.strictEqual(app.isPowerOn, false, 'Cold boot must stay in standby (isPowerOn === false)');
      assert.strictEqual(app.engine.ctx, null, 'AudioContext must not be instantiated on cold boot');
      assert.strictEqual(app.engine.droneParams[1].active, false, 'Drone 1 must be disarmed on boot');
      assert.strictEqual(app.engine.droneParams[2].active, false, 'Drone 2 must be disarmed on boot');

      // UI buttons AND LEDs must strictly match engine disarmed state even if HTML/form-restore had is-active
      assert.strictEqual(env.ui.drone1.btn.classList.contains('is-active'), false);
      assert.strictEqual(env.ui.drone1.led.classList.contains('is-active'), false);
      assert.strictEqual(env.ui.drone1.txt.textContent, 'DRONE 1 OFF');

      assert.strictEqual(env.ui.drone2.btn.classList.contains('is-active'), false);
      assert.strictEqual(env.ui.drone2.led.classList.contains('is-active'), false);
      assert.strictEqual(env.ui.drone2.txt.textContent, 'DRONE 2 OFF');

      assert.strictEqual(env.ui.freeze.btn.classList.contains('is-active'), false);
      assert.strictEqual(env.ui.freeze.led.classList.contains('is-active'), false);
      assert.strictEqual(env.ui.freeze.txt.textContent, 'FREEZE OFF');

      assert.strictEqual(env.ui.power.btn.classList.contains('is-active'), false);
      assert.strictEqual(env.ui.power.txt.textContent, 'POWER ON');
      assert.strictEqual(env.ui.presetSelect.value, 'DEFAULT', 'Soft-reload form-restored preset select must reset to DEFAULT');

      assert.strictEqual(env.localStorage.getItem('braun_drone1_active'), null, 'Residual drone localStorage keys must be purged');
      assert.strictEqual(env.sessionStorage.getItem('as42_power_latch'), null, 'Residual power sessionStorage keys must be purged');
    });

    it('never resumes suspended AudioContext on visibilitychange or non-persisted pageshow when manually powered off', async () => {
      let lastCtx = null;
      const env = installMockBrowserEnv(function() {
        lastCtx = createMockAudioContext({ initialState: 'running' });
        return lastCtx;
      });
      cleanupEnv = () => env.restore();

      const app = new AmbientApp();
      await app.startAudio();
      assert.strictEqual(app.isPowerOn, true);

      // Power down manually
      await app.togglePower();
      assert.strictEqual(app.isPowerOn, false);
      assert.strictEqual(lastCtx.state, 'suspended');
      const resumesBefore = lastCtx.resumeCalls;

      // Simulate tab switch hidden -> visible while powered off
      env.mockDocument.visibilityState = 'hidden';
      await env.mockDocument.emit('visibilitychange');
      env.mockDocument.visibilityState = 'visible';
      await env.mockDocument.emit('visibilitychange');
      await env.mockWindow.emit('pageshow', { persisted: false });

      assert.strictEqual(lastCtx.resumeCalls, resumesBefore, 'Must NEVER call ctx.resume() when isPowerOn is false');
      assert.strictEqual(lastCtx.state, 'suspended');
    });

    it('disarms active drones, quenches freeze, and returns to standby on BFCache pageshow (event.persisted === true)', async () => {
      let lastCtx = null;
      const env = installMockBrowserEnv(function() {
        lastCtx = createMockAudioContext({ initialState: 'running' });
        return lastCtx;
      });
      cleanupEnv = () => env.restore();

      const app = new AmbientApp();
      await env.ui.drone1.btn.click();
      await env.ui.drone2.btn.click();
      await env.ui.freeze.btn.click();

      assert.strictEqual(app.isPowerOn, true);
      assert.strictEqual(app.engine.droneParams[1].active, true);
      assert.strictEqual(app.engine.droneParams[2].active, true);
      assert.strictEqual(env.ui.drone1.led.classList.contains('is-active'), true);
      assert.strictEqual(env.ui.freeze.led.classList.contains('is-active'), true);

      // Simulate BFCache restore (browser Back/Forward navigation restoring frozen page)
      await env.mockWindow.emit('pageshow', { persisted: true });

      assert.strictEqual(app.isPowerOn, false, 'BFCache restore must return system to standby');
      assert.strictEqual(app.engine.droneParams[1].active, false, 'BFCache restore must disarm Drone 1');
      assert.strictEqual(app.engine.droneParams[2].active, false, 'BFCache restore must disarm Drone 2');
      assert.strictEqual(app.engine.drone1.isActive, false);
      assert.strictEqual(app.engine.drone2.isActive, false);
      assert.strictEqual(app.engine.reverbParams.freeze, false);

      assert.strictEqual(env.ui.drone1.btn.classList.contains('is-active'), false);
      assert.strictEqual(env.ui.drone1.led.classList.contains('is-active'), false);
      assert.strictEqual(env.ui.drone1.txt.textContent, 'DRONE 1 OFF');
      assert.strictEqual(env.ui.drone2.btn.classList.contains('is-active'), false);
      assert.strictEqual(env.ui.drone2.led.classList.contains('is-active'), false);
      assert.strictEqual(env.ui.freeze.btn.classList.contains('is-active'), false);
      assert.strictEqual(env.ui.freeze.led.classList.contains('is-active'), false);
      assert.strictEqual(lastCtx.state, 'suspended', 'AudioContext must be suspended after BFCache restore');
    });

    it('prevents UI/engine drone desync on rapid pre-boot double-click while async startAudio() is in-flight', async () => {
      let resolveResume;
      let createdCtx = null;
      const env = installMockBrowserEnv(function() {
        createdCtx = createMockAudioContext({ initialState: 'suspended' });
        createdCtx.resume = () => new Promise(res => {
          resolveResume = () => {
            createdCtx.state = 'running';
            res();
          };
        });
        return createdCtx;
      });
      cleanupEnv = () => env.restore();

      const app = new AmbientApp();

      // Click 1 turns Drone 1 ON and begins async startAudio()
      const click1Promise = env.ui.drone1.btn.click();
      // Click 2 immediately turns Drone 1 back OFF before AudioContext finishes resuming
      const click2Promise = env.ui.drone1.btn.click();

      assert.strictEqual(app.engine.droneParams[1].active, false, 'Committed state after ON->OFF double-click must be false');
      assert.strictEqual(env.ui.drone1.btn.classList.contains('is-active'), false);
      assert.strictEqual(env.ui.drone1.led.classList.contains('is-active'), false);

      // Now let AudioContext.resume() complete
      if (resolveResume) resolveResume();
      await Promise.all([click1Promise, click2Promise]);

      assert.strictEqual(app.engine.droneParams[1].active, false);
      assert.strictEqual(app.engine.drone1.isActive, false);
      assert.strictEqual(app.engine.drone1.voiceGain.gain.value, 0, 'Drone 1 gain must be strictly 0.0 after ON->OFF double-click');
      assert.strictEqual(env.ui.drone1.btn.classList.contains('is-active'), false);
      assert.strictEqual(env.ui.drone1.led.classList.contains('is-active'), false);
      assert.strictEqual(env.ui.drone1.txt.textContent, 'DRONE 1 OFF');
    });

    it('clears freeze orange LED as well as button state in resetAllKnobs()', async () => {
      const env = installMockBrowserEnv(function() { return createMockAudioContext(); });
      cleanupEnv = () => env.restore();

      const app = new AmbientApp();
      await app.startAudio();
      await env.ui.freeze.btn.click();
      assert.strictEqual(env.ui.freeze.btn.classList.contains('is-active'), true);
      assert.strictEqual(env.ui.freeze.led.classList.contains('is-active'), true);

      app.resetAllKnobs({ animate: false, duration: 0 });
      assert.strictEqual(env.ui.freeze.btn.classList.contains('is-active'), false);
      assert.strictEqual(env.ui.freeze.led.classList.contains('is-active'), false, 'Freeze LED must extinguish on resetAllKnobs()');
      assert.strictEqual(env.ui.freeze.txt.textContent, 'FREEZE OFF');
    });
  });

  describe('2. Waveshaper & Limiter Boundary Monotonicity & NaN Guards', () => {
    it('clamps applySmoothBoundaryKnee monotonically at +/-1.0 without cubic foldback or divergence', () => {
      assert.strictEqual(applySmoothBoundaryKnee(1.0, 0.70), 1.0);
      assert.strictEqual(applySmoothBoundaryKnee(1.5, 0.70), 1.0);
      assert.strictEqual(applySmoothBoundaryKnee(10.0, 0.70), 1.0);
      assert.strictEqual(applySmoothBoundaryKnee(-1.0, 0.70), -1.0);
      assert.strictEqual(applySmoothBoundaryKnee(-5.0, 0.70), -1.0);
      assert.strictEqual(applySmoothBoundaryKnee(NaN, 0.70), 0.0);

      let prev = -1.0;
      for (let i = 0; i <= 400; i++) {
        const y = -2.0 + (4.0 * i) / 400;
        const out = applySmoothBoundaryKnee(y, 0.70);
        assert.ok(out >= prev - 1e-9, `applySmoothBoundaryKnee must be monotonic at y=${y} (${out} < ${prev})`);
        assert.ok(out >= -1.0 && out <= 1.0);
        prev = out;
      }
    });

    it('produces strictly monotonic freeze & shimmer limiter curves reaching exact ceiling without folding down', () => {
      const freezeCurve = makeFreezeLimiterCurve(2048, 0.88, 0.70);
      for (let i = 1; i < freezeCurve.length; i++) {
        assert.ok(
          freezeCurve[i] >= freezeCurve[i - 1] - 1e-6,
          `Freeze limiter folded downward at idx ${i}: ${freezeCurve[i]} < ${freezeCurve[i - 1]}`
        );
      }
      assert.ok(Math.abs(freezeCurve[2047] - 0.88) < 1e-5, `Expected +0.88 ceiling at +1.0, got ${freezeCurve[2047]}`);
      assert.ok(Math.abs(freezeCurve[0] + 0.88) < 1e-5, `Expected -0.88 floor at -1.0, got ${freezeCurve[0]}`);

      const shimmerCurve = makeShimmerLimiterCurve(2048, 0.85, 0.70);
      assert.ok(Math.abs(shimmerCurve[2047] - 0.85) < 1e-5);
    });

    it('guards all curve generators against drive=0, NaN, and Infinity inputs', () => {
      const zeroDriveSoft = makeSoftClipCurve(128, 0);
      const nanSoft = makeSoftClipCurve(128, NaN);
      const nanFold = makeWavefoldCurve(128, NaN, Infinity);
      const nanTape = makeTapeSaturationCurve(128, NaN);
      for (const curve of [zeroDriveSoft, nanSoft, nanFold, nanTape]) {
        for (let i = 0; i < curve.length; i++) {
          assert.ok(Number.isFinite(curve[i]), 'Curve sample must be finite');
          assert.ok(curve[i] >= -1.0 && curve[i] <= 1.0, 'Curve sample must stay within [-1, 1]');
        }
      }
    });
  });

  describe('3. Sustain Pedal (CC 64), Stolen-Voice triggerId, Cold-Wake Note & Hot-Unplug', () => {
    it('sustains FeltPianoVoice on real AudioEngine when CC 64 is down and releases cleanly on pedal lift', async () => {
      const savedAudioCtx = globalThis.AudioContext;
      globalThis.AudioContext = function() { return createMockAudioContext(); };
      cleanupEnv = () => {
        if (savedAudioCtx === undefined) delete globalThis.AudioContext;
        else globalThis.AudioContext = savedAudioCtx;
      };

      const engine = new AudioEngine();
      await engine.init();
      const midi = new BraunMidiManager(engine);

      // Engage sustain pedal (CC 64 = 127), play C4 (60), release key 60
      midi.handleMidiMessage({ data: [0xB0, 64, 127] });
      midi.handleMidiMessage({ data: [0x90, 60, 100] });
      const soundingVoice = engine.feltPiano.voices.find(v => v.isActive);
      assert.ok(soundingVoice, 'Voice must be active on NoteOn');

      midi.handleMidiMessage({ data: [0x80, 60, 0] });
      assert.strictEqual(soundingVoice._isReleased, false, 'Pedal-latched voice must NOT release on NoteOff while CC 64 is held');
      assert.strictEqual(soundingVoice.isHold, true, 'Pedal-latched voice must remain held until pedal lift');

      // Lift sustain pedal (CC 64 = 0)
      midi.handleMidiMessage({ data: [0xB0, 64, 0] });
      assert.strictEqual(soundingVoice._isReleased, true, 'Pedal-latched voice must enter release envelope when CC 64 lifts');
    });

    it('protects stolen voices via triggerId so lifting sustain pedal never cuts off newer stealing notes', async () => {
      const savedAudioCtx = globalThis.AudioContext;
      globalThis.AudioContext = function() { return createMockAudioContext(); };
      cleanupEnv = () => {
        if (savedAudioCtx === undefined) delete globalThis.AudioContext;
        else globalThis.AudioContext = savedAudioCtx;
      };

      const engine = new AudioEngine();
      await engine.init();
      // Shrink pool to 1 voice to force deterministic voice stealing
      engine.feltPiano.voices = [engine.feltPiano.voices[0]];
      const singleVoice = engine.feltPiano.voices[0];
      const midi = new BraunMidiManager(engine);

      midi.handleMidiMessage({ data: [0xB0, 64, 127] });
      midi.handleMidiMessage({ data: [0x90, 60, 100] });
      const firstTriggerId = singleVoice.triggerId;
      midi.handleMidiMessage({ data: [0x80, 60, 0] }); // Note 60 is now pedal-latched on singleVoice

      // Hold a new physical note 72, stealing singleVoice
      midi.handleMidiMessage({ data: [0x90, 72, 110] });
      assert.ok(singleVoice.triggerId > firstTriggerId, 'Re-triggering must advance voice.triggerId');
      assert.strictEqual(singleVoice._isReleased, false);

      // Lift sustain pedal while note 72 is still physically held
      midi.handleMidiMessage({ data: [0xB0, 64, 0] });
      assert.strictEqual(singleVoice._isReleased, false, 'Lifting pedal must NOT release voice stolen by physically held note 72');
    });

    it('preserves first MIDI note during async cold-wake and cancels cleanly if NoteOff arrives early', async () => {
      let finishWake;
      const mockEngine = {
        a4: 440,
        ctx: null,
        feltPiano: null,
        playedNotes: [],
        noteOn(note, vel) {
          this.playedNotes.push({ note, vel });
          return { currentMidi: note, triggerId: 1, release() {} };
        },
        noteOff() {}
      };
      const mockApp = {
        isPowerOn: false,
        startAudio: () => new Promise(res => {
          finishWake = () => {
            mockApp.isPowerOn = true;
            mockEngine.feltPiano = { playNote: () => {} };
            res();
          };
        })
      };

      const midi = new BraunMidiManager(mockEngine, mockApp);
      // Note 60 tapped & released before wake completes; Note 64 held across wake
      midi.handleMidiMessage({ data: [0x90, 60, 100] });
      midi.handleMidiMessage({ data: [0x80, 60, 0] });
      midi.handleMidiMessage({ data: [0x90, 64, 100] });

      finishWake();
      await new Promise(r => setTimeout(r, 10));

      assert.strictEqual(mockEngine.playedNotes.length, 1, 'Only still-held note 64 must sound after async cold wake');
      assert.strictEqual(mockEngine.playedNotes[0].note, 64);
    });

    it('releases held notes and sustain latch when a USB MIDI input port disconnects mid-performance', async () => {
      const savedAudioCtx = globalThis.AudioContext;
      globalThis.AudioContext = function() { return createMockAudioContext(); };
      cleanupEnv = () => {
        if (savedAudioCtx === undefined) delete globalThis.AudioContext;
        else globalThis.AudioContext = savedAudioCtx;
      };

      const engine = new AudioEngine();
      await engine.init();
      const midi = new BraunMidiManager(engine);

      const usbPort = {
        type: 'input',
        state: 'connected',
        addEventListener() {},
        removeEventListener() {}
      };
      midi._handleStateChange({ port: usbPort });

      midi.handleMidiMessage({ target: usbPort, data: [0xB0, 64, 127] });
      midi.handleMidiMessage({ target: usbPort, data: [0x90, 67, 100] });
      const voice = engine.feltPiano.voices.find(v => v.isActive);
      assert.ok(voice);
      assert.strictEqual(voice._isReleased, false);

      // Hot-unplug USB MIDI controller while key + pedal are down
      usbPort.state = 'disconnected';
      midi._handleStateChange({ port: usbPort });

      assert.strictEqual(midi.isSustainDown, false, 'Unplugging sustain port must release sustain pedal');
      assert.strictEqual(engine._heldNotes.has(67), false, 'Unplugging port must clear held note from engine');
      assert.strictEqual(voice._isReleased, true, 'Unplugging port must release sounding voice');
    });

    it('releases all overlapping voices for the same note on noteOff() and setSustainPedal(false) without stuck voices', async () => {
      const savedAudioCtx = globalThis.AudioContext;
      globalThis.AudioContext = function() { return createMockAudioContext(); };
      cleanupEnv = () => {
        if (savedAudioCtx === undefined) delete globalThis.AudioContext;
        else globalThis.AudioContext = savedAudioCtx;
      };

      const engine = new AudioEngine();
      await engine.init();

      // Case A: Overlapping strikes on held note 60 followed by CC 64 latch + pedal release
      const v0 = engine.noteOn(60, 0.75, 20.0, true);
      const v1 = engine.noteOn(60, 0.85, 20.0, true);
      assert.ok(v0 && v1 && v0 !== v1, 'Overlapping held noteOn(60) must allocate two distinct voices');
      assert.strictEqual(v0._isReleased, false);
      assert.strictEqual(v1._isReleased, false);

      engine.setSustainPedal(true);
      engine.noteOff(60);
      assert.strictEqual(v0._isReleased, false, 'v0 must remain latched while CC 64 is down');
      assert.strictEqual(v1._isReleased, false, 'v1 must remain latched while CC 64 is down');

      engine.setSustainPedal(false);
      assert.strictEqual(v0._isReleased, true, 'First overlapping voice v0 must release when sustain pedal lifts');
      assert.strictEqual(v1._isReleased, true, 'Second overlapping voice v1 must release when sustain pedal lifts');

      // Case B: Overlapping strikes on held note 64 with pedal UP released via noteOff(64)
      const u0 = engine.noteOn(64, 0.70, 20.0, true);
      const u1 = engine.noteOn(64, 0.80, 20.0, true);
      assert.ok(u0 && u1 && u0 !== u1);
      engine.noteOff(64);
      assert.strictEqual(u0._isReleased, true, 'u0 must release on direct noteOff(64)');
      assert.strictEqual(u1._isReleased, true, 'u1 must release on direct noteOff(64)');
    });

    it('explicitly releases orphaned pedal-latched voice on re-strike when concert tuning changes (440 <-> 432 Hz)', async () => {
      const savedAudioCtx = globalThis.AudioContext;
      globalThis.AudioContext = function() { return createMockAudioContext(); };
      cleanupEnv = () => {
        if (savedAudioCtx === undefined) delete globalThis.AudioContext;
        else globalThis.AudioContext = savedAudioCtx;
      };

      const engine = new AudioEngine();
      await engine.init();

      // Strike A4 (69) at 440 Hz and latch with sustain pedal
      engine.setSustainPedal(true);
      const latched440Voice = engine.noteOn(69, 0.80, 20.0, true);
      assert.ok(latched440Voice);
      engine.noteOff(69);
      assert.strictEqual(latched440Voice._isReleased, false);
      assert.strictEqual(latched440Voice.isHold, true);

      // Change reference pitch 440 -> 432 Hz while note 69 is pedal-latched, then re-strike note 69
      engine.setTuningReference(432);
      const restruck432Voice = engine.noteOn(69, 0.85, 20.0, true);
      assert.ok(restruck432Voice && restruck432Voice !== latched440Voice, 'Retuned re-strike must allocate a 432 Hz voice');
      assert.strictEqual(
        latched440Voice._isReleased,
        true,
        'Prior 440 Hz pedal-latched voice must be explicitly released rather than orphaned at sustainLevel'
      );
      assert.strictEqual(restruck432Voice._isReleased, false, 'Newly struck 432 Hz voice must stay active while held');

      engine.setSustainPedal(false);
      engine.noteOff(69);
      assert.strictEqual(restruck432Voice._isReleased, true);
    });
  });

  describe('4. FeltPiano Bass Decay, Active updateDecay() & Hammer Buffer Disconnect', () => {
    it('updates active non-held ringing envelopes in updateDecay() with bass register multiplier and disconnects hammer source onended', () => {
      const ctx = createMockAudioContext();
      const synth = new FeltPianoSynthesizer(ctx, null, 4);

      // Trigger bass note C2 (65.41 Hz, MIDI 36) non-held
      const bassVoice = synth.playNote(65.41, 0.8, 3.5, false, false);
      // Trigger mid note C4 (261.63 Hz, MIDI 60) non-held
      const midVoice = synth.playNote(261.63, 0.8, 3.5, false, false);

      // Advance past sustain phase (1.0 + 0.8s)
      ctx.currentTime = 2.0;
      synth.setDecay(2.2);

      assert.ok(
        bassVoice._lastDecayEndTarget > midVoice._lastDecayEndTarget,
        `Bass register decay end (${bassVoice._lastDecayEndTarget}) must exceed mid register (${midVoice._lastDecayEndTarget})`
      );

      // Verify hammer noiseSource.onended disconnects one-shot buffer node
      const hammerSrc = ctx.bufferSources.find(s => typeof s.onended === 'function');
      assert.ok(hammerSrc, 'Hammer BufferSource must attach onended cleanup');
      hammerSrc.onended();
      assert.strictEqual(hammerSrc.disconnected, true, 'Hammer BufferSource must disconnect in onended');

      synth.releaseAllNotes();
    });
  });

  describe('5. Sub-Bass Power-Cycle Gain Trim & Host Discrete Sync', () => {
    it('preserves 1.70x Sub-Bass gain compensation across powerOff() -> init() cycle and syncs drone1SubBass via JUCE bridge', async () => {
      let lastCtx = null;
      const env = installMockBrowserEnv(function() {
        lastCtx = createMockAudioContext();
        return lastCtx;
      });
      env.mockWindow.__JUCE__ = {
        backend: {
          listeners: {},
          addEventListener(ev, fn) { this.listeners[ev] = fn; },
          emitEvent() {}
        }
      };
      cleanupEnv = () => env.restore();

      // Part A: Pure Web AudioEngine power-cycle Sub-Bass gain trim test
      const engine = new AudioEngine();
      await engine.init();
      engine.setDroneSnap(1, 'sub-bass');
      engine.setDroneVolume(1, 0.50);
      engine.setDroneActive(1, true);
      assert.strictEqual(engine.drone1.subBassGainTrim, 1.70);

      await engine.powerOff();
      await engine.init();

      const expectedSubGain = 0.50 * 1.70;
      assert.ok(
        Math.abs(engine.drone1.voiceGain.gain.value - expectedSubGain) < 1e-4,
        `Expected resumed Sub-Bass gain ${expectedSubGain}, got ${engine.drone1.voiceGain.gain.value}`
      );

      // Part B: JUCE paramUpdate drone1SubBass sync
      const app = new AmbientApp();
      app.engine.drone1 = new SolarDroneVoice(createMockAudioContext(), new MockNode(), null, 1);
      env.mockWindow.__JUCE__.backend.listeners.paramUpdate({ id: 'drone1SubBass', value: 1 });
      assert.strictEqual(app.engine.drone1.isSubBass, true);
      assert.strictEqual(app.engine.drone1.subBassGainTrim, 1.70);
      const subSnapBtn = env.ui.snapBtns1.find(b => b.getAttribute('data-snap') === 'sub-bass');
      assert.strictEqual(subSnapBtn.classList.contains('is-active'), true);
    });
  });

  describe('6. Firefox Anchored Scheduling, RT60 Shimmer Scaling & Low-SR Nyquist Clamping', () => {
    it('preserves RT60 decayScale in setShimmer(), anchors Firefox fallback ramps, and clamps filters below Nyquist at 22050 Hz', () => {
      // Firefox-style context without cancelAndHoldAtTime at low 22050 Hz sample rate
      const lowSrCtx = createMockAudioContext({ sampleRate: 22050, supportCancelAndHold: false });
      const nyquistCeiling = 22050 * 0.49; // 10804.5 Hz

      const delay = new TapeDelay(lowSrCtx);
      delay.setTone(16000);
      assert.ok(delay.filterL.frequency.value <= nyquistCeiling, 'TapeDelay cutoff must clamp <= 0.49 * sampleRate');
      assert.ok(delay.filterL.frequency.events.some(e => e.type === 'setValueAtTime'), 'Firefox fallback must anchor setValueAtTime');

      const reverb = new ShimmerReverb(lowSrCtx);
      reverb.setDamping(0.05); // Requests 18000 Hz raw cutoff
      assert.ok(reverb.dampingFilter.frequency.value <= nyquistCeiling, 'ShimmerReverb dampingFilter must clamp <= Nyquist');

      reverb.setDecay(15.0, true);
      reverb.setShimmer(0.60);
      const unscaled = 0.2 + 0.60 * 0.45; // 0.47
      assert.ok(
        reverb.shimmerFeedback.gain.value > unscaled + 0.05,
        `setShimmer must preserve 15s RT60 decayScale (${reverb.shimmerFeedback.gain.value} vs unscaled ${unscaled})`
      );

      const drone = new SolarDroneVoice(lowSrCtx, lowSrCtx.destination, null, 1);
      drone.setCutoff(14000);
      assert.ok(drone.filter1.frequency.value <= nyquistCeiling, 'SolarDroneVoice cutoff must clamp <= Nyquist');

      // Rapid OFF -> ON fade-out live gain reading check
      drone.isActive = false;
      drone.voiceGain.gain.value = 0.34; // Mid fade-out
      assert.ok(Math.abs(drone._getInstantGain(lowSrCtx.currentTime) - 0.34) < 1e-6, 'Must read live fade-out gain instead of snapping to 0.0001');

      const felt = new FeltPianoSynthesizer(lowSrCtx, null, 2);
      const v = felt.playNote(1200, 1.0, 2.0, false, false);
      assert.ok(v.filter1.frequency.value <= nyquistCeiling, 'FeltPianoVoice filter must clamp <= Nyquist');
      felt.releaseAllNotes();
      drone.dispose();
      reverb.dispose();
      delay.dispose();
    });
  });

  describe('7. Static HTTP Server Hardening (server.js)', () => {
    it('serves GET & HEAD cleanly, blocks encoded path traversal & dotfiles, and rejects malformed URLs / unsupported methods', async () => {
      const srv = createStaticServer();
      await new Promise(resolve => srv.listen(0, '127.0.0.1', resolve));
      const { port } = srv.address();

      const request = (method, reqPath) => new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, method, path: reqPath }, (res) => {
          const chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf-8')
          }));
        });
        req.on('error', reject);
        req.end();
      });

      try {
        const getRoot = await request('GET', '/');
        assert.strictEqual(getRoot.status, 200);
        assert.ok(getRoot.headers['content-type'].includes('text/html'));
        assert.ok(getRoot.body.includes('BRAUN'));

        const headManifest = await request('HEAD', '/manifest.json');
        assert.strictEqual(headManifest.status, 200);
        assert.ok(Number(headManifest.headers['content-length']) > 0);
        assert.strictEqual(headManifest.body, '', 'HEAD response must have empty body');

        const traversal = await request('GET', '/%2e%2e/%2e%2e/Windows/win.ini');
        assert.strictEqual(traversal.status, 403, 'Encoded directory traversal must be blocked with 403');

        const dotGit = await request('GET', '/.git/HEAD');
        assert.strictEqual(dotGit.status, 403, 'Dot-directory access must be blocked with 403');

        const badPercent = await request('GET', '/%ZZinvalid');
        assert.strictEqual(badPercent.status, 400, 'Malformed URI percent-encoding must return 400');

        const postMethod = await request('POST', '/index.html');
        assert.strictEqual(postMethod.status, 405, 'Unsupported HTTP methods must return 405');
      } finally {
        await new Promise(resolve => srv.close(resolve));
      }
    });
  });

  describe('8. HTML Soft-Reload Defense, Manifest & Sibling Suite Link Alignment', () => {
    it('enforces autocomplete="off" on all HTML <select> controls, v1.5.0 asset/manifest versions, and sibling suite links', () => {
      const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
      const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8'));
      const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'manifest.json'), 'utf-8'));
      const html = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf-8');

      assert.strictEqual(pkg.version, '1.5.0', 'package.json version must be 1.5.0');
      assert.strictEqual(manifest.version, '1.5.0', 'manifest.json version must be 1.5.0');
      assert.ok(html.includes('js/app.js?v=1.5.0'), 'index.html must cache-bust js/app.js?v=1.5.0');

      const selectTags = html.match(/<select\b[^>]*>/gi) || [];
      assert.ok(selectTags.length >= 5, 'index.html must contain all 5 <select> controls');
      for (const tag of selectTags) {
        assert.ok(
          /\bautocomplete="off"/i.test(tag),
          `Every <select> must set autocomplete="off" against soft-reload form restoration: ${tag}`
        );
      }

      for (const siblingRepo of ['braun_as-42', 'braun_rb-26', 'braun_mr-16', 'bumbler_xd']) {
        assert.ok(html.includes(`sneed-and-feed/${siblingRepo}`), `index.html footer must link ${siblingRepo}`);
      }
    });
  });
});

# BRAUN AS 42 · Release v1.5.1 (Web Audio Synthesizer & Showcase Edition)

## Release Title
**BRAUN AS-42 v1.5.1: Minimize/Reopen Parameter Persistence, Click-Free Power-Off With Active Drones & Host Bridge Sync Hardening**

---

## Musician & Developer Release Notes

**BRAUN AS-42 v1.5.1** synchronizes the client-side Web Audio API + Web MIDI synthesizer and GitHub Pages showcase (`https://sneed-and-feed.github.io/`) with the native C++20/JUCE 8 **BRAUN AS-42 v1.5.1** release, resolving minimize/reopen parameter resets and power-off clicks/re-waking when drones are running across both WebView2/Native desktop builds and browser sessions.

---

### 🌟 Key Highlights & Engineering Changes in v1.5.1

#### 1. 🪟 Minimize / Reopen & Host-Bridge State Synchronization
* **Echo-Free Cold-DOM Calibration (`js/app.js`)**:
  * Guarded initial cold-DOM `applyPreset('DEFAULT', { animate: false, emitToNative: false })` so WebView2 boot or restore never emits `PRESETS.DEFAULT` over IPC to overwrite C++ APVTS parameters, and routed BFCache `pageshow` (`event.persisted`) inside JUCE WebView2 to request authoritative `requestSync` state restoration.
* **16-Property Extended UI Sync & Vector Reticle Lock (`js/app.js`, `js/ui/vector-pad.js`, `js/ui/keyboard.js`)**:
  * Synchronized `uiTheme`, `rootPitchClass`, `scaleKey`, `tuningA4`, `masterDrive`, `poissonDensity`, `poissonHumanize`, `chordSpeed`, `scopeMode`, `drone1Snap`, `drone2Snap`, `vectorMode`, `vectorX`, `vectorY`, and `customPatchJson` bidirectionally with `syncBegin` / `syncEnd` reticle protection and `knob._localOnChange` JS engine cache updates.

#### 2. 🔇 Click-Free Power-Off With Active Drones & Async Startup Cancellation
* **Clean Power-Off Teardown & Drone Gain Anchoring (`js/app.js`, `js/audio/engine.js`, `js/ui/keyboard.js`)**:
  * Cancelled all in-flight chord-strum timers (`cancelAllActive()`), disarmed `#toggle-freeze` + `shimmer_freeze`, anchored live `SolarDroneVoice._getInstantGain(now)` during fallback bus fade-outs, and guarded `AudioEngine.powerOff()` until `ctx.currentTime` completes the 50 ms ramp before suspending `AudioContext`.
  * Added monotonic `_powerEpoch` cancellation in `startAudio()` / `togglePower()` so cancelling an in-flight `startAudio()` never wedges `_startingAudioPromise` or flips `isPowerOn` back to `true`.
* **Native Desktop / VST3 / AU Parity (`BRAUN AS-42 v1.5.1`)**:
  * Paired with `withKeepPageLoadedWhenBrowserIsHidden()`, removal of steady-state `drone1Active` / `drone2Active` power re-waking in `processBlock()`, a 45 ms $C^1$ Hermite power-off ramp, lock-free `dspSilent` / `pendingSilentPowerSnap` handoff, and a 50 ms VST3/AU tail guard.

#### 3. 🔗 Sibling Instrument Suite Showcase & Distribution Packages
* Updated footer and documentation links across `index.html` and `README.md` (`BRAUN AS-42 v1.5.1`, `BRAUN RB-26 v1.5.0`, `BRAUN MR-16 v1.1.0`, `Bumbler XD v1.1.0`) with attached Windows x64 VST3 + Standalone archives (`BRAUN_AS42-v1.5.1-Windows-x64.zip`, `BRAUN_AS42-v1.5.1-VST3-Windows-x64.zip`, `SHA256SUMS.txt`).

---

### 🔬 Certified Quality & Verification Matrix

| Test Harness / Suite | Assertions | Result | Status |
| :--- | :--- | :--- | :--- |
| **Node.js Web Audio, MIDI, UI & Server Suite (`npm test`)** | 535 tests (120 suites) | 535 Passed, 0 Failed | **PASS** |
| **Standalone Fast Verification Checklist (`npm run verify:checklist`)** | 16 criteria | 16 Passed, 0 Errors | **PASS** |
| **Sibling Native C++20 DSP & Lifecycle Suites (`braun_as-42 v1.5.1`)** | 78 tests (4 suites) | 78 Passed, 0 Failed | **PASS** |

---

### 🌐 Live In-Browser Web Audio Demonstration
👉 **[https://sneed-and-feed.github.io/](https://sneed-and-feed.github.io/)**

---

> *Legal Homage Notice: Not affiliated with Braun GmbH. Dieter Rams inspired design homage. Published by Sneed's Feed & Seed Ltd.*

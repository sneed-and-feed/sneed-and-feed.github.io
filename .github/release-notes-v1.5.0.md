# BRAUN AS 42 · Release v1.5.0 (Web Audio Synthesizer & Showcase Edition)

## Release Title
**BRAUN AS-42 v1.5.0: Web Audio DSP & Limiter Hardening, Reload/BFCache Drone Standby Safety, Sustain Pedal Generation Guarding & Sibling Suite Showcase**

---

## Musician & Developer Release Notes

**BRAUN AS-42 v1.5.0** brings the client-side Web Audio API + Web MIDI synthesizer and GitHub Pages showcase (`https://sneed-and-feed.github.io/`) into full parity with the native C++20/JUCE 8 **BRAUN AS-42 v1.5.0** release while delivering a comprehensive Web Audio DSP, MIDI state-machine, browser lifecycle, and static server audit remediation.

---

### 🌟 Key Highlights & Engineering Changes in v1.5.0

#### 1. 🛡️ Reload, Soft-Reload, Standby & BFCache Drone Safety
* **Eliminated Unsolicited Drone Starts & UI/Engine LED Desyncs**:
  * Purged residual `localStorage` and `sessionStorage` audio latch keys unconditionally on browser boot (not only inside JUCE WebView environments) and added `autocomplete="off"` to all 5 HTML `<select>` controls to prevent browser soft-reload form auto-restoration.
  * Guarded `handleInterruptionRecovery` so `AudioContext.resume()` never fires when the system is in standby or manually powered off (`isPowerOn === false`).
  * Added explicit Back/Forward Cache (`pageshow` / `pagehide` with `event.persisted === true`) teardown that disarms both drones, quenches shimmer freeze, synchronizes all button & orange `.braun-led` states, and suspends `AudioContext`.
  * Deduplicated concurrent `startAudio()` calls via a shared `_startingAudioPromise` and committed `#btn-drone1-active` / `#btn-drone2-active` toggle state synchronously prior to async audio unlock so rapid pre-boot clicks never desynchronize UI LEDs from `AudioEngine`.
  * Fixed `resetAllKnobs()` so `#toggle-freeze .braun-led` clears alongside button state.

#### 2. 🎛️ Web Audio DSP Numerical Hardening & Anti-Click Scheduling
* **Monotonic** $C^1$ **Hermite Boundary Limiter (`js/audio/wavefolder.js`)**:
  * Fixed `applySmoothBoundaryKnee(y, knee)` to clamp $|y| \ge 1.0 \implies \mathrm{sgn}(y)$, eliminating cubic Hermite foldback/divergence above $\pm 1.0$ in `makeFreezeLimiterCurve` and `makeShimmerLimiterCurve`.
  * Added `Number.isFinite` and low-drive (`drive <= 1e-4`) guards across all 6 waveshaper and limiter transfer curve generators.
* **Strict Nyquist Clamping & Anchored Gecko/Firefox Ramps (`tape-delay.js`, `shimmer-reverb.js`, `drone-voice.js`, `felt-piano.js`)**:
  * Bounded all dynamic `BiquadFilterNode` cutoffs (including positive LFO excursions in `SolarDroneVoice`) strictly below $\le 0.49 f_s$ (`Math.max(800, sampleRate * 0.49)`).
  * Wrapped `cancelAndHoldAtTime` in `try/catch` with anchored `cancelScheduledValues(now)` + `setValueAtTime(currentVal, now)` fallback to eliminate step clicks in Firefox/Gecko, and added `dispose()` node cleanup methods.
* **Shimmer RT60 Preservation, Drone Fade-Out Continuity & Sub-Bass Trim Retention**:
  * Preserved `setDecay()` RT60 `decayScale` when adjusting `setShimmer()` and unified initial `shimmerSend.gain` (`shimmerAmount * 0.9`).
  * Fixed `SolarDroneVoice._getInstantGain()` to read live `voiceGain.gain.value` during `!isActive` release fades (eliminating rapid OFF->ON snap clicks) and retained `1.70x` Sub-Bass gain trim across `powerOff()` -> `init()` cycles.
* **Felt Piano Active `updateDecay()` & Hammer Graph Leak Elimination (`felt-piano.js`)**:
  * Extended `updateDecay(newDecay)` to reschedule both `_isReleased` and active non-held ringing voices with the $1.35\times$ bass register multiplier (`midi < 48`), and disconnected one-shot hammer `AudioBufferSourceNode` nodes in `onended`.

#### 3. 🎹 Sustain Pedal (`CC 64`), Multi-Voice `_noteVoiceMap`, Stolen-Voice `triggerId` & Web MIDI Hot-Unplug Safety
* **Real-Engine Sustain Latching (`engine.js`, `felt-piano.js`, `midi-manager.js`)**:
  * Wired `AudioEngine.noteOff()` and `AudioEngine.setSustainPedal()` with per-note multi-voice tracking (`_noteVoiceMap`) and monotonic `triggerId` voice-generation tokens so `CC 64` genuinely sustains `FeltPianoVoice` notes on the real engine (including overlapping strikes on held notes and retuned `440 <-> 432 Hz` pedal-latched re-strikes) while guaranteeing stolen voices are never prematurely cut off and prior latched voices are never orphaned.
* **Cold-Wake First-Note Preservation & USB Hot-Unplug Cleanup**:
  * Buffered first-strike MIDI notes during asynchronous cold `startAudio()` wake (`_pendingWakeNotes`, cancelling cleanly if `NoteOff` arrives before wake completes) and automatically released port-held notes and sustain latches if a USB MIDI controller disconnects mid-performance.
  * Updated `keyboard.js` `window` `blur` handling to invoke `engine.noteOff(midi)` for held keyboard and touch keys so `_heldNotes` and MIDI-tracked drones release cleanly on `Alt+Tab`.

#### 4. 🖥️ Carried-Forward Modernizations (`v1.4.1` – `v1.4.3` Parity) & HTTP Server Hardening
* **Tri-Split Documentation & Legal Homage Metadata (`v1.4.1`)**: Streamlined `README.md`, technical `ARCHITECTURE.md` datasheet, `CHANGELOG.md`, and formal Dieter Rams homage notices (*Not affiliated with Braun GmbH. Published by Sneed's Feed & Seed Ltd.*).
* **CRT Visualizer Lifecycle & Host IPC Sync (`v1.4.2` – `v1.4.3`)**: Halts 60 fps canvas rendering in standby, tab occlusion, window blur, and Native DAW UI switching (`crt-display.js`, `oscilloscope.js`) with non-compounding high-DPI `setTransform`, plus full APVTS discrete & rotary `paramUpdate` synchronization.
* **Static Server Hardening (`server.js`)**: Added `createStaticServer()` supporting `GET`/`HEAD`/`OPTIONS` (`405` on other methods), safe `decodeURIComponent` (`400` on malformed `%`), strict root-containment blocking encoded `/%2e%2e/` traversal and dotfiles (`403`), `Content-Length`, and `X-Content-Type-Options: nosniff`.

#### 5. 🔗 Sibling Instrument Suite Showcase Alignment
* Updated footer and documentation links across `index.html` and `README.md` for the complete instrument & studio suite:
  * [**BRAUN AS-42 (`v1.5.0`)**](https://github.com/sneed-and-feed/braun_as-42/releases/latest)
  * [**BRAUN RB-26 (`v1.5.0`)**](https://github.com/sneed-and-feed/braun_rb-26/releases/latest)
  * [**BRAUN MR-16 (`v1.1.0`)**](https://github.com/sneed-and-feed/braun_mr-16/releases/latest)
  * [**Bumbler XD (`v1.1.0`)**](https://github.com/sneed-and-feed/bumbler_xd/releases/latest)

---

### 🔬 Certified Quality & Verification Matrix

| Test Harness / Suite | Assertions | Result | Status |
| :--- | :--- | :--- | :--- |
| **Node.js Web Audio, MIDI, UI & Server Suite (`npm test`)** | 533 tests (120 suites) | 533 Passed, 0 Failed | **PASS** |
| **v1.5.0 Deep Audit Regression Suite (`test/v150-audit-regressions.test.js`)** | 19 tests (9 suites) | 19 Passed, 0 Failed | **PASS** |
| **Standalone Fast Verification Checklist (`npm run verify:checklist`)** | 16 criteria | 16 Passed, 0 Errors | **PASS** |
| **Sibling Native C++20 DSP & Lifecycle Suites (`braun_as-42 v1.5.0`)** | 73 tests (4 suites) | 73 Passed, 0 Failed | **PASS** |

---

### 🌐 Live In-Browser Web Audio Demonstration
👉 **[https://sneed-and-feed.github.io/](https://sneed-and-feed.github.io/)**

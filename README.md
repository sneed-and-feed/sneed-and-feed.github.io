# BRAUN AS 42 · Ambient Generative Synthesizer

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live%20Demo-EE592B?style=for-the-badge&logo=github)](https://sneed-and-feed.github.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-black?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Web Audio API](https://img.shields.io/badge/Web%20Audio-100%25%20Client--Side-4A4A4A?style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)

> **"Weniger, aber besser"** — Dieter Rams Functionalist Ambient Instrument.
> A microtonal generative synthesizer inspired by **Harold Budd**, **Brian Eno**, and the **Elta Solar 42n**.

---

### 🌐 [🔊 Play Live in Your Browser: https://sneed-and-feed.github.io/](https://sneed-and-feed.github.io/)

*No installation, plugins, or accounts required. Powered entirely by the browser's native Web Audio API.*

---

## Overview

The **BRAUN AS 42** merges mid-century German industrial functionalism with deep acoustic and generative synthesis. It unites four distinct ambient sound traditions into a single tactile, calibrated instrument:

1. **Harold Budd "Soft Pedal" Felt Piano & Chimes:**
   - Physical felt-hammer transient modeling with pink noise impulse excitation.
   - 24dB steep lowpass filter damping mimicking una corda soft pedal play.
   - Register-dependent acoustic formant filtering across bass, mid, and treble ranges.
   - Natural sympathetic string resonance network and subtle golden-ratio micro-detuning.
2. **Brian Eno Asynchronous Phase Loops & Shimmer Tape Diffusion:**
   - 4 tape loops cycling at coprime prime intervals (13.7s, 17.3s, 21.1s, 26.9s) creating non-repeating ambient counterpoint.
   - Stereo polyrhythmic tape delay (3:2 ratio) with oversampled tape saturation, head-loss damping, capstan flutter, and tape wow.
   - Octave-up shimmer reverb bloom (+12 semitone real-time dual-delay pitch shifter) with infinite freeze and automatic input ducking.
3. **Elta Solar 42n Microtonal Twin-Oscillator Drones:**
   - Dual microtonal drone voices with sub-hertz continuous beating (0.00–5.00 Hz).
   - One-click Dieter Rams quick-snap harmonic tuning (Sub Bass, Deep Tonic, Warm Root, Octave Up; Perfect 5th, Sus 4th, Major 9th, Beating Unison).
   - Non-linear West Coast wavefolder and 4-pole resonant ladder lowpass filter.
4. **Vangelis Yamaha CS-80 Brass Architecture:**
   - Dual detuned pulse/saw oscillators with rich brass envelope swell and singing filter resonance.
   - Signature *Blade Runner* and *Tears in Rain* harmonic clusters.

---

## Key Features

- **Zero-Dependency Web Audio DSP:** 100% client-side synthesis. No external audio libraries, frameworks, or backend servers needed.
- **Dieter Rams Industrial Design:**
  - Aluminum light finish (`#ECEBE4`) and Anthracite dark finish (`#18191B`).
  - Signal orange (`#EE592B`) master tactile controls.
  - 32 machined rotary knobs with 10x micro-tuning sensitivity (hold `Shift`), mouse wheel control, and double-click numerical entry.
  - Master calibrated reset switch with smooth knob transitions.
- **2×6 Chord Cluster Matrix:** 12 signature ambient chords with click-and-hold sustain and keyboard hotkeys (`1`–`6`, `7`–`=`).
- **Braun AS 42 Vector Touchpad:** 2D XY surface for real-time glide modulation of delay rate, stereo balance, space reverb bloom, and feedback wash.
- **60fps Phosphor Oscilloscope:** High-persistence CRT display supporting **OSC** (time domain with analog edge trigger), **FFT** (spectral analyzer), and **XY PHASE** (Lissajous stereo goniometer).
- **Studio WAV Recorder:** One-click lossless 16-bit 48kHz PCM WAV recording directly from the master bus.
- **Poisson Generative Rain Engine:** Generative stochastic notes triggering according to an exponential Poisson distribution ($\Delta t = -\frac{\ln(1 - U)}{\lambda}$).

---

## Quick Start (Running Locally)

### Option 1: 1-Click Windows Launcher (`.bat`)
Simply double-click:
```bat
start.bat
```
*(or `run.bat`)* — it automatically detects Node.js (or Python), launches the local static server on `http://localhost:3000`, and opens your default browser!

### Option 2: Node.js CLI
```bash
# Clone the repository
git clone https://github.com/sneed-and-feed/sneed-and-feed.github.io.git
cd sneed-and-feed.github.io

# Start the zero-dependency server
npm start

# Visit in browser
http://localhost:3000
```

---

## Keyboard Shortcuts

| Key(s) | Action |
| :--- | :--- |
| **`A` `S` `D` `F` `G` `H` `J` `K` `L` `;` `'` `Z` `X` `C` `V`** | Play notes on the harmonic chime strip (hold for sustain, release to damp) |
| **`1` to `6`** / **`7` to `=`** | Trigger 2×6 Chord Cluster voicings (hold for sustained pad) |
| **`Spacebar`** | Toggle Infinite Ambient Reverb Freeze |
| **Mouse Click + Drag** | Glissando swipe across the chime keys |
| **`Shift` + Knob Drag** | 10× Precision fine-tuning adjustment |
| **Double Click on Knob** | Type exact numerical value |

---

## Harmonic Modes

Intuitive modal spaces curated for effortless improvisation without theory prerequisites:
- **Budd Felt Pentatonic:** Consonant, pure major pentatonic with zero harsh tritones.
- **Lydian Ambient:** Brian Eno celestial floating harmony with raised 4th (#11).
- **Dorian Mystic:** Deep contemplative minor mood.
- **Kankyo Ongaku:** Hiroshi Yoshimura Japanese environmental ambient.
- **Aeolian Midnight:** Nocturnal natural minor.
- **Spirited Modal / Avalon:** Cinematic emotional suspended harmonies.
- **Weightless Whole Tone:** Dreamlike suspension.

---

## Project Structure

```
├── .github/workflows/deploy.yml   # GitHub Actions automated Pages deployment
├── .nojekyll                      # Prevents Jekyll asset processing
├── index.html                     # Braun AS 42 interface and layout
├── start.bat                      # 1-click Windows server and browser launcher
├── run.bat                        # Shortcut alias to start.bat
├── server.js                      # Zero-dependency local static HTTP server
├── package.json                   # Project metadata and test runner scripts
├── css/
│   └── style.css                  # Dieter Rams functionalist UI styles & animations
└── js/
    ├── app.js                     # Main application bootstrap & coordination
    ├── audio/                     # Web Audio DSP synthesis engine
    │   ├── context.js             # AudioContext manager & graph routing
    │   ├── felt-piano.js          # Physical felt hammer & acoustic modeling
    │   ├── phase-loops.js         # Brian Eno coprime tape loops
    │   ├── poisson-engine.js      # Stochastic Poisson note generator
    │   ├── tape-delay.js          # Polyrhythmic tape delay with flutter & wow
    │   ├── shimmer-reverb.js      # Algorithmic reverb + pitch shift bloom
    │   ├── solar-drone.js         # Elta Solar 42n microtonal twin drone voices
    │   ├── cs80-voice.js          # Vangelis CS-80 brass architecture
    │   ├── wavefolder.js          # Anti-aliased West Coast wavefolding DSP
    │   ├── recorder.js            # 16-bit 48kHz lossless WAV encoder
    │   ├── scales.js              # Modal harmony & chord cluster definitions
    │   └── wavetables.js          # Band-limited Fourier wavetable oscillators
    └── ui/                        # Tactile UI components
        ├── knob.js                # Dieter Rams precision rotary dials
        ├── vector-pad.js          # 2D XY touch performance pad
        ├── chime-strip.js         # Chromatic touch & glissando strip
        └── oscilloscope.js        # CRT green phosphor oscilloscope & FFT
```

---

## License

Released under the [MIT License](LICENSE). Inspired by the timeless industrial design of **Dieter Rams** and the ambient audio innovations of **Harold Budd**, **Brian Eno**, and **Elta Music**.

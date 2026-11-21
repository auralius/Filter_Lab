# Filter Control Lab v1.4 — Virtual Lab Control Series

A lightweight, browser-only digital-filter playground. Students implement `init()` and `filter()` in JavaScript, one input sample at a time. The lab shows the 10-second noisy-sine experiment and compares **sine-by-sine frequency sweep** against a **single broadband PRBS / FFT measurement**. There is no npm build, library dependency, or server back end.

## Run locally or on GitHub Pages

From the unzipped folder:

```bash
python3 -m http.server 8000
```

Open <http://localhost:8000/>. Do not use `file://` because Web Workers may be blocked. Publish the extracted files to GitHub Pages to serve the same page over HTTPS.

**The new default starter is an implemented second-order *resonant* low-pass**, not pass-through. The editor uses a new `localStorage` key in v1.1 to make the starter visible on first launch. If you've edited the filter already, **Reset starter** explicitly loads the shipped example.

## Student API: sample-by-sample and causal

```js
function init() {
  memory.x1 = 0;
  memory.y1 = 0;
}
function filter() {
  const x = state.x;       // current input sample only
  const y = /* implement filter equation here */ x;
  memory.x1 = x;
  memory.y1 = y;
  return y;                // must be a finite scalar
}
```

| Name | Meaning |
|---|---|
| `state.x` | Current input only. No previous input, sample index, time, true sine, or future sample is exposed. |
| `params.fs` | Sampling frequency in Hz |
| `params.dt` | Sampling interval `1 / params.fs` in seconds |
| `params.frequency`, `.amplitude`, `.noiseStd`, `.offset`, `.seed` | Signal-generator settings for experiments; **do not use the reference sine settings to cheat on filter evaluation** |
| `memory` | Persistent, student-managed object; store earlier inputs/outputs and coefficient values yourself |
| `init()` | Optional, executed once for each independent run, sine test frequency, or PRBS experiment |
| `filter()` | Required, called once per input sample; must return a finite number |

`state`, `params` and `memory` are available in custom functions without passing them as arguments. Both `state` and `params` are immutable snapshots. `memory` starts as `{}`, and `init()` can allocate arrays (`memory.history=[]`) and initialize previous values. **Past input samples cannot be read unless explicitly stored in `memory`.**

## New resonant biquad starter

The continuous-time prototype is

$$
H(s)=\frac{\omega_0^2}{s^2+2\zeta\omega_0s+\omega_0^2}, \quad \omega_0=2\pi f_0.
$$

The example sets **natural frequency** `f0 = 5 Hz` and damping ratio **`zeta = 0.30`**. Tustin's bilinear transform is used with frequency prewarping, `K = tan(pi * f0 / fs)`. Define `D = 1 + 2*zeta*K + K*K`:

```text
b0 = K*K/D          b1 = 2*b0                 b2 = b0
a1 = 2*(K*K-1)/D    a2 = (1-2*zeta*K+K*K)/D

y[k] = b0*x[k] + b1*x[k-1] + b2*x[k-2]
     - a1*y[k-1] - a2*y[k-2]
```

`init()` calculates coefficients once and initializes `x1,x2,y1,y2`. `filter()` updates these four samples **after** calculating `y[k]`.

For a general second-order low-pass, a resonance peak exists if `0 < zeta < 1/sqrt(2)`. The default shows approximately **+4.85 dB around 4.5 Hz** at 100 Hz sampling. Setting `zeta = Math.SQRT1_2` produces a second-order Butterworth response **without** a resonance peak. Here `f0` is the **natural frequency**, not generally the -3 dB cutoff for resonant designs.

## 10-second noisy signal experiment

```text
clean[k] = offset + amplitude * sin(2*pi*frequency*k/fs)
x[k] = clean[k] + noiseStd * GaussianWhiteNoise[k]
```

Click **Run 10 s**, or **Step 1 sample** to advance manually. The generator uses a deterministic noise seed. The amplitude/noise/offset controls affect this 10-second experiment, not the clean-sine or PRBS measurements.

## Frequency-response measurement methods

Both measurements use the **actual student `filter()`** at the selected sampling frequency and measure the output. They do **not** calculate the response from the coefficients. Gain/phase represent a transfer function only for approximately linear, time-invariant filters.

### Method A: sine sweep (22 tests)

- 22 logarithmically spaced frequencies from **0.35 Hz** to `min(30 Hz, 0.4*fs)`.
- Each frequency has a fresh `memory` and `init()`.
- Generate a clean unit-amplitude sine; discard four periods, measure five periods.
- Fit `y(t) ≈ c + a*sin(2πft) + b*cos(2πft)` by least squares.
- Gain: `20*log10(sqrt(a*a+b*b))`; phase: `atan2(b,a)` degrees.

### Method B: PRBS / FFT (one broadband test)

- Generate one deterministic **pseudo-random binary sequence** (PRBS), taking values **-1** and **+1**. It is broadband, so many frequencies are excited *at the same time*.
- Call `init()` **once** for the experiment, discard **4,096 samples** as warm-up, then record **32,768 input/output pairs**. The experiment is longer than the 10-second noisy-sine test.
- Use **4,096-point Hann-windowed FFTs**, **50% overlap**, and average **15 cross-/auto-spectral estimates** (the H1 estimator):


```math
\hat{H}(f) =
\frac{\sum_{m} Y_{m}(f) X_{m}^{\ast}(f)}
{\sum_{m} X_{m}(f) X_{m}^{\ast}(f)}
```


- Convert the complex ratio to gain (`20 log10 |H|`) and phase (`arg H`, wrapped to ±180°). Plot nearest FFT bins to the same 22 requested frequencies as the sine sweep.
- Repeating a test with the same seed produces the same PRBS and response. PRBS has **no** sine frequency: during that test, `params.frequency = 0`. The filter must not depend on knowing the input's clean sine.

**Tradeoff:** A sine sweep gives accurate individual tone measurements but uses many independent experiments. PRBS measures a broadband response in one run, with spectral averaging; its curve may exhibit some measurement variability or smoothing, particularly for sharp resonances. Compare both results on the overlaid plots (teal/orange for sine; violet for PRBS).

## CSV exports

- **Export CSV**: the ten-second time-domain data, including `input_x`, `ideal_sine`, `output_y`, and generator settings.
- **Export response CSV**: every available frequency-response measurement. New format: `method,frequency_hz,gain_db,phase_deg,amplitude`, with `method` equal to `sine` or `prbs`. If both tests are run, both sets appear in one file.
- **Save .js**: current student filter code. Edits are saved only in the browser; no automatic GitHub submission.

## Experiments

1. Run the default `zeta=0.30` starter. Compare the **+4–5 dB resonance** obtained by the sine sweep and PRBS.
2. Change `zeta` to `Math.SQRT1_2` (approximately 0.707). The resonant peak should disappear: this is the **Butterworth** case.
3. Try `zeta=0.1`, then `zeta=1.0`. Discuss resonance versus damping, settling time and how many frequencies are sufficient to locate a narrow peak.
4. Change `f0`, `params.fs`, or the noisy-sine input frequency. Discuss prewarping, Nyquist, and why the time-domain RMSE against the *undelayed* sine can rise even if high-frequency noise is attenuated.

## Notes and validation

Run `node tests/run_tests.js` for numeric Worker checks. The student code executes inside a Web Worker, not a hardened sandbox; use trusted classroom code. The Worker timeout interrupts code that does not return, but no guarantee of safe hostile-code execution is provided.

MIT licensed; see `LICENSE`.

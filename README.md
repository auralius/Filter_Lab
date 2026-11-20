# Filter Lab v1.0 — Virtual Lab Control Series

A lightweight digital-filter teaching playground. Open it in a browser, write JavaScript, then compare a 10-second noisy sine input against your filtered output and run a sinusoidal frequency sweep. Suitable for GitHub Pages and low-spec laptops.

## Run locally

```bash
python3 -m http.server 8000
```

Then visit <http://localhost:8000/>. Do not open `index.html` directly using `file://`: Web Workers often require an HTTP origin. No npm, external scripts, or internet access is required once files are local.

## Student interface

```javascript
function init() {
  memory.prevY = 0;
  memory.history = [];
}

function filter() {
  const x = state.x;
  // Write a difference equation here and explicitly update memory.
  return x; // pass-through placeholder
}
```

The simulator automatically calls `init()` once **per fresh run** and `filter()` once **per sample**, with global objects accessible to custom functions:

| API | Meaning |
|---|---|
| `state.x` | **Only** the current input sample; no past/future inputs, timestamp, index, or true sine |
| `params.fs` | sample rate (Hz) |
| `params.dt` | sample interval `1 / params.fs` (seconds) |
| `params.duration` | time-domain signal duration, 10 seconds |
| `params.frequency` | test sine frequency (Hz) |
| `params.amplitude` | sine amplitude |
| `params.noiseStd` | white Gaussian noise standard deviation |
| `params.offset` | sine DC offset |
| `params.seed` | reproducible noise seed |
| `memory` | student-managed persistent object, reset before a new run/sweep frequency |
| `filter()` | returns a single **finite number** (`y[k]`) |

`state` and `params` are frozen read-only snapshots. `memory` is writable and must be explicitly initialized inside `init()`. The `state`, `params`, and `memory` names are reserved at the script's top level. Students may define unlimited custom functions, all sharing the global context.

The simulator intentionally reveals the signal-generation parameters in `params` for experiments, but **students should only use `state.x` and `params.dt`/`params.fs` in their filter algorithms**. For assessments, use additional hidden test settings or review code; CSV output alone is not tamper-proof.

## Signal definition

At sample `k` (`t=k/fs`):

```text
clean[k] = offset + amplitude * sin(2*pi*frequency*k/fs)
x[k] = clean[k] + noiseStd * GaussianWhiteNoise[k]
```

The noise is repeatable for the same `seed`. The app generates exactly `duration * fs` samples, with the first sample at `t=0` and the last sample at `t=duration-dt`.

### Examples of filter equations to implement

- **Moving average (FIR)**: `y[k] = (x[k] + ... + x[k-N+1]) / N`; students must store past samples in `memory.history`.
- **One-pole IIR**: `y[k] = α*x[k] + (1-α)*y[k-1]`; students must store `y[k-1]` themselves.
- **General biquad**: `y[k] = b0*x[k]+b1*x[k-1]+b2*x[k-2]-a1*y[k-1]-a2*y[k-2]`; students store both input and output delays.

## Frequency sweep

The app checks **22 logarithmically spaced frequencies** from 0.35 Hz to `min(30 Hz, 0.4*fs)`. For each frequency it:

1. Creates fresh `memory`, then calls `init()` once.
2. Generates a **clean, unit-amplitude sinusoid**, deliberately turning off noise during the sweep.
3. Discards the first 4 cycles to allow filter transients to settle.
4. Fits a sine and cosine to the final 5 cycles to estimate output amplitude and phase.
5. Plots `20*log10(outputAmplitude / inputAmplitude)` and output phase in degrees.

These are numerical measurements, **not an analytical transfer function**. Gain and phase have the usual LTI meaning when the student's filter is approximately linear and time-invariant. At very low cutoff frequencies, four transient cycles may not fully settle; students should interpret the sweep accordingly. Phase is wrapped to ±180°, and longer tests are used for lower sweep frequencies (the sweep is not constrained to 10 s).

## Error metrics

- `Input RMSE = sqrt(mean((x-clean)^2))`
- `Output RMSE = sqrt(mean((y-clean)^2))`
- `Improvement dB = 20*log10(Input RMSE / Output RMSE)`

These RMSE metrics compare against the undelayed true sine, so a filter's phase shift can increase RMSE even while it removes noise. Consider both waveform quality and frequency response; the app does not claim to calculate formal broadband signal-to-noise ratio.

## Export

- **Save .js** — student filter source.
- **Export CSV** — samples with `sample,time_s,input_x,ideal_sine,output_y,input_error,output_error,sample_rate_hz,sine_frequency_hz,noise_std,seed`.
- **Export sweep CSV** — `frequency_hz,gain_db,phase_deg,amplitude`.

The code editor autosaves locally to its own browser-storage key. The app does not send code or CSV to GitHub.

## Lifecycle and safety

- **Apply & reset** creates fresh filter state and calls `init()` once.
- **Step 1 sample** advances the filter by one sample, preserving `memory`.
- **Run 10 s** processes the remaining samples in the current session; if code/config changed, it automatically resets first.
- **Run frequency sweep** measures each frequency independently, using new memory and a new `init()` for each. It does not modify the ongoing 10-second time-domain result.
- The controller code executes inside a browser Worker. A time limit terminates a non-returning worker, but this is **not** a security-hardened sandbox. Use trusted classroom code.

## GitHub Pages

Upload the project files to a GitHub repository root. Under Settings → Pages, select Deploy from branch `main / (root)`. The published site works entirely client-side.

## License

MIT; see LICENSE.

# Barefoot Filter Lab v1.4 — SymPy/Tustin Butterworth LPF

A lightweight digital filter laboratory with a default starter taken directly from the **second-order LPF** derivation in [Digital Low-Pass Filter — Control Systems with SymPy](https://auralius.github.io/control-systems-with-sympy/digital-filter.html).

## Run

```bash
python3 -m http.server 8000
```

Open <http://localhost:8000/>. The files also deploy unchanged to GitHub Pages. Avoid `file://` because browser Web Workers may be blocked.

**New in v1.3:** The sine and PRBS frequency sweeps span a much broader logarithmic band with 60 measurements and decade gridlines. The SymPy/Tustin Butterworth starter from v1.2 remains available, as does the optional `resonant_biquad_starter.js`. Student editor code already saved in v1.2 is preserved; use **Reset starter** to restore the supplied default.

## New in v1.4: Analytical H(z) (no sweep needed)

The optional `getTransferFunction()` standard callback declares `b` and `a` coefficients in powers of `z^-1`. A smooth analytical Bode response is calculated immediately on **Apply & reset**, if the callback exists, or by pressing **Analytical H(z)**. The result overlays the existing sine-sweep and PRBS frequency-response curves (dashed red analytical, teal sine, purple PRBS). Exported frequency-response CSV now includes a `method=analytical` series.

```javascript
function getTransferFunction() {
  return {
    b: [1 / memory.A, 2 / memory.A, 1 / memory.A],
    a: [1, memory.B / memory.A, memory.C / memory.A]
  };
}
```

The callback runs in a **separate freshly initialized filter context**, so reading coefficients cannot modify the memory of ongoing time-domain or measured-sweep tests. It must return `{b:[...], a:[...]}`; `a[0]` can be any nonzero number (not necessarily one). Coefficients must be finite numbers, with up to 128 per array. Both arrays are interpreted as ascending powers of `z^-1`. The internal response engine normalizes naturally by evaluating the ratio `B/A` and displays 240 points from the current log-frequency limits to just below Nyquist.

This analytical response assumes a **linear time-invariant (LTI)** filter. It represents the **declared coefficients**; it cannot prove that the `filter()` implementation uses them correctly. For nonlinear or adaptive filters, omit the callback. Students' saved code from v1.2/v1.3 remains intact and may not contain the new callback: click **Reset starter** to load the version with `getTransferFunction()`.

The sine sweep now uses **at least 100 warm-up and 100 measurement samples**, even at high frequency. This avoids misleading phase near Nyquist when a very short sequence has not settled.

## Filter model and source correspondence

The continuous-time prototype is

\[H(s)=\frac{\omega_c^2}{s^2+\sqrt{2}\omega_c s+\omega_c^2}.\]

The notebook uses plain bilinear/Tustin substitution

\[s=\frac{2}{T_s}\frac{z-1}{z+1}.\]

The derived sample equation is

\[y[k]=\frac{x[k]+2x[k-1]+x[k-2]-B\,y[k-1]-C\,y[k-2]}{A},\]

where

\[
A=1+\frac{2\sqrt2}{T_s\omega_c}+\frac{4}{(T_s\omega_c)^2},\quad
B=2-\frac{8}{(T_s\omega_c)^2},\quad
C=1-\frac{2\sqrt2}{T_s\omega_c}+\frac{4}{(T_s\omega_c)^2}.
\]

**Units:** The notebook's wording labels `omega_c` as Hz, but angular frequency `omega_c` in these equations is in **rad/s**. The JavaScript therefore uses `wc = 2*Math.PI*fc` where `fc` is Hz. No prewarping is applied, exactly as in the notebook. Consequently, at `fs = 100 Hz` and requested `fc = 5 Hz`, the actual discrete -3 dB point is about 4.9595 Hz, not exactly 5 Hz. For a prewarped design the coefficient calculation would differ; that is not the implementation in this release.

See `sympy_tustin_butterworth_lpf.js` for paste-ready code. At 100 Hz, the normalized IIR coefficients are approximately: `b0=0.01978958`, `b1=0.03957917`, `b2=0.01978958`, `a1=-1.56450399`, `a2=0.64366232`. The first implemented equation is kept in `A,B,C` form to match the notebook exactly.

## Student API

`init()` runs once per independent time-domain, sine-test, or PRBS experiment. `filter()` runs once per input sample. The lab provides only the **current** `state.x`, plus global `params` and student-managed `memory`. Store history explicitly (e.g. `memory.x1`, `memory.x2`, `memory.y1`, `memory.y2`). `params.dt` is `1/params.fs`, so the coefficients automatically adapt to the selected sample rate.

- **10-second signal:** noisy sine wave with configurable frequency, amplitude, offset, white-noise standard deviation and seed; RMSE compared to ideal sine; CSV export.
- **Sine sweep:** 60 logarithmically spaced frequencies, spanning max(0.02 Hz, 3 fs / 16384) to 0.45 fs (e.g. approximately 0.02–45 Hz at fs = 100 Hz); for each, discard 4 periods and measure 5 periods using sine fitting, with a fresh `init()` per frequency.
- **PRBS/FFT:** seeded ±1 broadband input, 8192 warm-up samples and 131072 recorded samples, H1 frequency-response estimate from averaged 16384-point Hann-windowed FFT segments; fresh `init()` for the experiment. PRBS does not expose future/past input samples to the student's code. The complex frequency response is interpolated between FFT bins to match the sine sweep grid; extreme low-frequency points are limited by FFT resolution.

The two measured methods plot gain and phase alongside an optional analytical Bode curve. Both the Butterworth and resonant starter examples now provide `getTransferFunction()`. A Butterworth response should have a flat passband **without a resonance peak**. Use `resonant_biquad_starter.js` to demonstrate a peak with damping ratio 0.30.

## Teaching prompts

1. Explain the difference between a continuous-time cutoff in rad/s and a frequency in Hz.
2. Trace `x1`, `x2`, `y1`, `y2` for the first three samples.
3. Compare `fs = 50, 100, 200 Hz` while holding `fc = 5 Hz`.
4. Run both sine sweep and PRBS; explain why their estimates approximately agree.
5. Compare the Butterworth starter with `resonant_biquad_starter.js`: change damping and observe the resonant peak.
6. Explore how Tustin frequency warping changes the nominal cutoff when `fc/fs` becomes large.

All signal processing and student filter execution is browser-only and does not need npm or a server back end. This is an educational playground, not a hardened sandbox for untrusted code.

## Wider Bode frequency axis (v1.3)

Both frequency-response charts use a **true logarithmic x-axis**, with labeled decades and minor ticks at 2 and 5 times each decade. The sine sweep and PRBS now share **60 logarithmic frequencies** from `max(0.02, 3*fs/16384)` to `0.45*fs`. At 100 Hz this is about **0.02–45 Hz** (more than three decades); at 500 Hz, about **0.092–225 Hz**. Nyquist remains `fs/2`, which we stay below.

Very low frequencies require more simulation samples for nine sine cycles, and PRBS requires a longer FFT to resolve the lowest bins. The wider tests therefore take longer than in v1.2 but still run entirely in a Web Worker; the ten-second noisy-sine experiment remains unchanged. PRBS has frequency-resolution limits and near-Nyquist estimates may be noisy for aggressive filters. For causal filters, all history is still student-managed.

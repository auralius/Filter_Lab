// Second-order Butterworth low-pass filter, from our SymPy notebook.
// Plain Tustin (bilinear) discretization; no frequency prewarping.
// Reference: auralius.github.io/control-systems-with-sympy/digital-filter.html
function init() {
  const fc = 5.0;                   // Cutoff frequency (Hz)
  const wc = 2 * Math.PI * fc;      // Angular cutoff (rad/s)
  const Ts = params.dt;            // Sample time (s)
  const q = Ts * wc;

  // Coefficients A, B, C from the SymPy difference equation
  memory.A = 1 + 2 * Math.SQRT2 / q + 4 / (q * q);
  memory.B = 2 - 8 / (q * q);
  memory.C = 1 - 2 * Math.SQRT2 / q + 4 / (q * q);

  memory.x1 = 0; memory.x2 = 0;     // Previous inputs
  memory.y1 = 0; memory.y2 = 0;     // Previous outputs
}

function filter() {
  const x = state.x;               // Only current input sample

  // Equation derived with SymPy and the Tustin substitution
  const y = (x + 2 * memory.x1 + memory.x2
           - memory.B * memory.y1 - memory.C * memory.y2)
           / memory.A;

  // Shift the history only AFTER computing y[k]
  memory.x2 = memory.x1;
  memory.x1 = x;
  memory.y2 = memory.y1;
  memory.y1 = y;
  return y;
}

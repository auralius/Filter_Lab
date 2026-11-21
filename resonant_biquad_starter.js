// Second-order resonant low-pass filter (Tustin biquad).
// Try changing zeta and watch the frequency-response peak.
function init() {
  const f0 = 5.0;       // Natural frequency (Hz)
  const zeta = 0.30;    // Damping (< 0.707 gives resonance)
  const K = Math.tan(Math.PI * f0 / params.fs);
  const D = 1 + 2 * zeta * K + K * K;

  memory.b0 = K * K / D;
  memory.b1 = 2 * memory.b0;
  memory.b2 = memory.b0;
  memory.a1 = 2 * (K * K - 1) / D;
  memory.a2 = (1 - 2 * zeta * K + K * K) / D;

  memory.x1 = 0; memory.x2 = 0;
  memory.y1 = 0; memory.y2 = 0;
}

function filter() {
  const x = state.x;   // Current sample only
  const y = memory.b0 * x
          + memory.b1 * memory.x1
          + memory.b2 * memory.x2
          - memory.a1 * memory.y1
          - memory.a2 * memory.y2;

  // You MUST update the input/output history yourself.
  memory.x2 = memory.x1;
  memory.x1 = x;
  memory.y2 = memory.y1;
  memory.y1 = y;
  return y;
}

// Optional analytical transfer function (normalised biquad coefficients).
function getTransferFunction() {
  return {
    b: [memory.b0, memory.b1, memory.b2],
    a: [1, memory.a1, memory.a2]
  };
}

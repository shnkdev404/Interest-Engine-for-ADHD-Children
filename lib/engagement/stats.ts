// Small-sample statistics for fading detection (RESEARCH.md §2). Pure and
// deterministic: numeric integration instead of sampling, so the same log
// always gives the same answer.

function logGamma(z: number): number {
  // Lanczos approximation (g = 7, n = 9).
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < 9; i++) x += c[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function betaPdfGrid(a: number, b: number, n: number): number[] {
  const logB = logGamma(a) + logGamma(b) - logGamma(a + b);
  return Array.from({ length: n }, (_, i) => {
    const x = (i + 0.5) / n;
    return Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - logB) / n;
  });
}

/**
 * P(p_recent < p_early − margin) with Beta(1 + done, 1 + missed) posteriors
 * for each window: how sure we are that completion really dropped.
 */
export function probCompletionDrop(
  early: { done: number; assigned: number },
  recent: { done: number; assigned: number },
  margin = 0.15,
  n = 400,
): number {
  const pe = betaPdfGrid(1 + early.done, 1 + early.assigned - early.done, n);
  const pr = betaPdfGrid(1 + recent.done, 1 + recent.assigned - recent.done, n);
  // cdfR[i] = P(p_recent <= x_i)
  const cdfR: number[] = [];
  pr.reduce((acc, p, i) => ((cdfR[i] = acc + p), acc + p), 0);
  let prob = 0;
  for (let i = 0; i < n; i++) {
    const threshold = (i + 0.5) / n - margin;
    if (threshold <= 0) continue;
    const j = Math.min(n - 1, Math.floor(threshold * n - 0.5));
    if (j >= 0) prob += pe[i] * cdfR[j];
  }
  return Math.min(1, Math.max(0, prob));
}

/**
 * One-sided CUSUM on the relative shortfall against a baseline:
 * C_t = max(0, C_{t−1} + (1 − y_t / B) − slack). Returns the final value;
 * one bad week alone stays under the alarm level, a sustained drop doesn't.
 */
export function cusumShortfall(values: number[], baseline: number, slack = 0.1): number {
  if (baseline <= 0) return 0;
  return values.reduce((c, y) => Math.max(0, c + (1 - y / baseline) - slack), 0);
}

/** Median of pairwise slopes: a trend that one odd week can't swing. */
export function theilSen(values: number[]): number {
  const slopes: number[] = [];
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) slopes.push((values[j] - values[i]) / (j - i));
  }
  if (!slopes.length) return 0;
  slopes.sort((a, b) => a - b);
  const m = Math.floor(slopes.length / 2);
  return slopes.length % 2 ? slopes[m] : (slopes[m - 1] + slopes[m]) / 2;
}

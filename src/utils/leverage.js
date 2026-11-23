/**
 * Sign-preserving square root for leverage metric (todo242).
 * signedSqrt(x) = (x == null || !isFinite(x)) ? null : Math.sign(x) * Math.sqrt(Math.abs(x))
 *
 * Strictly monotonic on the reals (including across zero and sign), preserving
 * action rankings while compressing the unbounded quadratic dynamic range.
 *
 * @param {number|null|undefined} x
 * @returns {number|null}
 */
export function signedSqrt(x) {
  if (x == null || !isFinite(x)) return null;
  return Math.sign(x) * Math.sqrt(Math.abs(x));
}

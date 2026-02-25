/**
 * Greenwich Mean Sidereal Time (GMST) computation.
 * Standalone fallback — CesiumJS provides better ICRF-to-Fixed transforms,
 * but this is useful for display and verification.
 */

/**
 * Compute Julian Date from a JS Date (UTC).
 * @param {Date} date
 * @returns {number}
 */
export function julianDate(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

/**
 * Compute GMST in degrees from a JS Date.
 * Uses the IAU 1982 formula (adequate for visualization).
 * @param {Date} date
 * @returns {number} GMST in degrees [0, 360)
 */
export function gmstDeg(date) {
  const jd = julianDate(date);
  const T = (jd - 2451545.0) / 36525.0; // Julian centuries from J2000
  // GMST in seconds of time
  let gmstSec =
    67310.54841 +
    (876600 * 3600 + 8640184.812866) * T +
    0.093104 * T * T -
    6.2e-6 * T * T * T;
  // Convert to degrees
  let gmst = ((gmstSec / 240) % 360 + 360) % 360;
  return gmst;
}

/**
 * Format GMST as HH:MM:SS string.
 * @param {number} gmstDegrees
 * @returns {string}
 */
export function formatGMST(gmstDegrees) {
  const hours = gmstDegrees / 15;
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  const s = Math.floor(((hours - h) * 60 - m) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

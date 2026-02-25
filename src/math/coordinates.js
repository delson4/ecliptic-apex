/**
 * Geodetic ↔ ECEF coordinate conversions (standalone, no CesiumJS dependency).
 */
import { WGS84_A, WGS84_E2, DEG2RAD } from "../constants.js";

/**
 * Compute the prime vertical radius of curvature N(φ).
 * @param {number} sinLat - sin(latitude)
 * @returns {number} N in meters
 */
export function primeVerticalRadius(sinLat) {
  return WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
}

/**
 * Convert geodetic coordinates to ECEF (Earth-Centered, Earth-Fixed).
 * @param {number} latDeg - Latitude in degrees
 * @param {number} lonDeg - Longitude in degrees
 * @param {number} heightM - Height above ellipsoid in meters
 * @returns {Float64Array} [x, y, z] in meters
 */
export function geodeticToECEF(latDeg, lonDeg, heightM = 0) {
  const lat = latDeg * DEG2RAD;
  const lon = lonDeg * DEG2RAD;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);
  const N = primeVerticalRadius(sinLat);

  return new Float64Array([
    (N + heightM) * cosLat * cosLon,
    (N + heightM) * cosLat * sinLon,
    (N * (1 - WGS84_E2) + heightM) * sinLat,
  ]);
}

/**
 * Batch-convert a grid of lat/lon/elev to ECEF positions.
 * Returns a flat Float64Array of [x0,y0,z0, x1,y1,z1, ...].
 * @param {Float32Array} lats - Latitudes in degrees
 * @param {Float32Array} lons - Longitudes in degrees
 * @param {Int16Array} elevs - Elevations in meters
 * @returns {Float64Array}
 */
export function batchGeodeticToECEF(lats, lons, elevs) {
  const n = lats.length;
  const out = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const lat = lats[i] * DEG2RAD;
    const lon = lons[i] * DEG2RAD;
    const h = elevs[i];
    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);
    const sinLon = Math.sin(lon);
    const cosLon = Math.cos(lon);
    const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
    const j = i * 3;
    out[j] = (N + h) * cosLat * cosLon;
    out[j + 1] = (N + h) * cosLat * sinLon;
    out[j + 2] = (N * (1 - WGS84_E2) + h) * sinLat;
  }
  return out;
}

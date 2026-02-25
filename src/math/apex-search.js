/**
 * Apex search: find the point on Earth's surface with maximum ecliptic height.
 * Works with precomputed ECEF grid or generates ellipsoid-only grid on the fly.
 */
import { DEG2RAD, RAD2DEG, WGS84_A, WGS84_E2, OBLIQUITY_RAD } from "../constants.js";
import { findMaxEclipticHeight } from "./ecliptic.js";

/**
 * Generate an ellipsoid-only ECEF grid (no topography) for a latitude band.
 * Used when elevation data isn't loaded yet.
 */
export function generateEllipsoidGrid(latMin, latMax, latStep, lonStep) {
  const nLat = Math.floor((latMax - latMin) / latStep) + 1;
  const nLon = Math.floor(360 / lonStep);
  const count = nLat * nLon;
  const ecef = new Float64Array(count * 3);
  const lats = new Float32Array(count);
  const lons = new Float32Array(count);

  let idx = 0;
  for (let iLat = 0; iLat < nLat; iLat++) {
    const latDeg = latMin + iLat * latStep;
    const lat = latDeg * DEG2RAD;
    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);
    const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);

    for (let iLon = 0; iLon < nLon; iLon++) {
      const lonDeg = -180 + iLon * lonStep;
      const lon = lonDeg * DEG2RAD;
      const j = idx * 3;
      ecef[j] = N * cosLat * Math.cos(lon);
      ecef[j + 1] = N * cosLat * Math.sin(lon);
      ecef[j + 2] = N * (1 - WGS84_E2) * sinLat;
      lats[idx] = latDeg;
      lons[idx] = lonDeg;
      idx++;
    }
  }

  return { ecef, lats, lons, count };
}

/**
 * Search for the apex point (maximum ecliptic height) given an ECEF grid.
 */
export function searchApex(ecefGrid, gridLats, gridLons, gridElevs, enpEcef) {
  const { maxIndex, maxHeight } = findMaxEclipticHeight(ecefGrid, enpEcef);
  return {
    lat: gridLats[maxIndex],
    lon: gridLons[maxIndex],
    elev: gridElevs ? gridElevs[maxIndex] : 0,
    eclipticHeightKm: maxHeight / 1000,
  };
}

/**
 * Predict the approximate longitude of the apex (ellipsoid-only).
 */
export function predictApexLon(enpEcef) {
  return Math.atan2(enpEcef[1], enpEcef[0]) * RAD2DEG;
}

/**
 * Find the GLOBAL absolute maximum ecliptic height across ALL times,
 * considering both the ellipsoid shape AND topography.
 *
 * For each grid point with ECEF (x, y, z), the maximum ecliptic height
 * over all GMST angles is: h_max = sin(ε)·√(x²+y²) + cos(ε)·z
 *
 * This is a closed-form solution — no time stepping needed.
 * The maximum occurs at GMST = atan2(x, -y).
 *
 * We also compute each point's h_max on the PURE ELLIPSOID (h=0) so we
 * can report the topographic advantage — how much the mountain beats
 * what the ellipsoid alone would give.
 *
 * @param {Float64Array} ecefGrid - Flat ECEF positions with topography
 * @param {Float32Array} gridLats
 * @param {Float32Array} gridLons
 * @param {Int16Array|null} gridElevs
 * @param {boolean} [south=false] - If true, compute for ecliptic south pole
 * @returns {{ lat, lon, elev, eclipticHeightKm, gmstRad, topoAdvantageM }}
 */
export function findAbsoluteMaximum(ecefGrid, gridLats, gridLons, gridElevs, south = false) {
  const sinE = Math.sin(OBLIQUITY_RAD);
  const cosE = Math.cos(OBLIQUITY_RAD);
  // For south: negate cos(ε) term → h = sin(ε)·rxy - cos(ε)·z
  // This is equivalent to maximizing dot(r, -ENP)
  const cosSign = south ? -1 : 1;
  const n = ecefGrid.length / 3;

  // First pass: find the pure-ellipsoid maximum h_max (at any latitude).
  let ellipsoidBestH = -Infinity;
  for (let i = 0; i < n; i++) {
    const j = i * 3;
    const x = ecefGrid[j], y = ecefGrid[j + 1], z = ecefGrid[j + 2];
    const elev = gridElevs ? Math.max(gridElevs[i], 0) : 0;
    if (elev === 0) {
      const rxy = Math.sqrt(x * x + y * y);
      const hMax = sinE * rxy + cosSign * cosE * z;
      if (hMax > ellipsoidBestH) ellipsoidBestH = hMax;
    }
  }

  // If no zero-elevation point was found, compute ellipsoid analytically
  if (ellipsoidBestH === -Infinity) {
    const latStart = south ? -75 : 60;
    const latEnd = south ? -60 : 75;
    for (let latDeg = latStart; latDeg <= latEnd; latDeg += 0.01) {
      const lat = latDeg * DEG2RAD;
      const sinLat = Math.sin(lat);
      const cosLat = Math.cos(lat);
      const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
      const rxy = N * cosLat;
      const z = N * (1 - WGS84_E2) * sinLat;
      const hMax = sinE * rxy + cosSign * cosE * z;
      if (hMax > ellipsoidBestH) ellipsoidBestH = hMax;
    }
  }

  // Second pass: find the absolute maximum (with topography)
  let bestHeight = -Infinity;
  let bestIndex = 0;
  let bestGmstRad = 0;

  for (let i = 0; i < n; i++) {
    const j = i * 3;
    const x = ecefGrid[j], y = ecefGrid[j + 1], z = ecefGrid[j + 2];
    const rxy = Math.sqrt(x * x + y * y);
    const hMax = sinE * rxy + cosSign * cosE * z;

    if (hMax > bestHeight) {
      bestHeight = hMax;
      bestIndex = i;
      // North ENP in ECEF = [-sinε·sinG, -sinε·cosG, cosε]
      // max dot at G where dh/dG=0 and d²h/dG²<0 → G = atan2(-x, -y)
      // South (negated) = [sinε·sinG, sinε·cosG, -cosε]
      // max dot at G = atan2(x, y)
      bestGmstRad = south
        ? Math.atan2(x, y)
        : Math.atan2(-x, -y);
    }
  }

  const topoAdvantageM = bestHeight - ellipsoidBestH;

  const lat = gridLats[bestIndex];
  const lon = gridLons[bestIndex];

  return {
    lat,
    lon,
    elev: gridElevs ? gridElevs[bestIndex] : 0,
    eclipticHeightKm: bestHeight / 1000,
    gmstRad: bestGmstRad,
    topoAdvantageM,
    name: identifyPeak(lat, lon),
  };
}

/** Known named peaks for display purposes. */
const NAMED_PEAKS_NORTH = [
  { lat: 66.935, lon: -36.786, name: "Mont Forel, Greenland" },
  { lat: 68.919, lon: -29.899, name: "Gunnbjorn Fjeld, Greenland" },
  { lat: 68.900, lon: -29.880, name: "Dome, Watkins Range" },
  { lat: 68.880, lon: -29.850, name: "Cone, Watkins Range" },
  { lat: 63.069, lon: -151.007, name: "Denali, Alaska" },
  { lat: 60.567, lon: -140.406, name: "Mt. Logan, Canada" },
  { lat: 61.637, lon: 8.312, name: "Galdhopiggen, Norway" },
];

const NAMED_PEAKS_SOUTH = [
  { lat: -64.717, lon: -62.529, name: "Mt. Francais, Anvers Island" },
  { lat: -65.195, lon: -62.024, name: "Mt. Pisgah, Antarctic Peninsula" },
  { lat: -66.530, lon: -64.820, name: "Peninsula ice spine, Graham Land" },
  { lat: -66.192, lon: -64.692, name: "Peninsula ice spine, Graham Land" },
  { lat: -66.559, lon: -64.858, name: "Peninsula ice spine, Graham Land" },
  { lat: -67.460, lon: -66.817, name: "Adelaide Island, Antarctica" },
];

/** Match a lat/lon to the nearest named peak (within 0.15°). */
function identifyPeak(lat, lon) {
  const peaks = lat >= 0 ? NAMED_PEAKS_NORTH : NAMED_PEAKS_SOUTH;
  for (const p of peaks) {
    const dLat = Math.abs(p.lat - lat);
    let dLon = Math.abs(p.lon - lon);
    if (dLon > 180) dLon = 360 - dLon;
    if (dLat < 0.15 && dLon < 0.15) return p.name;
  }
  return null;
}

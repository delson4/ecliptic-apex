/**
 * ElevationGrid: manages the elevation dataset and provides
 * precomputed ECEF positions for the apex search.
 */
import { DEG2RAD, WGS84_A, WGS84_E2 } from "../constants.js";

/**
 * Known peak corrections: sharp summits that ETOPO 2022 underestimates
 * at 2-arc-minute resolution due to spatial averaging.
 * Each entry: { lat, lon, elev, name }
 */
const PEAK_CORRECTIONS_NORTH = [
  { lat: 66.935, lon: -36.786, elev: 3383, name: "Mont Forel" },
  { lat: 68.919, lon: -29.899, elev: 3694, name: "Gunnbjorn Fjeld" },
  { lat: 68.900, lon: -29.880, elev: 3683, name: "Dome (Watkins Range)" },
  { lat: 68.880, lon: -29.850, elev: 3669, name: "Cone (Watkins Range)" },
];

// No corrections needed for south — the ETOPO ice surface elevations
// are already accurate for the broad glaciated Antarctic Peninsula ridge.
const PEAK_CORRECTIONS_SOUTH = [];

export class ElevationGrid {
  /**
   * @param {import('./elevation-loader.js').ElevationData} data
   */
  constructor(data) {
    this.latMin = data.latMin;
    this.latMax = data.latMax;
    this.lonMin = data.lonMin;
    this.lonMax = data.lonMax;
    this.nRows = data.nRows;
    this.nCols = data.nCols;
    this.elevations = data.elevations;
    this.latStep = (data.latMax - data.latMin) / (data.nRows - 1);
    this.lonStep = (data.lonMax - data.lonMin) / (data.nCols - 1);

    // Apply known peak corrections before precomputing ECEF
    this._applyPeakCorrections();

    // Precompute flat arrays
    const count = this.nRows * this.nCols;
    this.count = count;
    this.lats = new Float32Array(count);
    this.lons = new Float32Array(count);
    this.ecef = new Float64Array(count * 3);

    this._precompute();
  }

  /**
   * Override grid cells for known peaks whose true elevation exceeds
   * what ETOPO captures at 2-arc-minute resolution.
   */
  _applyPeakCorrections() {
    const corrections = this.latMin >= 0 ? PEAK_CORRECTIONS_NORTH : PEAK_CORRECTIONS_SOUTH;
    for (const peak of corrections) {
      const row = Math.round((peak.lat - this.latMin) / this.latStep);
      const col = Math.round((peak.lon - this.lonMin) / this.lonStep);
      if (row < 0 || row >= this.nRows || col < 0 || col >= this.nCols) continue;
      const idx = row * this.nCols + col;
      const old = this.elevations[idx];
      if (peak.elev > old) {
        this.elevations[idx] = peak.elev;
        console.log(
          `Peak correction: ${peak.name} at ${peak.lat}°N, ${peak.lon}°E ` +
          `→ ${old}m → ${peak.elev}m`
        );
      }
    }
  }

  /** Precompute lat/lon arrays and ECEF positions for every grid point. */
  _precompute() {
    let idx = 0;
    for (let row = 0; row < this.nRows; row++) {
      const latDeg = this.latMin + row * this.latStep;
      const lat = latDeg * DEG2RAD;
      const sinLat = Math.sin(lat);
      const cosLat = Math.cos(lat);
      const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);

      for (let col = 0; col < this.nCols; col++) {
        const lonDeg = this.lonMin + col * this.lonStep;
        const lon = lonDeg * DEG2RAD;
        const h = this.elevations[row * this.nCols + col];

        // Clamp negative elevations (ocean floor) to 0 for surface apex
        const elev = Math.max(h, 0);

        this.lats[idx] = latDeg;
        this.lons[idx] = lonDeg;

        const j = idx * 3;
        this.ecef[j] = (N + elev) * cosLat * Math.cos(lon);
        this.ecef[j + 1] = (N + elev) * cosLat * Math.sin(lon);
        this.ecef[j + 2] = (N * (1 - WGS84_E2) + elev) * sinLat;

        idx++;
      }
    }
  }

  /**
   * Get elevation at a specific lat/lon (nearest-neighbor).
   * @param {number} latDeg
   * @param {number} lonDeg
   * @returns {number} elevation in meters
   */
  getElevation(latDeg, lonDeg) {
    const row = Math.round((latDeg - this.latMin) / this.latStep);
    const col = Math.round((lonDeg - this.lonMin) / this.lonStep);
    if (row < 0 || row >= this.nRows || col < 0 || col >= this.nCols) return 0;
    return this.elevations[row * this.nCols + col];
  }
}

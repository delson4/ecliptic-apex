/**
 * Apex track: loads precomputed track data or computes a simple ellipsoid-only
 * fallback, and renders it as a polyline on the globe.
 */
import * as Cesium from "cesium";
import { OBLIQUITY_RAD, WGS84_A, WGS84_E2, DEG2RAD } from "../constants.js";

/**
 * Load a precomputed track binary file.
 * Format: int32 count + count * 3 float32 (lat, lon, elev).
 *
 * @param {string} url
 * @returns {Promise<{ positions: Cesium.Cartesian3[], lats: number[], lons: number[], elevs: number[] }>}
 */
export async function loadPrecomputedTrack(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Track load failed: ${response.status}`);
  const buffer = await response.arrayBuffer();

  const view = new DataView(buffer);
  const count = view.getInt32(0, true);
  const lats = [];
  const lons = [];
  const elevs = [];
  const positions = [];

  for (let i = 0; i < count; i++) {
    const offset = 4 + i * 12;
    const lat = view.getFloat32(offset, true);
    const lon = view.getFloat32(offset + 4, true);
    const elev = view.getFloat32(offset + 8, true);
    lats.push(lat);
    lons.push(lon);
    elevs.push(elev);
    positions.push(Cesium.Cartesian3.fromDegrees(lon, lat, elev + 200));
  }

  console.log(`Loaded precomputed track: ${count} samples`);
  return { positions, lats, lons, elevs };
}

/**
 * Compute the optimal ellipsoid latitude for a smooth fallback track.
 * @param {boolean} south
 */
function computeOptimalEllipsoidLat(south = false) {
  const sinE = Math.sin(OBLIQUITY_RAD);
  const cosE = Math.cos(OBLIQUITY_RAD);
  const cosSign = south ? -1 : 1;
  let bestH = -Infinity;
  let bestLat = south ? -66.56 : 66.56;
  const latStart = south ? -69 : 64;
  const latEnd = south ? -64 : 69;
  for (let latDeg = latStart; latDeg <= latEnd; latDeg += 0.001) {
    const lat = latDeg * DEG2RAD;
    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);
    const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
    const h = sinE * N * cosLat + cosSign * cosE * N * (1 - WGS84_E2) * sinLat;
    if (h > bestH) {
      bestH = h;
      bestLat = latDeg;
    }
  }
  return { lat: bestLat, hMax: bestH };
}

/**
 * Compute a simple ellipsoid-only track (smooth circle, no grid scan needed).
 * Used when topo is disabled.
 * @param {boolean} south
 * @param {number} numSamples
 */
export function computeEllipsoidTrack(south = false, numSamples = 7200) {
  const sinE = Math.sin(OBLIQUITY_RAD);
  const cosE = Math.cos(OBLIQUITY_RAD);
  const ellipsoid = computeOptimalEllipsoidLat(south);

  const positions = [];
  const lats = [];
  const lons = [];
  const elevs = [];

  for (let s = 0; s <= numSamples; s++) {
    const gmstRad = (s / numSamples) * 2 * Math.PI;
    const cosG = Math.cos(gmstRad);
    const sinG = Math.sin(gmstRad);

    let ex, ey;
    if (south) {
      ex = sinE * sinG;
      ey = sinE * cosG;
    } else {
      ex = -sinE * sinG;
      ey = -sinE * cosG;
    }

    const enpLonDeg = Math.atan2(ey, ex) * (180 / Math.PI);

    lats.push(ellipsoid.lat);
    lons.push(enpLonDeg);
    elevs.push(0);
    positions.push(Cesium.Cartesian3.fromDegrees(enpLonDeg, ellipsoid.lat, 200));
  }

  return { positions, lats, lons, elevs };
}

/**
 * Create the track entity on a viewer.
 * @param {Cesium.Viewer} viewer
 * @param {Cesium.Cartesian3[]} positions
 * @returns {Cesium.Entity}
 */
export function createTrackEntity(viewer, positions) {
  return viewer.entities.add({
    name: "Apex Track",
    polyline: {
      positions,
      width: 4,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.15,
        color: Cesium.Color.fromCssColorString("#44ff88").withAlpha(0.6),
      }),
      clampToGround: false,
      arcType: Cesium.ArcType.GEODESIC,
    },
  });
}

/**
 * Ecliptic plane computations: transform ENP to ECEF, compute ecliptic height.
 */
import * as Cesium from "cesium";
import { ENP_ICRF } from "../constants.js";

// Scratch objects to avoid per-frame allocation
const _scratchIcrfToFixed = new Cesium.Matrix3();
const _scratchENP = new Cesium.Cartesian3();

/**
 * Compute the Ecliptic North Pole direction in ECEF frame at a given time.
 * Uses CesiumJS ICRF-to-Fixed (ITRF) rotation matrix.
 *
 * @param {Cesium.JulianDate} julianDate
 * @param {boolean} [south=false] - If true, return the negated ENP (ecliptic south pole)
 * @returns {Float64Array} [x, y, z] unit vector of ENP (or ESP) in ECEF
 */
export function enpInECEF(julianDate, south = false) {
  const mtx = Cesium.Transforms.computeIcrfToFixedMatrix(julianDate, _scratchIcrfToFixed);
  if (!mtx) {
    const gmstMtx = Cesium.Transforms.computeTemeToPseudoFixedMatrix(julianDate, _scratchIcrfToFixed);
    Cesium.Matrix3.multiplyByVector(
      gmstMtx,
      new Cesium.Cartesian3(ENP_ICRF[0], ENP_ICRF[1], ENP_ICRF[2]),
      _scratchENP
    );
  } else {
    Cesium.Matrix3.multiplyByVector(
      mtx,
      new Cesium.Cartesian3(ENP_ICRF[0], ENP_ICRF[1], ENP_ICRF[2]),
      _scratchENP
    );
  }
  const sign = south ? -1 : 1;
  return new Float64Array([sign * _scratchENP.x, sign * _scratchENP.y, sign * _scratchENP.z]);
}

/**
 * Compute the ecliptic height (dot product of position with ENP_ecef).
 * @param {Float64Array} ecefPos - [x, y, z] position in ECEF (meters)
 * @param {Float64Array} enpEcef - [x, y, z] ENP unit vector in ECEF
 * @returns {number} height above ecliptic plane in meters
 */
export function eclipticHeight(ecefPos, enpEcef) {
  return ecefPos[0] * enpEcef[0] + ecefPos[1] * enpEcef[1] + ecefPos[2] * enpEcef[2];
}

/**
 * Compute the ecliptic height for a batch of ECEF positions.
 * @param {Float64Array} ecefBatch - flat [x0,y0,z0, x1,y1,z1, ...] ECEF positions
 * @param {Float64Array} enpEcef - [x, y, z] ENP unit vector in ECEF
 * @returns {{ maxIndex: number, maxHeight: number }} Index and height of maximum
 */
export function findMaxEclipticHeight(ecefBatch, enpEcef) {
  const n = ecefBatch.length / 3;
  let maxHeight = -Infinity;
  let maxIndex = 0;
  const ex = enpEcef[0], ey = enpEcef[1], ez = enpEcef[2];
  for (let i = 0; i < n; i++) {
    const j = i * 3;
    const h = ecefBatch[j] * ex + ecefBatch[j + 1] * ey + ecefBatch[j + 2] * ez;
    if (h > maxHeight) {
      maxHeight = h;
      maxIndex = i;
    }
  }
  return { maxIndex, maxHeight };
}

/**
 * Get the Cesium Quaternion for the ecliptic plane orientation at a given time.
 * The plane's normal is the ENP in ECEF.
 * @param {Cesium.JulianDate} julianDate
 * @returns {Cesium.Quaternion}
 */
export function eclipticPlaneOrientation(julianDate) {
  const enp = enpInECEF(julianDate);
  const normal = new Cesium.Cartesian3(enp[0], enp[1], enp[2]);
  Cesium.Cartesian3.normalize(normal, normal);

  // Build a rotation matrix whose Z-axis is the ENP direction
  const zAxis = normal;
  let xAxis = new Cesium.Cartesian3();
  let yAxis = new Cesium.Cartesian3();

  // Pick an arbitrary non-parallel vector for cross product
  const ref = Math.abs(Cesium.Cartesian3.dot(zAxis, Cesium.Cartesian3.UNIT_X)) < 0.9
    ? Cesium.Cartesian3.UNIT_X
    : Cesium.Cartesian3.UNIT_Y;

  Cesium.Cartesian3.cross(zAxis, ref, yAxis);
  Cesium.Cartesian3.normalize(yAxis, yAxis);
  Cesium.Cartesian3.cross(yAxis, zAxis, xAxis);
  Cesium.Cartesian3.normalize(xAxis, xAxis);

  const rotMtx = new Cesium.Matrix3(
    xAxis.x, yAxis.x, zAxis.x,
    xAxis.y, yAxis.y, zAxis.y,
    xAxis.z, yAxis.z, zAxis.z
  );
  return Cesium.Quaternion.fromRotationMatrix(rotMtx);
}

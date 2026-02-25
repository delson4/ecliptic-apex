/**
 * Load preprocessed ETOPO binary elevation data.
 * File format: 24-byte header + Int16Array payload
 *   Header: latMin(f32), latMax(f32), lonMin(f32), lonMax(f32), nRows(i32), nCols(i32)
 *   Payload: nRows × nCols Int16 values (row-major, south-to-north, west-to-east)
 */

/**
 * @typedef {Object} ElevationData
 * @property {number} latMin
 * @property {number} latMax
 * @property {number} lonMin
 * @property {number} lonMax
 * @property {number} nRows
 * @property {number} nCols
 * @property {Int16Array} elevations
 */

/**
 * Fetch and parse a binary elevation file.
 * @param {string} url - URL to the .bin file
 * @returns {Promise<ElevationData>}
 */
export async function loadElevationData(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load elevation data: ${response.status} ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();

  // Parse 24-byte header
  const headerView = new DataView(buffer, 0, 24);
  const latMin = headerView.getFloat32(0, true);
  const latMax = headerView.getFloat32(4, true);
  const lonMin = headerView.getFloat32(8, true);
  const lonMax = headerView.getFloat32(12, true);
  const nRows = headerView.getInt32(16, true);
  const nCols = headerView.getInt32(20, true);

  // Parse elevation payload
  const elevations = new Int16Array(buffer, 24);

  if (elevations.length !== nRows * nCols) {
    throw new Error(
      `Elevation data size mismatch: expected ${nRows * nCols}, got ${elevations.length}`
    );
  }

  console.log(
    `Loaded elevation grid: ${nRows}×${nCols}, ` +
    `lat [${latMin}, ${latMax}], lon [${lonMin}, ${lonMax}]`
  );

  return { latMin, latMax, lonMin, lonMax, nRows, nCols, elevations };
}

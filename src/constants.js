/**
 * Physical and astronomical constants for ecliptic apex computation.
 */

// WGS84 ellipsoid parameters
export const WGS84_A = 6378137.0; // Semi-major axis (m)
export const WGS84_B = 6356752.314245; // Semi-minor axis (m)
export const WGS84_F = 1 / 298.257223563; // Flattening
export const WGS84_E2 = 2 * WGS84_F - WGS84_F * WGS84_F; // First eccentricity squared

// Earth's obliquity (axial tilt) — J2000.0 mean value
export const OBLIQUITY_DEG = 23.4392911;
export const OBLIQUITY_RAD = OBLIQUITY_DEG * Math.PI / 180;

// Ecliptic North Pole (ENP) unit vector in ICRF/J2000 equatorial coordinates
// ENP = (0, -sin(ε), cos(ε)) where ε is Earth's obliquity
// This is the pole of the ecliptic plane in the inertial frame.
export const ENP_ICRF = Object.freeze([
  0,
  -Math.sin(OBLIQUITY_RAD),
  Math.cos(OBLIQUITY_RAD),
]);

// Sidereal day in seconds
export const SIDEREAL_DAY_S = 86164.0905;

// Degrees per hour of Earth rotation (sidereal)
export const DEG_PER_HOUR_SIDEREAL = 360 / (SIDEREAL_DAY_S / 3600);

// Elevation grid search bounds (latitude band)
export const GRID_LAT_MIN = 60.0;
export const GRID_LAT_MAX = 75.0;
export const GRID_LAT_MIN_S = -75.0;
export const GRID_LAT_MAX_S = -60.0;

// Conversion helpers
export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

/**
 * Ecliptic plane visualization.
 * Renders a semi-transparent disc through Earth's center, perpendicular to the ENP.
 * Uses a polyline ring (great circle in the ecliptic plane) since CesiumJS
 * doesn't easily support filled polygons through the Earth's interior.
 */
import * as Cesium from "cesium";
import { enpInECEF } from "../math/ecliptic.js";

const RING_SEGMENTS = 180;
const RING_RADIUS = 14000000; // 14,000 km — larger than Earth

/**
 * Generate ring vertices in the ecliptic plane for a given time.
 * @param {Cesium.JulianDate} julianDate
 * @returns {Cesium.Cartesian3[]}
 */
function computeRingPositions(julianDate) {
  const enp = enpInECEF(julianDate);
  const normal = new Cesium.Cartesian3(enp[0], enp[1], enp[2]);
  Cesium.Cartesian3.normalize(normal, normal);

  // Build orthonormal basis in the ecliptic plane
  const ref = Math.abs(Cesium.Cartesian3.dot(normal, Cesium.Cartesian3.UNIT_X)) < 0.9
    ? Cesium.Cartesian3.UNIT_X
    : Cesium.Cartesian3.UNIT_Y;

  const u = new Cesium.Cartesian3();
  Cesium.Cartesian3.cross(normal, ref, u);
  Cesium.Cartesian3.normalize(u, u);

  const v = new Cesium.Cartesian3();
  Cesium.Cartesian3.cross(normal, u, v);
  Cesium.Cartesian3.normalize(v, v);

  const positions = [];
  for (let i = 0; i <= RING_SEGMENTS; i++) {
    const angle = (2 * Math.PI * i) / RING_SEGMENTS;
    const x = RING_RADIUS * Math.cos(angle);
    const y = RING_RADIUS * Math.sin(angle);
    positions.push(new Cesium.Cartesian3(
      u.x * x + v.x * y,
      u.y * x + v.y * y,
      u.z * x + v.z * y
    ));
  }
  return positions;
}

/**
 * Create the ecliptic plane visualization as a polyline ring + radial spokes.
 * @param {Cesium.Viewer} viewer
 * @returns {{ ring: Cesium.Entity, setVisible: function(boolean): void }}
 */
export function createEclipticPlanePolygon(viewer) {
  // Main ring
  const ring = viewer.entities.add({
    name: "Ecliptic Plane",
    polyline: {
      positions: new Cesium.CallbackProperty((time) => {
        return computeRingPositions(time);
      }, false),
      width: 2,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.4,
        color: new Cesium.Color(0.3, 0.6, 1.0, 0.6),
      }),
      arcType: Cesium.ArcType.NONE, // straight lines in ECEF, not geodesic
    },
  });

  // Add radial spokes for visual fill effect
  const spokeCount = 36;
  const spokes = [];
  for (let i = 0; i < spokeCount; i++) {
    const spoke = viewer.entities.add({
      polyline: {
        positions: new Cesium.CallbackProperty((time) => {
          const enp = enpInECEF(time);
          const normal = new Cesium.Cartesian3(enp[0], enp[1], enp[2]);
          Cesium.Cartesian3.normalize(normal, normal);

          const ref = Math.abs(Cesium.Cartesian3.dot(normal, Cesium.Cartesian3.UNIT_X)) < 0.9
            ? Cesium.Cartesian3.UNIT_X
            : Cesium.Cartesian3.UNIT_Y;
          const u = new Cesium.Cartesian3();
          Cesium.Cartesian3.cross(normal, ref, u);
          Cesium.Cartesian3.normalize(u, u);
          const v = new Cesium.Cartesian3();
          Cesium.Cartesian3.cross(normal, u, v);
          Cesium.Cartesian3.normalize(v, v);

          const angle = (2 * Math.PI * i) / spokeCount;
          const x = RING_RADIUS * Math.cos(angle);
          const y = RING_RADIUS * Math.sin(angle);
          return [
            Cesium.Cartesian3.ZERO,
            new Cesium.Cartesian3(
              u.x * x + v.x * y,
              u.y * x + v.y * y,
              u.z * x + v.z * y
            ),
          ];
        }, false),
        width: 1,
        material: new Cesium.Color(0.2, 0.5, 1.0, 0.06),
        arcType: Cesium.ArcType.NONE,
      },
    });
    spokes.push(spoke);
  }

  function setVisible(visible) {
    ring.show = visible;
    spokes.forEach((s) => (s.show = visible));
  }

  return { ring, spokes, setVisible };
}

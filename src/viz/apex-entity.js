/**
 * Apex point entity — red dot marking the current apex position.
 */
import * as Cesium from "cesium";

/**
 * Create the apex marker entity (for 3D globe).
 * @param {Cesium.Viewer} viewer
 * @returns {Cesium.Entity}
 */
export function createApexEntity(viewer) {
  return viewer.entities.add({
    name: "Ecliptic Apex",
    position: Cesium.Cartesian3.fromDegrees(0, 66.56, 1000),
    point: {
      pixelSize: 12,
      color: Cesium.Color.fromCssColorString("#ff4444"),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      heightReference: Cesium.HeightReference.NONE,
    },
    label: {
      text: "APEX",
      font: "bold 12px sans-serif",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -16),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
}

/**
 * Create a simple apex marker for the 2D map view.
 * @param {Cesium.Viewer} viewer
 * @returns {Cesium.Entity}
 */
export function createApexEntity2D(viewer) {
  return viewer.entities.add({
    name: "Ecliptic Apex",
    position: Cesium.Cartesian3.fromDegrees(0, 66.56, 1000),
    point: {
      pixelSize: 12,
      color: Cesium.Color.fromCssColorString("#ff4444"),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      heightReference: Cesium.HeightReference.NONE,
    },
    label: {
      text: "APEX",
      font: "bold 12px sans-serif",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -16),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
}

/**
 * Update the apex entity position directly.
 * @param {Cesium.Entity} entity
 * @param {number} lat
 * @param {number} lon
 * @param {number} elev
 */
export function updateApexPosition(entity, lat, lon, elev) {
  entity.position = Cesium.Cartesian3.fromDegrees(lon, lat, elev + 500);
}

/**
 * 2D CesiumJS Map viewer (synced with 3D globe).
 */
import * as Cesium from "cesium";

/**
 * Create the 2D map viewer with its own independent clock.
 * We don't share a clock — instead, app.js copies the time each tick.
 * @param {string} containerId - DOM element ID
 * @returns {Cesium.Viewer}
 */
export function createMapViewer(containerId) {
  const viewer = new Cesium.Viewer(containerId, {
    sceneMode: Cesium.SceneMode.SCENE2D,
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    navigationHelpButton: false,
    sceneModePicker: false,
    fullscreenButton: false,
    selectionIndicator: false,
    infoBox: false,
    creditContainer: document.createElement("div"),
    baseLayer: new Cesium.ImageryLayer(
      new Cesium.OpenStreetMapImageryProvider({ url: "https://tile.openstreetmap.org/" })
    ),
    shouldAnimate: false, // We manually sync time from globe viewer
  });

  // Center on the ~66.56°N latitude band
  viewer.camera.setView({
    destination: Cesium.Rectangle.fromDegrees(-180, 55, 180, 80),
  });

  return viewer;
}

/**
 * Sync the 2D map camera to track the apex longitude.
 * @param {Cesium.Viewer} mapViewer
 * @param {number} lonDeg - Apex longitude
 */
export function syncMapToApex(mapViewer, lonDeg) {
  const cam = mapViewer.camera;
  const currentRect = cam.computeViewRectangle();
  if (!currentRect) return;

  const lonSpan = 120; // degrees of longitude visible

  mapViewer.camera.setView({
    destination: Cesium.Rectangle.fromDegrees(
      lonDeg - lonSpan / 2,
      55,
      lonDeg + lonSpan / 2,
      80
    ),
  });
}

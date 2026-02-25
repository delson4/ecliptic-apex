/**
 * 3D CesiumJS Globe viewer setup.
 */
import * as Cesium from "cesium";

/**
 * Create the 3D globe viewer. The viewer creates and owns the clock.
 * @param {string} containerId - DOM element ID
 * @returns {Cesium.Viewer}
 */
export function createGlobeViewer(containerId) {
  const viewer = new Cesium.Viewer(containerId, {
    sceneMode: Cesium.SceneMode.SCENE3D,
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
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    shouldAnimate: true,
  });

  // Configure the viewer's own clock
  viewer.clock.multiplier = 60;
  viewer.clock.shouldAnimate = true;
  viewer.clock.clockRange = Cesium.ClockRange.UNBOUNDED;

  // Set initial camera to view the Arctic region
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(0, 66.56, 15000000),
    orientation: {
      heading: 0,
      pitch: Cesium.Math.toRadians(-60),
      roll: 0,
    },
    duration: 0,
  });

  // Enable lighting for visual reference
  viewer.scene.globe.enableLighting = true;

  return viewer;
}

/**
 * Main application controller: orchestrates apex computation, viewer updates,
 * and UI synchronization.
 */
import * as Cesium from "cesium";
import { enpInECEF } from "./math/ecliptic.js";
import { searchApex, generateEllipsoidGrid, findAbsoluteMaximum } from "./math/apex-search.js";
import { loadElevationData } from "./data/elevation-loader.js";
import { ElevationGrid } from "./data/elevation-grid.js";
import { createGlobeViewer } from "./viz/globe-view.js";
import { createEclipticPlanePolygon } from "./viz/ecliptic-plane.js";
import { createApexEntity, updateApexPosition } from "./viz/apex-entity.js";
import { loadPrecomputedTrack, computeEllipsoidTrack, createTrackEntity } from "./viz/apex-track.js";
import { updateInfoPanel, updateAbsoluteMaxPanel, updatePanelTitle } from "./ui/info-panel.js";
import { initControls, syncDatetimeInput } from "./ui/controls.js";
import { showLoading, hideLoading } from "./ui/loading.js";
import { GRID_LAT_MIN, GRID_LAT_MAX, GRID_LAT_MIN_S, GRID_LAT_MAX_S, SIDEREAL_DAY_S, RAD2DEG } from "./constants.js";
import { gmstDeg } from "./math/sidereal.js";

export class App {
  constructor() {
    this.globeViewer = null;
    this.apexEntity = null;
    this.planeViz = null;
    this.controlState = null;

    // Data — north and south elevation grids
    this.elevGridNorth = null;
    this.elevGridSouth = null;
    this.ellipsoidGridNorth = null;
    this.ellipsoidGridSouth = null;

    // Precomputed track data and entity
    this.trackEntity = null;
    this._trackNorth = null;
    this._trackSouth = null;

    // Absolute maximum cache
    this._absMax = null;

    // Track last update to throttle
    this._lastUpdateSec = -Infinity;

    // Loading state
    this._busy = false;

    // Track previous control values to detect real changes
    this._prevHemisphere = "north";
    this._prevTopoEnabled = true;
  }

  /** The authoritative clock — owned by the globe viewer. */
  get clock() {
    return this.globeViewer.clock;
  }

  /** Whether we're in south hemisphere mode. */
  get _isSouth() {
    return this.controlState && this.controlState.hemisphere === "south";
  }

  /** The active elevation grid for the current hemisphere. */
  get elevGrid() {
    return this._isSouth ? this.elevGridSouth : this.elevGridNorth;
  }

  /** The active ellipsoid grid for the current hemisphere. */
  get ellipsoidGrid() {
    return this._isSouth ? this.ellipsoidGridSouth : this.ellipsoidGridNorth;
  }

  async init() {
    showLoading("Creating viewer...");

    // Create viewer
    this.globeViewer = createGlobeViewer("globe-viewer");

    console.log("Viewer created. Clock animating:", this.clock.shouldAnimate,
      "multiplier:", this.clock.multiplier);

    // Preload ICRF data for accurate Earth orientation
    showLoading("Loading Earth orientation data...");
    try {
      await Cesium.Transforms.preloadIcrfFixed(
        new Cesium.TimeInterval({
          start: Cesium.JulianDate.fromDate(new Date(Date.now() - 86400000 * 365)),
          stop: Cesium.JulianDate.fromDate(new Date(Date.now() + 86400000 * 365)),
        })
      );
      console.log("ICRF data preloaded");
    } catch (e) {
      console.warn("ICRF preload failed, falling back to TEME:", e);
    }

    // Create ecliptic plane entity
    this.planeViz = createEclipticPlanePolygon(this.globeViewer);

    // Create apex entity
    this.apexEntity = createApexEntity(this.globeViewer);

    // Generate fallback ellipsoid grids for both hemispheres
    this.ellipsoidGridNorth = generateEllipsoidGrid(GRID_LAT_MIN, GRID_LAT_MAX, 0.1, 0.1);
    this.ellipsoidGridSouth = generateEllipsoidGrid(GRID_LAT_MIN_S, GRID_LAT_MAX_S, 0.1, 0.1);

    // Initialize controls
    this.controlState = initControls(this.clock, (state) => {
      this._onControlChange(state);
    });

    // Wire up camera/time buttons
    this._initGotoMaxButton();

    // Break out of locked camera modes on user interaction
    this._initCameraModeBreaker();

    // Load elevation data and precomputed tracks
    showLoading("Loading data...");
    await this._loadElevationData();
    await this._loadPrecomputedTracks();

    // Display the track and compute absolute maximum
    this._applyTrack();
    this._computeAbsoluteMaximum();

    // Use postRender for reliable per-frame updates
    this.globeViewer.scene.postRender.addEventListener(this._onTick.bind(this));

    console.log("Ecliptic Apex — tick loop registered");
    hideLoading();
  }

  async _loadElevationData() {
    // Load north
    try {
      const data = await loadElevationData("/data/etopo_60N_75N_2min.bin");
      this.elevGridNorth = new ElevationGrid(data);
      console.log(`North elevation grid ready: ${this.elevGridNorth.count} points`);
    } catch (e) {
      console.warn("North elevation data not available:", e.message);
    }

    // Load south
    try {
      const data = await loadElevationData("/data/etopo_60S_75S_2min.bin");
      this.elevGridSouth = new ElevationGrid(data);
      console.log(`South elevation grid ready: ${this.elevGridSouth.count} points`);
    } catch (e) {
      console.warn("South elevation data not available:", e.message);
    }
  }

  async _loadPrecomputedTracks() {
    try {
      this._trackNorth = await loadPrecomputedTrack("/data/track_north.bin");
    } catch (e) {
      console.warn("North track not available:", e.message);
    }
    try {
      this._trackSouth = await loadPrecomputedTrack("/data/track_south.bin");
    } catch (e) {
      console.warn("South track not available:", e.message);
    }
  }

  /**
   * Apply the correct track for the current hemisphere and topo setting.
   * Uses precomputed data when available, falls back to ellipsoid-only.
   */
  _applyTrack() {
    const useTopo = this.controlState.topoEnabled;
    const precomputed = this._isSouth ? this._trackSouth : this._trackNorth;

    let track;
    if (useTopo && precomputed) {
      track = precomputed;
    } else {
      // Lightweight ellipsoid-only circle (no grid scan, instant)
      track = computeEllipsoidTrack(this._isSouth);
    }

    // Remove old track entity
    if (this.trackEntity) this.globeViewer.entities.remove(this.trackEntity);

    // Add new track entity
    this.trackEntity = createTrackEntity(this.globeViewer, track.positions);
  }

  _computeAbsoluteMaximum() {
    const useTopo = this.controlState.topoEnabled && this.elevGrid !== null;
    const grid = useTopo ? this.elevGrid : this.ellipsoidGrid;

    const absMax = findAbsoluteMaximum(
      grid.ecef, grid.lats, grid.lons,
      useTopo ? this.elevGrid.elevations : null,
      this._isSouth
    );

    const latDir = absMax.lat >= 0 ? "N" : "S";
    const lonDir = absMax.lon >= 0 ? "E" : "W";
    console.log(
      `%c=== GLOBAL MAXIMUM (${this._isSouth ? "SOUTH" : "NORTH"}) ===%c\n` +
      `  ${absMax.name || "Unknown"}\n` +
      `  Location: ${Math.abs(absMax.lat).toFixed(4)}° ${latDir}, ${Math.abs(absMax.lon).toFixed(4)}° ${lonDir}\n` +
      `  Elevation: ${absMax.elev} m | Max height: ${absMax.eclipticHeightKm.toFixed(3)} km\n` +
      `  Topo advantage: ${absMax.topoAdvantageM.toFixed(1)} m above pure ellipsoid`,
      "color: #ff4; font-weight: bold;", "color: #8f8;"
    );

    // Compute the next UTC time when this maximum occurs.
    const now = Cesium.JulianDate.toDate(this.clock.currentTime);
    const currentGmstDeg = gmstDeg(now);
    const targetGmstDeg = ((absMax.gmstRad * RAD2DEG) % 360 + 360) % 360;
    let deltaDeg = targetGmstDeg - currentGmstDeg;
    if (deltaDeg < 0) deltaDeg += 360;

    const deltaSeconds = (deltaDeg / 360) * SIDEREAL_DAY_S;
    const nextOccurrence = new Date(now.getTime() + deltaSeconds * 1000);

    absMax.nextUtc = nextOccurrence.toISOString().replace("T", " ").slice(0, 19) + " UTC";
    absMax.nextDate = nextOccurrence;

    this._absMax = absMax;
    updateAbsoluteMaxPanel(absMax);
  }

  /**
   * Auto-revert camera mode to "free" when the user interacts with the globe.
   */
  _initCameraModeBreaker() {
    const canvas = this.globeViewer.scene.canvas;
    const revert = () => {
      if (this.controlState.cameraMode !== "free") {
        this.controlState.cameraMode = "free";
        const el = document.getElementById("camera-mode");
        if (el) el.value = "free";
      }
    };
    // Mouse drag or wheel zoom = user wants control
    canvas.addEventListener("pointerdown", revert);
    canvas.addEventListener("wheel", revert);
  }

  /**
   * Update camera for locked modes (ecliptic / follow apex).
   * Called every frame from _onTick.
   * @param {number} apexLat
   * @param {number} apexLon
   * @param {number} apexElev
   */
  _updateCamera(apexLat, apexLon, apexElev) {
    const mode = this.controlState.cameraMode;
    if (mode === "free") return;

    if (mode === "ecliptic") {
      // Camera fixed in inertial space on the ecliptic plane.
      // Earth rotates underneath; apex sweeps along the top of the silhouette.
      // Uses the vernal equinox direction (ICRF X-axis), which lies in the
      // ecliptic plane and rotates smoothly in ECEF — giving a rock-steady view.
      const julianDate = this.clock.currentTime;

      // ENP in ECEF (camera "up")
      const enp = enpInECEF(julianDate, this._isSouth);
      const enpDir = new Cesium.Cartesian3(enp[0], enp[1], enp[2]);
      Cesium.Cartesian3.normalize(enpDir, enpDir);

      // Vernal equinox in ECEF = first column of ICRF-to-Fixed matrix
      const mtx = Cesium.Transforms.computeIcrfToFixedMatrix(julianDate);
      if (!mtx) return; // ICRF data not loaded yet
      const vernalDir = new Cesium.Cartesian3();
      Cesium.Matrix3.getColumn(mtx, 0, vernalDir);

      const cameraPos = Cesium.Cartesian3.multiplyByScalar(
        vernalDir, 45000000, new Cesium.Cartesian3()
      );
      const lookDir = Cesium.Cartesian3.negate(vernalDir, new Cesium.Cartesian3());

      this.globeViewer.camera.setView({
        destination: cameraPos,
        orientation: { direction: lookDir, up: enpDir },
      });
    } else if (mode === "follow") {
      // Camera above the apex, looking straight down
      this.globeViewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(apexLon, apexLat, 1500000),
        orientation: {
          heading: 0,
          pitch: Cesium.Math.toRadians(-90),
          roll: 0,
        },
      });
    }
  }

  /**
   * "Go to Max Time" — jump clock + snap camera to the maximum location.
   */
  _initGotoMaxButton() {
    const btn = document.getElementById("btn-goto-max");
    if (!btn) return;

    btn.addEventListener("click", () => {
      if (!this._absMax || this._busy) return;

      // Pause clock and keep it paused so user can inspect the max
      this.clock.shouldAnimate = false;
      this.controlState.playing = false;
      const playPauseBtn = document.getElementById("btn-play-pause");
      if (playPauseBtn) playPauseBtn.textContent = "\u25B6";

      // Jump the clock to the next occurrence of the absolute maximum
      this.clock.currentTime = Cesium.JulianDate.fromDate(this._absMax.nextDate);
      this._lastUpdateSec = -Infinity;

      // Force an immediate apex update at the new time
      this._forceUpdate();

      // Snap camera looking straight down at the apex location
      this.globeViewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(
          this._absMax.lon, this._absMax.lat, 1500000
        ),
        orientation: {
          heading: 0,
          pitch: Cesium.Math.toRadians(-90),
          roll: 0,
        },
      });

      // Recompute so "next occurs" updates relative to new time
      this._computeAbsoluteMaximum();
    });
  }

  _onControlChange(state) {
    // Lightweight toggles — no recomputation needed
    if (this.planeViz && this.planeViz.setVisible) {
      this.planeViz.setVisible(state.showPlane);
    }
    if (this.trackEntity) this.trackEntity.show = state.showTrail;

    // Check if anything that affects computation actually changed
    const hemisphereChanged = state.hemisphere !== this._prevHemisphere;
    const needsRecompute =
      hemisphereChanged ||
      state.topoEnabled !== this._prevTopoEnabled;

    this._prevHemisphere = state.hemisphere;
    this._prevTopoEnabled = state.topoEnabled;

    if (!needsRecompute) {
      this._lastUpdateSec = -Infinity;
      return;
    }

    // Update title for hemisphere
    updatePanelTitle(this._isSouth);

    // Track and absolute max — now instant (precomputed tracks, no grid scan)
    this._applyTrack();
    this._computeAbsoluteMaximum();
    this._lastUpdateSec = -Infinity;

    // Reset camera to show the new hemisphere (ecliptic mode handles itself)
    if (hemisphereChanged && state.cameraMode !== "ecliptic") {
      const targetLat = this._isSouth ? -66.56 : 66.56;
      this.globeViewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(0, targetLat, 8000000),
        orientation: {
          heading: 0,
          pitch: Cesium.Math.toRadians(-90),
          roll: 0,
        },
      });
    }
  }

  /**
   * Force an immediate apex computation and entity update (bypasses throttle).
   */
  _forceUpdate() {
    const julianDate = this.clock.currentTime;

    const enpEcef = enpInECEF(julianDate, this._isSouth);
    const useTopo = this.controlState.topoEnabled && this.elevGrid !== null;
    const grid = useTopo ? this.elevGrid : this.ellipsoidGrid;

    const apex = searchApex(
      grid.ecef, grid.lats, grid.lons,
      useTopo ? this.elevGrid.elevations : null,
      enpEcef
    );

    updateApexPosition(this.apexEntity, apex.lat, apex.lon, apex.elev);

    this._lastApexLat = apex.lat;
    this._lastApexLon = apex.lon;
    this._lastApexElev = apex.elev;

    const utcDate = Cesium.JulianDate.toDate(julianDate);
    updateInfoPanel(apex, utcDate, useTopo);
    syncDatetimeInput(utcDate);

    this._lastUpdateSec = utcDate.getTime() / 1000;
  }

  _onTick() {
    if (this._busy) return;

    // Update locked camera modes every frame (even when apex is throttled)
    if (this.controlState.cameraMode !== "free") {
      this._updateCamera(
        this._lastApexLat ?? 66.56,
        this._lastApexLon ?? 0,
        this._lastApexElev ?? 0
      );
    }

    const julianDate = this.clock.currentTime;
    const epochSec = Cesium.JulianDate.toDate(julianDate).getTime() / 1000;

    // Throttle: skip if less than 5 simulated seconds since last update
    const simDelta = Math.abs(epochSec - this._lastUpdateSec);
    if (simDelta < 5) return;
    this._lastUpdateSec = epochSec;

    // Compute ENP in ECEF (negated for south hemisphere)
    const enpEcef = enpInECEF(julianDate, this._isSouth);

    // Choose grid
    const useTopo = this.controlState.topoEnabled && this.elevGrid !== null;
    const grid = useTopo ? this.elevGrid : this.ellipsoidGrid;

    // Search for apex
    const apex = searchApex(
      grid.ecef, grid.lats, grid.lons,
      useTopo ? this.elevGrid.elevations : null,
      enpEcef
    );

    // Cache latest apex position for camera follow
    this._lastApexLat = apex.lat;
    this._lastApexLon = apex.lon;
    this._lastApexElev = apex.elev;

    // Update entity trail
    updateApexPosition(this.apexEntity, apex.lat, apex.lon, apex.elev);

    // Update info panel
    const utcDate = Cesium.JulianDate.toDate(julianDate);
    updateInfoPanel(apex, utcDate, useTopo);

    // Sync datetime input
    syncDatetimeInput(utcDate);
  }
}

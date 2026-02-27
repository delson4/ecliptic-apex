/**
 * UI controls: speed selector, date picker, toggles.
 */
import * as Cesium from "cesium";

/**
 * @typedef {Object} ControlState
 * @property {number} speedMultiplier
 * @property {boolean} showPlane
 * @property {boolean} showTrail
 * @property {boolean} topoEnabled
 * @property {boolean} playing
 * @property {"north"|"south"} hemisphere
 * @property {"free"|"ecliptic"|"follow"} cameraMode
 */

/**
 * Initialize UI controls and return reactive state.
 * @param {Cesium.Clock} clock
 * @param {function(ControlState): void} onChange - Called when any control changes
 * @returns {ControlState}
 */
export function initControls(clock, onChange) {
  const state = {
    speedMultiplier: 1,
    showPlane: true,
    showTrail: true,
    topoEnabled: true,
    playing: true,
    hemisphere: "north",
    cameraMode: "ecliptic",
  };

  const elSpeed = document.getElementById("speed-select");
  const elDatetime = document.getElementById("datetime-input");
  const elBtnNow = document.getElementById("btn-now");
  const elBtnPlayPause = document.getElementById("btn-play-pause");
  const elTogglePlane = document.getElementById("toggle-plane");
  const elToggleTrail = document.getElementById("toggle-trail");
  const elToggleTopo = document.getElementById("toggle-topo");
  const elHemisphere = document.getElementById("hemisphere-select");
  const elCameraMode = document.getElementById("camera-mode");

  // Speed
  if (elSpeed) {
    elSpeed.addEventListener("change", () => {
      state.speedMultiplier = Number(elSpeed.value);
      clock.multiplier = state.speedMultiplier;
      onChange(state);
    });
    clock.multiplier = state.speedMultiplier;
  }

  // Date/time picker — pause animation while the user is editing
  let _datetimeFocused = false;
  if (elDatetime) {
    const now = new Date();
    elDatetime.value = now.toISOString().slice(0, 19);

    elDatetime.addEventListener("focus", () => {
      _datetimeFocused = true;
      // Pause while user edits the datetime
      clock.shouldAnimate = false;
    });

    // Apply the datetime on any value change (typing, spinner arrows, etc.)
    elDatetime.addEventListener("input", () => {
      _applyDatetime();
    });
    elDatetime.addEventListener("change", () => {
      _applyDatetime();
    });

    elDatetime.addEventListener("blur", () => {
      _datetimeFocused = false;
      // Resume animation if state says playing
      clock.shouldAnimate = state.playing;
    });

    function _applyDatetime() {
      const raw = elDatetime.value;
      if (!raw) return;
      const d = new Date(raw + "Z");
      if (!isNaN(d.getTime())) {
        clock.currentTime = Cesium.JulianDate.fromDate(d);
        onChange(state);
      }
    }
  }

  // Now button — reset to real time at 1x speed, playing
  if (elBtnNow) {
    elBtnNow.addEventListener("click", () => {
      clock.currentTime = Cesium.JulianDate.fromDate(new Date());
      if (elDatetime) {
        elDatetime.value = new Date().toISOString().slice(0, 19);
      }
      state.speedMultiplier = 1;
      clock.multiplier = 1;
      if (elSpeed) elSpeed.value = "1";
      state.playing = true;
      clock.shouldAnimate = true;
      if (elBtnPlayPause) elBtnPlayPause.textContent = "\u23F8";
      onChange(state);
    });
  }

  // Play/Pause
  if (elBtnPlayPause) {
    elBtnPlayPause.addEventListener("click", () => {
      state.playing = !state.playing;
      clock.shouldAnimate = state.playing;
      elBtnPlayPause.textContent = state.playing ? "\u23F8" : "\u25B6";
      onChange(state);
    });
  }

  // Toggles
  if (elTogglePlane) {
    elTogglePlane.addEventListener("change", () => {
      state.showPlane = elTogglePlane.checked;
      onChange(state);
    });
  }
  if (elToggleTrail) {
    elToggleTrail.addEventListener("change", () => {
      state.showTrail = elToggleTrail.checked;
      onChange(state);
    });
  }
  if (elToggleTopo) {
    elToggleTopo.addEventListener("change", () => {
      state.topoEnabled = elToggleTopo.checked;
      onChange(state);
    });
  }

  // Camera mode
  if (elCameraMode) {
    elCameraMode.addEventListener("change", () => {
      state.cameraMode = elCameraMode.value;
      onChange(state);
    });
  }

  // Hemisphere
  if (elHemisphere) {
    elHemisphere.addEventListener("change", () => {
      state.hemisphere = elHemisphere.value;
      onChange(state);
    });
  }

  // About overlay
  const elBtnAbout = document.getElementById("btn-about");
  const elAboutOverlay = document.getElementById("about-overlay");
  const elAboutClose = document.getElementById("about-close");
  if (elBtnAbout && elAboutOverlay) {
    elBtnAbout.addEventListener("click", () => {
      elAboutOverlay.classList.add("visible");
    });
    if (elAboutClose) {
      elAboutClose.addEventListener("click", () => {
        elAboutOverlay.classList.remove("visible");
      });
    }
    elAboutOverlay.addEventListener("click", (e) => {
      if (e.target === elAboutOverlay) {
        elAboutOverlay.classList.remove("visible");
      }
    });
  }

  return state;
}

/**
 * Update the datetime input to reflect the current clock time.
 * @param {Date} utcDate
 */
export function syncDatetimeInput(utcDate) {
  const el = document.getElementById("datetime-input");
  // Don't overwrite while user is actively editing
  if (el && document.activeElement !== el) {
    el.value = utcDate.toISOString().slice(0, 19);
  }
}

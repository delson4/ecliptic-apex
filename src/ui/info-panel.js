/**
 * Info panel HUD: displays apex coordinates, ecliptic height, time info,
 * and global absolute maximum.
 */
import { formatGMST, gmstDeg } from "../math/sidereal.js";

const elApexLat = document.getElementById("apex-lat");
const elApexLon = document.getElementById("apex-lon");
const elApexElev = document.getElementById("apex-elev");
const elApexHeight = document.getElementById("apex-height");
const elUtcTime = document.getElementById("utc-time");
const elGmstTime = document.getElementById("gmst-time");
const elModeLabel = document.getElementById("mode-label");

const elAbsLat = document.getElementById("abs-lat");
const elAbsLon = document.getElementById("abs-lon");
const elAbsElev = document.getElementById("abs-elev");
const elAbsHeight = document.getElementById("abs-height");
const elAbsTopoAdv = document.getElementById("abs-topo-adv");
const elAbsName = document.getElementById("abs-name");
const elAbsTime = document.getElementById("abs-time");
const elTitle = document.getElementById("panel-title");

function fmtLat(lat) {
  const dir = lat >= 0 ? "N" : "S";
  return `${Math.abs(lat).toFixed(4)}\u00B0 ${dir}`;
}

function fmtLon(lon) {
  const dir = lon >= 0 ? "E" : "W";
  return `${Math.abs(lon).toFixed(4)}\u00B0 ${dir}`;
}

/**
 * Update the panel title for the current hemisphere.
 * @param {boolean} south
 */
export function updatePanelTitle(south) {
  if (elTitle) {
    const chevron = document.getElementById("panel-chevron");
    const text = south ? "ECLIPTIC APEX (SOUTH IS UP) " : "ECLIPTIC APEX ";
    // Preserve the chevron span when updating title text
    if (chevron) {
      elTitle.firstChild.textContent = text;
    } else {
      elTitle.textContent = text;
    }
  }
}

/**
 * Update the info panel with current apex data.
 */
export function updateInfoPanel(apex, utcDate, topoEnabled) {
  if (elApexLat) elApexLat.textContent = fmtLat(apex.lat);
  if (elApexLon) elApexLon.textContent = fmtLon(apex.lon);
  if (elApexElev) elApexElev.textContent = `${apex.elev} m`;
  if (elApexHeight) elApexHeight.textContent = `${apex.eclipticHeightKm.toFixed(3)} km`;

  if (elUtcTime) {
    elUtcTime.textContent = utcDate.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  }

  if (elGmstTime) {
    elGmstTime.textContent = formatGMST(gmstDeg(utcDate));
  }

  if (elModeLabel) {
    elModeLabel.textContent = topoEnabled ? "Ellipsoid + Topography" : "Ellipsoid Only";
  }
}

/**
 * Display the absolute maximum info.
 */
export function updateAbsoluteMaxPanel(absMax) {
  if (elAbsName) elAbsName.textContent = absMax.name || "";
  if (elAbsLat) elAbsLat.textContent = fmtLat(absMax.lat);
  if (elAbsLon) elAbsLon.textContent = fmtLon(absMax.lon);
  if (elAbsElev) elAbsElev.textContent = `${absMax.elev} m`;
  if (elAbsHeight) elAbsHeight.textContent = `${absMax.eclipticHeightKm.toFixed(3)} km`;
  if (elAbsTopoAdv) {
    const adv = absMax.topoAdvantageM;
    if (adv > 0) {
      elAbsTopoAdv.textContent = `+${adv.toFixed(1)} m above ellipsoid`;
    } else {
      elAbsTopoAdv.textContent = `on ellipsoid (no topo gain)`;
    }
  }
  if (elAbsTime) elAbsTime.textContent = absMax.nextUtc;
}

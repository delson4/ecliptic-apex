/**
 * Entry point: initialize CesiumJS and start the application.
 */
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { App } from "./app.js";
import { showLoading } from "./ui/loading.js";

// No Cesium Ion token required — using OpenStreetMap imagery and no terrain.
// The apex computation uses our own ETOPO elevation grid, not Cesium terrain.
// If you have a token, set it here for Bing imagery + 3D terrain visuals:
// Cesium.Ion.defaultAccessToken = "your-token-here";

async function main() {
  console.log("Ecliptic Apex — Initializing...");
  showLoading("Initializing...");

  const app = new App();
  await app.init();

  console.log("Ecliptic Apex — Ready");
}

main().catch((err) => {
  console.error("Failed to initialize Ecliptic Apex:", err);
  document.body.innerHTML = `
    <div style="padding:40px;color:#f88;font-family:monospace;">
      <h2>Ecliptic Apex — Initialization Error</h2>
      <p>${err.message}</p>
      <p>Make sure you have a valid Cesium Ion token configured in <code>src/main.js</code>.</p>
      <p>Get a free token at <a href="https://ion.cesium.com/" style="color:#8af;">ion.cesium.com</a></p>
    </div>
  `;
});

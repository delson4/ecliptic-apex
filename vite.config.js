import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

const cesiumSource = "node_modules/cesium/Build/Cesium";

export default defineConfig({
  define: {
    CESIUM_BASE_URL: JSON.stringify("/cesium"),
  },
  plugins: [
    viteStaticCopy({
      targets: [
        { src: `${cesiumSource}/Workers/**/*`, dest: "cesium/Workers" },
        { src: `${cesiumSource}/ThirdParty/**/*`, dest: "cesium/ThirdParty" },
        { src: `${cesiumSource}/Assets/**/*`, dest: "cesium/Assets" },
        { src: `${cesiumSource}/Widgets/**/*`, dest: "cesium/Widgets" },
      ],
    }),
  ],
  build: {
    chunkSizeWarningLimit: 3000,
  },
});

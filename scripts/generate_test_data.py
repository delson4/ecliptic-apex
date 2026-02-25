#!/usr/bin/env python3
"""
Generate a synthetic elevation binary file for development/testing.
Simulates realistic topography in the 60°N–75°N band with known peaks.
"""
import struct
import os
import numpy as np

LAT_MIN = 60.0
LAT_MAX = 75.0
LON_MIN = -180.0
LON_MAX = 179.9667  # Just under 180 to avoid wrapping issues
STEP = 1 / 30  # 2 arc-minute = 1/30 degree

lats = np.arange(LAT_MIN, LAT_MAX + STEP / 2, STEP)
lons = np.arange(LON_MIN, LON_MAX + STEP / 2, STEP)
n_rows = len(lats)
n_cols = len(lons)

print(f"Grid: {n_rows} × {n_cols} = {n_rows * n_cols:,} points")

# Create realistic-ish elevation grid
lat_grid, lon_grid = np.meshgrid(lats, lons, indexing="ij")
elev = np.zeros((n_rows, n_cols), dtype=np.float32)

# Base: ocean at 0, land masses at ~200m
# Scandinavia (5°E - 30°E, 60-72°N)
mask = (lon_grid >= 5) & (lon_grid <= 30) & (lat_grid >= 60) & (lat_grid <= 72)
elev[mask] = 300

# Norwegian mountains (Jotunheimen area ~61.6°N, 8.3°E, Galdhøpiggen 2469m)
dist = np.sqrt((lat_grid - 61.636)**2 + (lon_grid - 8.312)**2)
elev += 2469 * np.exp(-dist**2 / 0.3)

# Kebnekaise, Sweden (~67.9°N, 18.5°E, 2097m)
dist = np.sqrt((lat_grid - 67.9)**2 + (lon_grid - 18.5)**2)
elev += 2097 * np.exp(-dist**2 / 0.2)

# Ural mountains (~64°N, 59°E, ~1800m)
dist_lon = np.abs(lon_grid - 59)
dist_lat = np.abs(lat_grid - 64)
elev += 1800 * np.exp(-dist_lon**2 / 0.5) * np.exp(-dist_lat**2 / 8)

# Alaska / Denali area is south of 60 but Brooks Range ~68°N, -150°W, ~2700m
dist = np.sqrt((lat_grid - 68.0)**2 + (lon_grid - (-153))**2)
elev += 2700 * np.exp(-dist**2 / 0.5)

# Greenland ice sheet (peak ~72°N, -38°W, ~3200m)
dist = np.sqrt((lat_grid - 72)**2 + ((lon_grid - (-38)) * 0.5)**2)
elev += 3200 * np.exp(-dist**2 / 8)

# Novaya Zemlya (~73°N, 55°E, ~1500m)
dist = np.sqrt((lat_grid - 73.2)**2 + (lon_grid - 55)**2)
elev += 1500 * np.exp(-dist**2 / 0.8)

# Iceland (~65°N, -18°W, ~2000m Hvannadalshnjúkur)
dist = np.sqrt((lat_grid - 64.0)**2 + (lon_grid - (-16.7))**2)
elev += 2110 * np.exp(-dist**2 / 0.3)

# Clamp to valid range
elev = np.clip(elev, -500, 9000).astype(np.int16)

# Ocean areas: set to 0 (simplified)
ocean = elev < 5
elev[ocean] = 0

output_path = os.path.join(
    os.path.dirname(__file__), "..", "public", "data", "etopo_60N_75N_2min.bin"
)
os.makedirs(os.path.dirname(output_path), exist_ok=True)

with open(output_path, "wb") as f:
    header = struct.pack(
        "<ffff ii",
        float(lats[0]),
        float(lats[-1]),
        float(lons[0]),
        float(lons[-1]),
        n_rows,
        n_cols,
    )
    f.write(header)
    f.write(elev.tobytes())

file_size = os.path.getsize(output_path)
print(f"Written: {output_path}")
print(f"Size: {file_size:,} bytes ({file_size / 1024 / 1024:.1f} MB)")
print(f"Elevation range: [{elev.min()}, {elev.max()}] m")
print(f"Lat range: [{lats[0]:.4f}, {lats[-1]:.4f}]")
print(f"Lon range: [{lons[0]:.4f}, {lons[-1]:.4f}]")
print(f"Dimensions: {n_rows} rows × {n_cols} cols")

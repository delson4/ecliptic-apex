#!/usr/bin/env python3
"""
Precompute apex track positions for both hemispheres.

Reads the preprocessed ETOPO binary files and sweeps through all GMST angles
to find the apex at each, producing a compact binary track file.

Output format: 4-byte header (int32 numSamples) + numSamples * 3 Float32
               values (lat, lon, elev) in degrees/meters.

Usage:
    python precompute_tracks.py [--data-dir ../public/data]
"""

import argparse
import math
import os
import struct
import sys

# ── Constants ──────────────────────────────────────────────────────────────

WGS84_A = 6_378_137.0
WGS84_E2 = 0.00669437999014
OBLIQUITY_DEG = 23.4392911
OBLIQUITY_RAD = math.radians(OBLIQUITY_DEG)
DEG2RAD = math.pi / 180.0

SIN_E = math.sin(OBLIQUITY_RAD)
COS_E = math.cos(OBLIQUITY_RAD)

NUM_SAMPLES = 7200  # 0.05° GMST resolution

# Peak corrections for north (ETOPO underestimates sharp nunataks)
PEAK_CORRECTIONS_NORTH = [
    (66.935, -36.786, 3383, "Mont Forel"),
    (68.919, -29.899, 3694, "Gunnbjorn Fjeld"),
    (68.900, -29.880, 3683, "Dome (Watkins Range)"),
    (68.880, -29.850, 3669, "Cone (Watkins Range)"),
]


def read_elevation_grid(path):
    """Read a preprocessed ETOPO binary file."""
    with open(path, "rb") as f:
        header = f.read(24)
        payload = f.read()

    latMin, latMax, lonMin, lonMax = struct.unpack_from("<ffff", header, 0)
    nRows, nCols = struct.unpack_from("<ii", header, 16)
    elevations = list(struct.unpack(f"<{nRows * nCols}h", payload))

    latStep = (latMax - latMin) / (nRows - 1)
    lonStep = (lonMax - lonMin) / (nCols - 1)

    print(f"  Grid: {nRows}x{nCols}, lat [{latMin:.2f}, {latMax:.2f}], "
          f"lon [{lonMin:.2f}, {lonMax:.2f}]")

    return dict(
        latMin=latMin, latMax=latMax, lonMin=lonMin, lonMax=lonMax,
        nRows=nRows, nCols=nCols, elevations=elevations,
        latStep=latStep, lonStep=lonStep,
    )


def apply_corrections(grid, corrections):
    """Apply peak corrections to the elevation grid."""
    nCols = grid["nCols"]
    for lat, lon, true_elev, name in corrections:
        row = round((lat - grid["latMin"]) / grid["latStep"])
        col = round((lon - grid["lonMin"]) / grid["lonStep"])
        if 0 <= row < grid["nRows"] and 0 <= col < nCols:
            idx = row * nCols + col
            old = grid["elevations"][idx]
            if true_elev > old:
                grid["elevations"][idx] = true_elev
                print(f"  Correction: {name} {old}m -> {true_elev}m")


def compute_optimal_ellipsoid_lat(south=False):
    """Find the optimal ellipsoid latitude and its ecliptic height."""
    best_h = -math.inf
    best_lat = -66.56 if south else 66.56
    lat_start = -69.0 if south else 64.0
    lat_end = -64.0 if south else 69.0
    cos_sign = -1 if south else 1

    for i in range(int((lat_end - lat_start) / 0.001) + 1):
        lat_deg = lat_start + i * 0.001
        lat = lat_deg * DEG2RAD
        sin_lat = math.sin(lat)
        cos_lat = math.cos(lat)
        N = WGS84_A / math.sqrt(1 - WGS84_E2 * sin_lat * sin_lat)
        h = SIN_E * N * cos_lat + cos_sign * COS_E * N * (1 - WGS84_E2) * sin_lat
        if h > best_h:
            best_h = h
            best_lat = lat_deg

    return best_lat, best_h


def precompute_ecef(grid):
    """Precompute ECEF positions for the grid (matching the JS logic)."""
    nRows = grid["nRows"]
    nCols = grid["nCols"]
    elevations = grid["elevations"]
    count = nRows * nCols

    ecef_x = [0.0] * count
    ecef_y = [0.0] * count
    ecef_z = [0.0] * count
    lats = [0.0] * count
    lons = [0.0] * count

    idx = 0
    for row in range(nRows):
        lat_deg = grid["latMin"] + row * grid["latStep"]
        lat = lat_deg * DEG2RAD
        sin_lat = math.sin(lat)
        cos_lat = math.cos(lat)
        N = WGS84_A / math.sqrt(1 - WGS84_E2 * sin_lat * sin_lat)

        for col in range(nCols):
            lon_deg = grid["lonMin"] + col * grid["lonStep"]
            lon = lon_deg * DEG2RAD
            elev = max(elevations[row * nCols + col], 0)

            lats[idx] = lat_deg
            lons[idx] = lon_deg
            ecef_x[idx] = (N + elev) * cos_lat * math.cos(lon)
            ecef_y[idx] = (N + elev) * cos_lat * math.sin(lon)
            ecef_z[idx] = (N * (1 - WGS84_E2) + elev) * sin_lat
            idx += 1

    return ecef_x, ecef_y, ecef_z, lats, lons


def compute_track(grid, south=False):
    """Compute the apex track (replicates JS computeApexTrack logic)."""
    print("  Precomputing ECEF positions...")
    ecef_x, ecef_y, ecef_z, grid_lats, grid_lons = precompute_ecef(grid)
    elevations = grid["elevations"]

    n = len(grid_lats)
    nCols = grid["nCols"]
    nRows = grid["nRows"]
    lon_step = 360.0 / nCols
    lon_min = grid["lonMin"]

    ellipsoid_lat, ellipsoid_hmax = compute_optimal_ellipsoid_lat(south)
    print(f"  Ellipsoid optimum: {ellipsoid_lat:.4f}°, h={ellipsoid_hmax:.2f}m")

    # Build per-column "has mountain" flags
    col_has_mtn = [False] * nCols
    for row in range(nRows):
        base = row * nCols
        for col in range(nCols):
            if elevations[base + col] > 0:
                col_has_mtn[col] = True
    mtn_count = sum(col_has_mtn)
    print(f"  {mtn_count} of {nCols} longitude columns have mountains")

    window_deg = 15
    window_cols = math.ceil(window_deg / lon_step)

    track_lats = []
    track_lons = []
    track_elevs = []

    print(f"  Sweeping {NUM_SAMPLES} GMST samples...")
    for s in range(NUM_SAMPLES + 1):
        gmst_rad = (s / NUM_SAMPLES) * 2 * math.pi
        cos_g = math.cos(gmst_rad)
        sin_g = math.sin(gmst_rad)

        if south:
            ex = SIN_E * sin_g
            ey = SIN_E * cos_g
            ez = -COS_E
        else:
            ex = -SIN_E * sin_g
            ey = -SIN_E * cos_g
            ez = COS_E

        enp_lon_deg = math.atan2(ey, ex) * (180.0 / math.pi)

        best_lat = ellipsoid_lat
        best_lon = enp_lon_deg
        best_elev = 0
        best_height = ellipsoid_hmax

        center_col = round((enp_lon_deg - lon_min) / lon_step)
        center_col = center_col % nCols

        for dc in range(-window_cols, window_cols + 1):
            col = (center_col + dc) % nCols
            if not col_has_mtn[col]:
                continue
            for row in range(nRows):
                i = row * nCols + col
                if elevations[i] <= 0:
                    continue
                h = ecef_x[i] * ex + ecef_y[i] * ey + ecef_z[i] * ez
                if h > best_height:
                    best_height = h
                    best_lat = grid_lats[i]
                    best_lon = grid_lons[i]
                    best_elev = elevations[i]

        track_lats.append(best_lat)
        track_lons.append(best_lon)
        track_elevs.append(best_elev)

        if s % 1000 == 0 and s > 0:
            print(f"    {s}/{NUM_SAMPLES}...")

    return track_lats, track_lons, track_elevs


def write_track(path, lats, lons, elevs):
    """Write track as binary: int32 count + count * 3 float32."""
    n = len(lats)
    with open(path, "wb") as f:
        f.write(struct.pack("<i", n))
        for i in range(n):
            f.write(struct.pack("<fff", lats[i], lons[i], float(elevs[i])))
    size = os.path.getsize(path)
    print(f"  Written: {path} ({size:,} bytes, {size/1024:.1f} KB)")


def main():
    parser = argparse.ArgumentParser(description="Precompute apex tracks")
    parser.add_argument(
        "--data-dir", "-d",
        default=os.path.join(os.path.dirname(__file__), "..", "public", "data"),
    )
    args = parser.parse_args()

    # North
    north_bin = os.path.join(args.data_dir, "etopo_60N_75N_2min.bin")
    if os.path.exists(north_bin):
        print("\n=== NORTH HEMISPHERE ===")
        print(f"Loading {north_bin}...")
        grid = read_elevation_grid(north_bin)
        apply_corrections(grid, PEAK_CORRECTIONS_NORTH)
        lats, lons, elevs = compute_track(grid, south=False)
        write_track(os.path.join(args.data_dir, "track_north.bin"), lats, lons, elevs)
    else:
        print(f"Skipping north: {north_bin} not found")

    # South
    south_bin = os.path.join(args.data_dir, "etopo_60S_75S_2min.bin")
    if os.path.exists(south_bin):
        print("\n=== SOUTH HEMISPHERE ===")
        print(f"Loading {south_bin}...")
        grid = read_elevation_grid(south_bin)
        lats, lons, elevs = compute_track(grid, south=True)
        write_track(os.path.join(args.data_dir, "track_south.bin"), lats, lons, elevs)
    else:
        print(f"Skipping south: {south_bin} not found")

    print("\nDone.")


if __name__ == "__main__":
    main()

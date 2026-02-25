#!/usr/bin/env python3
"""
Compute and verify the global maximum ecliptic height for both hemispheres.

Reads the preprocessed ETOPO binary files and finds the point on Earth's
surface that gets highest above (north) or below (south) the ecliptic plane.

The closed-form maximum ecliptic height for any surface point over all times:

    North:  h_max = sin(ε) · √(x² + y²) + cos(ε) · z
    South:  h_max = sin(ε) · √(x² + y²) - cos(ε) · z

where (x, y, z) is the WGS84 ECEF position and ε = 23.4393° (obliquity).

This depends only on latitude and elevation, NOT longitude — every point
gets its turn once per sidereal day as the ecliptic north pole sweeps around.

Usage:
    python analyze_global_max.py [--data-dir ../public/data]
"""

import argparse
import math
import os
import struct
import sys

# ── Constants ──────────────────────────────────────────────────────────────

WGS84_A = 6_378_137.0            # Semi-major axis (m)
WGS84_E2 = 0.00669437999014      # First eccentricity squared
OBLIQUITY_DEG = 23.4392911        # J2000 mean obliquity
OBLIQUITY_RAD = math.radians(OBLIQUITY_DEG)
DEG2RAD = math.pi / 180.0

SIN_E = math.sin(OBLIQUITY_RAD)
COS_E = math.cos(OBLIQUITY_RAD)


# ── Binary file reader ────────────────────────────────────────────────────

def read_elevation_grid(path):
    """Read a preprocessed ETOPO binary file.

    Returns dict with keys: latMin, latMax, lonMin, lonMax, nRows, nCols,
    elevations (list of int), latStep, lonStep.
    """
    with open(path, "rb") as f:
        header = f.read(24)
        payload = f.read()

    latMin, latMax, lonMin, lonMax = struct.unpack_from("<ffff", header, 0)
    nRows, nCols = struct.unpack_from("<ii", header, 16)

    # Int16 little-endian
    elevations = struct.unpack(f"<{nRows * nCols}h", payload)

    latStep = (latMax - latMin) / (nRows - 1)
    lonStep = (lonMax - lonMin) / (nCols - 1)

    print(f"  Grid: {nRows} × {nCols} = {nRows * nCols:,} points")
    print(f"  Lat: [{latMin:.4f}, {latMax:.4f}], step {latStep:.4f}°")
    print(f"  Lon: [{lonMin:.4f}, {lonMax:.4f}], step {lonStep:.4f}°")
    print(f"  Elevation range: [{min(elevations)}, {max(elevations)}] m")

    return dict(
        latMin=latMin, latMax=latMax, lonMin=lonMin, lonMax=lonMax,
        nRows=nRows, nCols=nCols, elevations=elevations,
        latStep=latStep, lonStep=lonStep,
    )


# ── ECEF computation ──────────────────────────────────────────────────────

def geodetic_to_ecef(lat_deg, lon_deg, elev_m):
    """Convert geodetic (lat, lon, elevation) to ECEF (x, y, z)."""
    lat = lat_deg * DEG2RAD
    lon = lon_deg * DEG2RAD
    sin_lat = math.sin(lat)
    cos_lat = math.cos(lat)
    N = WGS84_A / math.sqrt(1 - WGS84_E2 * sin_lat * sin_lat)
    x = (N + elev_m) * cos_lat * math.cos(lon)
    y = (N + elev_m) * cos_lat * math.sin(lon)
    z = (N * (1 - WGS84_E2) + elev_m) * sin_lat
    return x, y, z


def ecliptic_hmax(lat_deg, lon_deg, elev_m, south=False):
    """Closed-form maximum ecliptic height for a surface point over all times."""
    x, y, z = geodetic_to_ecef(lat_deg, lon_deg, max(elev_m, 0))
    rxy = math.sqrt(x * x + y * y)
    if south:
        return SIN_E * rxy - COS_E * z   # -cos(ε)·z > 0 when z < 0
    else:
        return SIN_E * rxy + COS_E * z


def optimal_gmst_rad(lat_deg, lon_deg, elev_m, south=False):
    """GMST angle (radians) at which this point achieves its maximum."""
    x, y, z = geodetic_to_ecef(lat_deg, lon_deg, max(elev_m, 0))
    if south:
        return math.atan2(x, y)
    else:
        return math.atan2(-x, -y)


# ── Ellipsoid-only baseline ──────────────────────────────────────────────

def compute_ellipsoid_optimum(south=False):
    """Find the optimal latitude on the bare WGS84 ellipsoid (no topography)."""
    best_h = -math.inf
    best_lat = 0.0
    lat_start = -69.0 if south else 64.0
    lat_end = -64.0 if south else 69.0
    for i in range(int((lat_end - lat_start) / 0.001) + 1):
        lat_deg = lat_start + i * 0.001
        h = ecliptic_hmax(lat_deg, 0.0, 0.0, south)
        if h > best_h:
            best_h = h
            best_lat = lat_deg
    return best_lat, best_h


# ── Grid scan ─────────────────────────────────────────────────────────────

def scan_grid(grid, south=False, top_n=30):
    """Scan every grid point and return sorted results."""
    results = []
    nRows = grid["nRows"]
    nCols = grid["nCols"]
    elevations = grid["elevations"]

    for row in range(nRows):
        lat_deg = grid["latMin"] + row * grid["latStep"]
        for col in range(nCols):
            idx = row * nCols + col
            elev = elevations[idx]
            lon_deg = grid["lonMin"] + col * grid["lonStep"]
            h = ecliptic_hmax(lat_deg, lon_deg, elev, south)
            results.append((h, lat_deg, lon_deg, elev))

    results.sort(reverse=True)
    return results[:top_n]


def scan_grid_ellipsoid_best(grid, south=False):
    """Find the best ellipsoid-only h_max from grid points with elev <= 0."""
    best_h = -math.inf
    nRows = grid["nRows"]
    nCols = grid["nCols"]
    elevations = grid["elevations"]

    for row in range(nRows):
        lat_deg = grid["latMin"] + row * grid["latStep"]
        for col in range(nCols):
            idx = row * nCols + col
            elev = elevations[idx]
            if elev > 0:
                continue
            h = ecliptic_hmax(lat_deg, lon_deg=0.0, elev_m=0.0, south=south)
            if h > best_h:
                best_h = h
    return best_h


# ── Named peak corrections (sharp summits ETOPO underestimates) ──────────

PEAK_CORRECTIONS_NORTH = [
    (66.935, -36.786, 3383, "Mont Forel"),
    (68.919, -29.899, 3694, "Gunnbjorn Fjeld"),
    (68.900, -29.880, 3683, "Dome (Watkins Range)"),
    (68.880, -29.850, 3669, "Cone (Watkins Range)"),
]


def apply_corrections(grid, corrections):
    """Apply peak corrections to the elevation grid (mutates in place)."""
    elevations = list(grid["elevations"])
    nCols = grid["nCols"]
    for lat, lon, true_elev, name in corrections:
        row = round((lat - grid["latMin"]) / grid["latStep"])
        col = round((lon - grid["lonMin"]) / grid["lonStep"])
        if 0 <= row < grid["nRows"] and 0 <= col < nCols:
            idx = row * nCols + col
            old = elevations[idx]
            if true_elev > old:
                elevations[idx] = true_elev
                print(f"  Correction: {name} at {lat}°, {lon}° → {old}m → {true_elev}m")
    grid["elevations"] = elevations


# ── Comparison table ──────────────────────────────────────────────────────

REFERENCE_PEAKS = [
    ("Mont Forel, Greenland",       66.935,  -36.786,  3383),
    ("Gunnbjorn Fjeld, Greenland",  68.919,  -29.899,  3694),
    ("Denali, Alaska",              63.069, -151.007,  6190),
    ("Mt. Logan, Canada",           60.567, -140.406,  5959),
    ("Galdhøpiggen, Norway",        61.637,    8.312,  2469),
    ("Ellipsoid optimum (sea lvl)", 66.561,    0.000,     0),
    ("Mt. Everest",                 27.988,   86.925,  8849),
    ("North Pole",                  90.000,    0.000,     0),
]

REFERENCE_PEAKS_SOUTH = [
    ("Peninsula ice spine",        -66.525,  -64.825,  2142),
    ("Mt. Francais, Anvers Is.",   -64.717,  -62.529,  2800),
    ("Vinson Massif",              -78.525,  -85.617,  4892),
    ("Ellipsoid optimum (sea lvl)",-66.561,    0.000,     0),
    ("South Pole",                 -90.000,    0.000,     0),
]


# ── Main ──────────────────────────────────────────────────────────────────

def analyze_hemisphere(name, bin_path, south, corrections, ref_peaks):
    """Full analysis for one hemisphere."""
    hemi = "SOUTH" if south else "NORTH"
    print(f"\n{'='*70}")
    print(f"  {hemi} HEMISPHERE — ECLIPTIC {'ANTI-APEX' if south else 'APEX'}")
    print(f"{'='*70}\n")

    # Ellipsoid optimum
    opt_lat, opt_h = compute_ellipsoid_optimum(south)
    print(f"Ellipsoid optimum: {abs(opt_lat):.4f}°{'S' if south else 'N'}, "
          f"h_max = {opt_h:,.2f} m ({opt_h/1000:,.3f} km)\n")

    # Load grid
    print(f"Loading {bin_path}...")
    grid = read_elevation_grid(bin_path)

    # Apply corrections
    if corrections:
        print("\nApplying peak corrections:")
        apply_corrections(grid, corrections)

    # Scan
    print(f"\nScanning {grid['nRows'] * grid['nCols']:,} points...")
    top = scan_grid(grid, south, top_n=30)

    # Winner
    h, lat, lon, elev = top[0]
    lat_dir = "S" if lat < 0 else "N"
    lon_dir = "W" if lon < 0 else "E"
    topo_adv = h - opt_h
    gmst = optimal_gmst_rad(lat, lon, elev, south)

    print(f"\n{'─'*60}")
    print(f"  GLOBAL MAXIMUM: {abs(lat):.4f}° {lat_dir}, {abs(lon):.4f}° {lon_dir}")
    print(f"  Elevation:      {elev} m")
    print(f"  Max ecliptic h: {h:,.2f} m ({h/1000:,.3f} km)")
    print(f"  Topo advantage: {topo_adv:+,.1f} m above ellipsoid baseline")
    print(f"  Optimal GMST:   {math.degrees(gmst):.2f}°")
    print(f"{'─'*60}")

    # Top 20
    print(f"\nTop 20 points:")
    print(f"{'Rank':>4}  {'Lat':>9}  {'Lon':>10}  {'Elev':>6}  {'h_max (km)':>12}  {'Δ vs #1':>9}")
    for i, (h_i, lat_i, lon_i, elev_i) in enumerate(top[:20]):
        lat_d = "S" if lat_i < 0 else "N"
        lon_d = "W" if lon_i < 0 else "E"
        delta = h_i - top[0][0]
        print(f"  {i+1:2d}  {abs(lat_i):7.4f}°{lat_d}  {abs(lon_i):8.4f}°{lon_d}"
              f"  {elev_i:5d}m  {h_i/1000:11.3f}  {delta:+8.1f}m")

    # Reference peak comparison
    print(f"\nComparison with known peaks:")
    print(f"{'Peak':<30}  {'Lat':>9}  {'Elev':>6}  {'h_max (km)':>12}  {'vs ellipsoid':>13}")
    for pname, plat, plon, pelev in ref_peaks:
        ph = ecliptic_hmax(plat, plon, pelev, south)
        padv = ph - opt_h
        lat_d = "S" if plat < 0 else "N"
        marker = " <<<" if abs(plat - lat) < 0.1 and abs(pelev - elev) < 50 else ""
        print(f"  {pname:<28}  {abs(plat):6.3f}°{lat_d}  {pelev:5d}m"
              f"  {ph/1000:11.3f}  {padv:+12.1f}m{marker}")

    # Neighborhood analysis around winner
    print(f"\nNeighborhood around winner ({abs(lat):.2f}°{lat_dir}, {abs(lon):.2f}°{lon_dir}):")
    nCols = grid["nCols"]
    elevations = grid["elevations"]
    center_row = round((lat - grid["latMin"]) / grid["latStep"])
    center_col = round((lon - grid["lonMin"]) / grid["lonStep"])
    window = 15  # ±15 cells ≈ ±50 km
    neighbors = []
    for dr in range(-window, window + 1):
        for dc in range(-window, window + 1):
            r = center_row + dr
            c = center_col + dc
            if 0 <= r < grid["nRows"] and 0 <= c < nCols:
                neighbors.append(elevations[r * nCols + c])
    below_sea = sum(1 for e in neighbors if e < 0)
    print(f"  {2*window+1}×{2*window+1} cell window (~{2*window*3.3:.0f} km):")
    print(f"  Elev range: [{min(neighbors)}, {max(neighbors)}] m")
    print(f"  Mean: {sum(neighbors)/len(neighbors):.0f} m, Std: {_std(neighbors):.0f} m")
    print(f"  Cells below sea level: {below_sea} of {len(neighbors)}")

    is_ice = (below_sea > 0 and _std(neighbors) > 200 and
              sum(1 for e in neighbors if e > 1000) > len(neighbors) * 0.3)
    if is_ice:
        print(f"  → Likely ICE-COVERED RIDGE (variable terrain, ocean nearby)")
    elif below_sea == 0 and _std(neighbors) < 100:
        print(f"  → Likely ICE SHEET PLATEAU (uniform, no ocean)")
    else:
        print(f"  → Likely MOUNTAIN/NUNATAK (sharp peak)")


def _std(values):
    """Standard deviation."""
    n = len(values)
    mean = sum(values) / n
    return math.sqrt(sum((v - mean) ** 2 for v in values) / n)


def main():
    parser = argparse.ArgumentParser(
        description="Analyze global maximum ecliptic height for both hemispheres"
    )
    parser.add_argument(
        "--data-dir", "-d",
        default=os.path.join(os.path.dirname(__file__), "..", "public", "data"),
        help="Directory containing ETOPO binary files",
    )
    args = parser.parse_args()

    north_bin = os.path.join(args.data_dir, "etopo_60N_75N_2min.bin")
    south_bin = os.path.join(args.data_dir, "etopo_60S_75S_2min.bin")

    if os.path.exists(north_bin):
        analyze_hemisphere(
            "North", north_bin, south=False,
            corrections=PEAK_CORRECTIONS_NORTH,
            ref_peaks=REFERENCE_PEAKS,
        )
    else:
        print(f"Skipping north: {north_bin} not found")

    if os.path.exists(south_bin):
        analyze_hemisphere(
            "South", south_bin, south=True,
            corrections=[],  # ETOPO ice surface is already accurate
            ref_peaks=REFERENCE_PEAKS_SOUTH,
        )
    else:
        print(f"Skipping south: {south_bin} not found")


if __name__ == "__main__":
    main()

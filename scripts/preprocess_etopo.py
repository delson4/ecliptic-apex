#!/usr/bin/env python3
"""
Preprocess ETOPO 2022 data to binary format for the Ecliptic Apex app.

Downloads ETOPO 2022 60-arc-second NetCDF from NOAA, extracts the 60°N–75°N
latitude band, downsamples to 2 arc-minute resolution, and writes a compact
binary file with a 24-byte header + Int16Array payload.

Usage:
    python preprocess_etopo.py [--input ETOPO.nc] [--output ../public/data/etopo_60N_75N_2min.bin]

If no --input is specified, downloads the 60-arc-second bedrock data from NOAA.
"""

import argparse
import os
import struct
import sys
import numpy as np

# Bounds for extraction
LAT_MIN = 60.0
LAT_MAX = 75.0
LON_MIN = -180.0
LON_MAX = 180.0
DOWNSAMPLE = 2  # Factor: 60" * 2 = 2 arc-minute resolution

ETOPO_URL = (
    "https://www.ngdc.noaa.gov/thredds/fileServer/global/ETOPO2022/60s/"
    "60s_surface_elev_netcdf/ETOPO_2022_v1_60s_N90W180_surface.nc"
)


def download_etopo(dest_path):
    """Download ETOPO 2022 NetCDF file."""
    import urllib.request
    print(f"Downloading ETOPO 2022 from NOAA (~750 MB)...")
    print(f"URL: {ETOPO_URL}")
    print(f"Destination: {dest_path}")
    urllib.request.urlretrieve(ETOPO_URL, dest_path)
    print("Download complete.")


def process(input_path, output_path):
    """Extract, downsample, and write binary elevation grid."""
    try:
        import xarray as xr
    except ImportError:
        print("Error: xarray is required. Install with: pip install xarray netCDF4")
        sys.exit(1)

    print(f"Opening {input_path}...")
    ds = xr.open_dataset(input_path)

    # ETOPO variable is typically 'z' or 'elevation'
    var_name = None
    for name in ["z", "elevation", "Band1"]:
        if name in ds:
            var_name = name
            break
    if var_name is None:
        print(f"Available variables: {list(ds.data_vars)}")
        sys.exit(1)

    print(f"Using variable: {var_name}")
    elev = ds[var_name]

    # Select latitude band
    lat_name = "lat" if "lat" in elev.dims else "latitude"
    lon_name = "lon" if "lon" in elev.dims else "longitude"

    print(f"Extracting lat [{LAT_MIN}, {LAT_MAX}], lon [{LON_MIN}, {LON_MAX}]...")
    subset = elev.sel(
        **{lat_name: slice(LAT_MIN, LAT_MAX), lon_name: slice(LON_MIN, LON_MAX)}
    )

    # Downsample
    print(f"Downsampling by factor {DOWNSAMPLE}...")
    subset = subset.isel(
        **{lat_name: slice(None, None, DOWNSAMPLE), lon_name: slice(None, None, DOWNSAMPLE)}
    )

    data = subset.values.astype(np.int16)
    lats = subset[lat_name].values
    lons = subset[lon_name].values

    n_rows, n_cols = data.shape
    lat_min_actual = float(lats[0])
    lat_max_actual = float(lats[-1])
    lon_min_actual = float(lons[0])
    lon_max_actual = float(lons[-1])

    print(f"Grid: {n_rows} rows × {n_cols} cols = {n_rows * n_cols:,} points")
    print(f"Lat: [{lat_min_actual:.4f}, {lat_max_actual:.4f}]")
    print(f"Lon: [{lon_min_actual:.4f}, {lon_max_actual:.4f}]")
    print(f"Elevation range: [{data.min()}, {data.max()}] m")

    # Write binary file
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "wb") as f:
        # 24-byte header: latMin, latMax, lonMin, lonMax (float32), nRows, nCols (int32)
        header = struct.pack(
            "<ffff ii",
            lat_min_actual,
            lat_max_actual,
            lon_min_actual,
            lon_max_actual,
            n_rows,
            n_cols,
        )
        f.write(header)
        # Row-major Int16 payload (south-to-north since lat increases)
        f.write(data.tobytes())

    file_size = os.path.getsize(output_path)
    print(f"Written: {output_path} ({file_size:,} bytes, {file_size / 1024 / 1024:.1f} MB)")
    ds.close()


def main():
    parser = argparse.ArgumentParser(description="Preprocess ETOPO 2022 for Ecliptic Apex")
    parser.add_argument(
        "--input", "-i",
        default=None,
        help="Path to ETOPO 2022 NetCDF file (downloads if not specified)",
    )
    parser.add_argument(
        "--output", "-o",
        default=os.path.join(
            os.path.dirname(__file__), "..", "public", "data", "etopo_60N_75N_2min.bin"
        ),
        help="Output binary file path",
    )
    args = parser.parse_args()

    input_path = args.input
    if input_path is None:
        input_path = "/tmp/ETOPO_2022_v1_60s_N90W180_bed.nc"
        if not os.path.exists(input_path):
            download_etopo(input_path)
        else:
            print(f"Using cached download: {input_path}")

    if not os.path.exists(input_path):
        print(f"Error: Input file not found: {input_path}")
        sys.exit(1)

    process(input_path, args.output)


if __name__ == "__main__":
    main()

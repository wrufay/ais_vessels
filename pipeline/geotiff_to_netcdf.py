# pip install rioxarray
import sys
import rioxarray

def convert(input_path, output_path):
    # masked=True replaces nodata values with NaN
    da = rioxarray.open_rasterio(input_path, masked=True)
    da.name = "bathymetry"
    da.to_netcdf(output_path)
    print(f"Saved to {output_path}")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python geotiff_to_netcdf.py <input.tif> <output.nc>")
        sys.exit(1)
    convert(sys.argv[1], sys.argv[2])

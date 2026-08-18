# -*- coding: utf-8 -*-

from datetime import date
from time import perf_counter

from ns_pile_driving_noise_mapping import create_impact_map
from ns_pile_driving_noise_mapping import ExposureAssessmentParams, TLModelParams, NoiseLevelParams, PlotParams


# initialize params dictionary
params = {}

# Spcecify model name ---------------------------------------------------------
### CHANGE AS NEEDED
### Currently supports 'French Bank' or 'Sydney Bight'
model = "Sydney Bight"

# Specify plot parameters -----------------------------------------------------
### CHANGE AS NEEDED
### see params.PlotParams for available parameters
### Notes: 
### - The 'map_extents' attribute is added later in this script based on which 
###     model is used.
### - For 'colormap', specify a matplotlib colormap name as a string; it is
###     also possible to use cmocean colormaps instead by adding 'cmo.' as a 
###     prefix.
params["Plot"] = PlotParams(
    wea_shapefile_path = "/home/shared/WEA_shapefiles/Designated_WEAs_25_07_29.shp",
    land_col = "#52514f",  #"#f0efe8",
    water_col = "#d9ecff",
    colormap = "cmo.thermal"  #viridis
)

# Specify exposure assessment parameters --------------------------------------
### CHANGE AS NEEDED
### see params.ExposureAssessmentParams for available parameters
params["Exposure"] = ExposureAssessmentParams(
    hearing_groups = ["LF Cetaceans", "Fish - Auditory Swim Bladder", "Sea Turtles"], 
    depth_range = (-40,-0.01)
)

"""
params["Exposure"] = ExposureAssessmentParams(
    hearing_groups = ["LF Cetaceans"], 
    impact_types = ["TTS", "AUD INJ"],
    metrics = ["SEL_cum"],
    depth_range = (-40,-0.01)
)
"""

"""
params["Exposure"] = ExposureAssessmentParams(
    depth_range=(-40,-0.01)
)
"""

# Set noise source properties and map extents based on model ------------------
### If making changes here, make sure they are consistent with the TL model.
if model == "French Bank":
    params["Model"] = TLModelParams(
        model_name="French Bank",
        data_folder="/home/shared/pileDrivingSoundPropagation/testFrenchBank/output/modelRun/csnapOut/",
        src_freq=100,
        src_depth=135,
        src_lon=-61.477536,
        src_lat=44.6143972,
        noise_date=date(2020, 7, 15)
    )
    
    params["Plot"].map_extents = {
        "lon_min": -62.5,
        "lon_max": -60.25,
        "lat_min": 43.85,
        "lat_max": 45.25
    }

elif model == "Sydney Bight":
    params["Model"] = TLModelParams(
        model_name="Sydney Bight",
        data_folder="/home/shared/pileDrivingSoundPropagation/sydneyBight/output/modelRun/csnapOut/",
        src_freq=100,
        src_depth=45,
        src_lon=-59.82201388888889,
        src_lat=46.522622222222225,
        noise_date=date(2020, 7, 15)
    )
    
    params["Plot"].map_extents = {
        "lon_min": -60.5,
        "lon_max": -58.8,
        "lat_min": 46.2,
        "lat_max": 47.2
    }
    
    # Old SB limits
    """
    params["Plot"].map_extents = {
        "lon_min": -60.5,
        "lon_max": -59.0,
        "lat_min": 46.2,
        "lat_max": 47.0
    }
    """
    
else: 
    raise Exception(f"Invalid model '{model}'")

# Set noise level parameters --------------------------------------------------
### CHANGE AS NEEDED
### see params.NoiseLevelParams for available parameters
params["NoiseLevel"] = NoiseLevelParams(
    SPL_peak = 220,
    SEL_single_strike = 200,
    n_strikes_per_pile = 5000,
    n_piles = 4
)

# Run the code ================================================================
tic = perf_counter()
results = create_impact_map(
    params["Exposure"], 
    params["Model"],
    params["NoiseLevel"],
    params["Plot"]
)
toc = perf_counter()
print(f"Model '{model}' processed in {toc - tic:.6f} seconds")
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
This module consists of one public function to be used for end-to-end generation of 
plots showing zones of impact from offshore pile driving noise on wildlife, based on an 
Excel workbook of regulatory marine noise thresholds and transmission loss modelling 
output for the Nova Scotia Designated Offshore Wind Energy Areas (WEAs). It is the only 
module in this package that should be accessed directly by an end-user.

Created on Wed Jun 17 16:50:36 2026

@author: beslinw
"""

from .enums import HearingGroup, Impact, Metric
from .filters import build_threshold_filter_mask_str
from .io.thresholds import load_thresholds, filter_thresholds
from .io.weighting_params import load_weighting_params
from .io.tl_model import load_tl_model_output
from .processing.tl import compute_depth_averaged_tl
from .processing.geospatial import PolarFieldInterpolator, polar2geo
from .processing.auditory_weighting import compute_received_levels
from .processing.impact_zones import compute_all_zone_boundaries
from .visualization.mapping import create_map
from .utils import df_string_columns_to_enum


# MAIN FUNCTIONS ==============================================================
# create impact map -----------------------------------------------------------
def create_impact_map(
        exposure_params, 
        tl_model_params, 
        noise_level_params, 
        plot_params,
        precalculated_data=None,
        return_output=True
):
    """
    Function for drawing a map showing noise impact zones from basic user input or 
    precalculated data.
    THIS FUNCTION MAY BE CALLED DIRECTLY.

    Parameters
    ----------
    exposure_params : ExposureAssessmentParams
        Object of ExposureAssessmentParams class containing user-specified parameters 
        relating to noise exposure assessment. See 'params.py' for details.
    tl_model_params : TLModelParams
        Object of TLModelParams class containing user-specified parameters relating to 
        the noise propagation model. See 'params.py' for details.
    noise_level_params : NoiseLevelParams
        Object of NoiseLevelParams class containing user-specified parameters relating 
        to the noise source level. See 'params.py' for details.
    plot_params : PlotParams
        Object of PlotParams class containing user-specified parameters relating to 
        plotting. See 'params.py' for details.
    precalculated_data : dict | None, optional
        Dict containing the fields 'ds_noisefield', 'df_th', and 'zone_data' calculated 
        during a previous run of this function or from 'calculate_noise_impact'. Use 
        this to quickly create (or re-create) a plot from existing data.
        NOTE: 'precalculated_data' must have been generated using the same 
        'exposure_params', 'tl_model_params', and 'noise_level_params' as specified here,
        or map results will be inaccurate. If this parameter is None, then all noise 
        impact calculations will be performed from scratch. The default is None.
    return_output : bool, optional
        Flag specifying if results should be returned as a variable or not. Returned 
        results may be passed to this function via the 'precalculated_data' parameter to
        skip most calculations during future runs. The default is True.

    Returns
    -------
    out : dict, optional
        Dict containing output data stored within the following fields:
            'ds_noisefield' : xarray Dataset containing depth-averaged transmission loss
                and received sound level matrices in polar coordinates centred about a 
                noise source.
            'df_th' : pandas DataFrame containing noise impact thresholds selected based 
                on user data, along with their metadata.
            'zone_data' : Python list containing dictionaries holding data arrays for 
                each noise hazard zone. The dictionaries contains both longitude and 
                latitude positions and polar coordinates that mark the outer boundaries 
                of each hazard zone, in addition to zone area. The order of the list 
                matches that of the thresholds in 'df_th'.
            'ax' : matplotlib Axes object in which the map is plotted.

    """
    
    # Do noise impact calculations if needed
    if precalculated_data is None:
        precalculated_data = calculate_noise_impact(
            exposure_params, 
            tl_model_params, 
            noise_level_params
        )
        
    # Extract processed data
    ds_noisefield = precalculated_data["ds_noisefield"]
    df_th = precalculated_data["df_th"]
    zone_data = precalculated_data["zone_data"]
    
    # Create map
    ax = create_map(
            ds_noisefield,
            zone_data,
            df_th,
            exposure_params,
            tl_model_params,
            noise_level_params,
            plot_params
    )
    
    # Return data if requested
    if return_output:
        out = {
            "ds_noisefield": ds_noisefield,
            "df_th": df_th,
            "zone_data": zone_data,
            "ax": ax
        }
    
        return out


# calculate noise impact ------------------------------------------------------
def calculate_noise_impact(
        exposure_params, 
        tl_model_params, 
        noise_level_params
):
    """
    Process user input to generate noise field data and impact zones. 
    THIS FUNCTION MAY BE CALLED DIRECTLY.

    Parameters
    ----------
    exposure_params : ExposureAssessmentParams
        Object of ExposureAssessmentParams class containing user-specified parameters 
        relating to noise exposure assessment. See 'params.py' for details.
    tl_model_params : TLModelParams
        Object of TLModelParams class containing user-specified parameters relating to 
        the noise propagation model. See 'params.py' for details.
    noise_level_params : NoiseLevelParams
        Object of NoiseLevelParams class containing user-specified parameters relating 
        to the noise source level. See 'params.py' for details.

    Returns
    -------
    out : dict
        Dict containing output data stored within the following fields:
            'ds_noisefield' : xarray Dataset containing depth-averaged transmission loss
                and received sound level matrices in polar coordinates centred about a 
                noise source.
            'df_th' : pandas DataFrame containing noise impact thresholds selected based 
                on user data, along with their metadata.
            'zone_data' : Python list containing dictionaries holding data arrays for 
                each noise hazard zone. The dictionaries contains both longitude and 
                latitude positions and polar coordinates that mark the outer boundaries 
                of each hazard zone, in addition to zone area. The order of the list 
                matches that of the thresholds in 'df_th'.

    """
    
    # get thresholds
    df_th = _load_process_thresholds(exposure_params)
    
    # get marine mammal weighting parameters
    df_weight_params = _load_process_weighting_params(exposure_params.file_path)
    ### consider filtering this and/or loading it as needed
    
    # load TL model output
    tl_data = load_tl_model_output(tl_model_params)
    
    # calculate average TL across depth
    ds_noisefield = compute_depth_averaged_tl(tl_data, exposure_params.depth_range)
    
    # add lon-lat coordinates to TL data [NO LONGER REQUIRED]
    #ds_noisefield = append_geocoordinates(ds_noisefield, tl_model_params)
    
    # calculate RLs from TL for each weighting requirement
    ds_noisefield = compute_received_levels(ds_noisefield, df_th, df_weight_params, exposure_params, tl_model_params, noise_level_params)
    
    # calculate zones of impact
    zone_data = compute_all_zone_boundaries(ds_noisefield, df_th, exposure_params)
    
    # get longitude and latitude of zone boundaries
    zone_data = _append_zone_geocoordinates(zone_data, tl_model_params)
    
    # create interpolator object and assign it as an attribute in the noise 
    # field Dataset - this will be used for plotting later
    ds_noisefield.attrs["GridMapper"] = PolarFieldInterpolator(
        ds_noisefield,
        tl_model_params.src_lon,
        tl_model_params.src_lat
        )
    
    # return data
    out = {
        "ds_noisefield": ds_noisefield,
        "df_th": df_th,
        "zone_data": zone_data
    }
    
    return out


# HELPERS =====================================================================
# get thresholds --------------------------------------------------------------
def _load_process_thresholds(exposure_params):
    
    # load the raw thresholds
    df_th_raw = load_thresholds(exposure_params.file_path)
    
    # filter the DataFrame
    th_mask = build_threshold_filter_mask_str(df_th_raw, exposure_params)
    df_th_filtered = filter_thresholds(df_th_raw, th_mask)
    
    # convert the strings to enum
    enum_mapping = {
        "HearingGroup": HearingGroup,
        "Impact": Impact,
        "Metric": Metric
    }
    df_th_filtered_enums = df_string_columns_to_enum(df_th_filtered, enum_mapping)
    
    return df_th_filtered_enums

    
# get thresholds --------------------------------------------------------------
def _load_process_thresholds_v2(exposure_params):
    # This version tries to convert strings to enum first - better but 
    # currently not possible because not all possibilities that exist in the 
    # spreadsheet are defined in the enums at the moment.
    
    # load the raw thresholds
    df_th_raw = load_thresholds(exposure_params.file_path)
    
    # convert the strings to enum
    enum_mapping = {
        "HearingGroup": HearingGroup,
        "Impact": Impact,
        "Metric": Metric
    }
    df_th_enums = df_string_columns_to_enum(df_th_raw, enum_mapping)
    
    # filter the DataFrame
    th_mask = build_threshold_filter_mask(df_th_enums, exposure_params)
    df_th_filtered = filter_thresholds(df_th_enums, th_mask)
    
    return df_th_filtered


# get marine mammal weighting parameters --------------------------------------
def _load_process_weighting_params(file_path):
    
    # load weighting parameters
    df_weight_params = load_weighting_params(file_path)
    
    # convert HearingGroup column to Enums
    enum_mapping = {"HearingGroup": HearingGroup}
    df_weight_params_enum = df_string_columns_to_enum(df_weight_params, enum_mapping)
    
    # Use HearingGroup as the Index
    df_weight_params_enum.set_index("HearingGroup", inplace=True)
    
    return df_weight_params_enum


# append geocoordinates for impact zone boundaries ----------------------------
def _append_zone_geocoordinates(zone_data, tl_model_params):
    
    for i, zone in enumerate(zone_data):
        lon, lat = polar2geo(
            azimuth=zone["Azimuth"],
            distance=zone["Distance"],
            lon0=tl_model_params.src_lon,
            lat0=tl_model_params.src_lat
        )
        zone_data[i] = {"Longitude": lon, "Latitude": lat} | zone
        
    return zone_data
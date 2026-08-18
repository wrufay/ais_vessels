#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Module for calculating zones of acoustic impact.

Created on Tue Jun 23 20:17:03 2026

@author: beslinw
"""

import numpy as np


# compute zones for all thresholds --------------------------------------------
def compute_all_zone_boundaries(ds_noisefield, df_th, exposure_params):
    """
    Compute zone boundaries for all thresholds and get their areas. Results are returned 
    as a Python list containing dictionaries with info relating to each zone, including 
    Azimuth, Distance, and Area.

    Parameters
    ----------
    ds_noisefield : xarray Dataset
        Dataset containing RL data by azimuth and distance from source.
    df_th : pandas DataFrame
        DataFrame containing noise impact threshold information.
    exposure_params : ExposureAssessmentParams
        Object of ExposureAssessmentParams class containing user-specified parameters 
        relating to noise exposure assessment.

    Returns
    -------
    zones : list
        List of dictionaries containing data for each zone. Each zone has its own 
        dictionary. Dict fields are 'Azimuth', 'Distance', and 'Area'

    """
    
    # Initialize output
    zones = []
    
    # Loop through each threshold and find the boundary
    for th_row in df_th.itertuples(name="ThresholdData"):
        # Get zone boundary
        azimuths, distances = _compute_zone_boundary(ds_noisefield, th_row, exposure_params.disable_weighting)
          
        # Compute area
        area = _compute_zone_area(azimuths, distances)
        
        # Store the results in a dictionary
        zone = {
            "Azimuth": azimuths,
            "Distance": distances,
            "Area": area
        }
        
        # Add results to list
        zones.append(zone)
        
    return zones


# rank zones ------------------------------------------------------------------
def rank_zones_by_area(zone_data):
    """
    Ranks zones of impact in order of largest to smallest area.

    Parameters
    ----------
    zone_data : list
        List containing dicts of impact zone data (one element per zone).

    Returns
    -------
    rank : numpy array
        Array of indexing values where 0 is the zone with the largest area.

    """
    
    areas = np.array([zone["Area"] for zone in zone_data])
    rank = np.argsort(-areas)
    return rank
        

# HELPERS =====================================================================
# compute single zone boundary ------------------------------------------------
def _compute_zone_boundary(ds_noisefield, th_data, disable_weighting):
    """
    Calculates the edges of an impact zone for one threshold.
    Here, th_data is expected to be a single row from a Pandas DataFrame produced using 
    the itertuples() method. Outputs are two 1D numpy arrays containing azimuths and 
    zone limits, respectively.
    """

    # Find the appropriate RL array
    RL = ds_noisefield[[v for v in ds_noisefield.data_vars if v.startswith("RL")]].filter_by_attrs(
        Metric=th_data.Metric,
        HoursOfExposure=th_data.HoursOfExposure if not np.isnan(th_data.HoursOfExposure) else lambda x: np.isnan(x),
        Weighting=th_data.HearingGroup if th_data.IsWeighted == 1 and not disable_weighting else None
    )
    (RL,) = RL.data_vars.values()  # This converts the Dataset to a DataArray, assuming the Dataset contains only one array
    
    # Get azimuth array
    azimuths = RL.azimuth.values
    
    # Find all places where RL exceeds the threshold
    above_th = RL >= th_data.Threshold_dB
    
    # Find the last distance where RL exceeds threshold for each azimuth
    limits = RL.distance.where(above_th).max(dim="distance").values
    limits[np.isnan(limits)] = 0
        
    return azimuths, limits


# compute area ----------------------------------------------------------------
def _compute_zone_area(azimuths, distances):
    """
    Calculate total zone area by adding the area of triangular components. 
    
    NOTE: This function assumes that azimuth ranges from 0-360 degrees inclusive. It 
    also assumes that the distance and azimuth vectors have the same length. Distance is
    expected to be in metres and output in square metres; to convert area to square km 
    you must divide by 1000000.
    """
    
    # get number of azimuths
    n_az = len(azimuths)
    
    # initialize area
    area = np.float32(0)
    
    # loop through each triangle formed by adjacent azimuth-distance pair, 
    # calculate the area of the triangle, and append it to the total zone area.
    for i in range(1,n_az):
        a = distances[i-1]
        b = distances[i]
        theta = np.radians(azimuths[i] - azimuths[i-1])
        area_i = 0.5 * a * b * np.sin(theta)
        
        area = area + area_i

    return area
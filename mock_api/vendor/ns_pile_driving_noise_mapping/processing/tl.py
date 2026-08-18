#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Module containing TL processing code.

Created on Tue Jun 23 12:59:08 2026

@author: beslinw
"""

import numpy as np
import xarray as xr


# calculate average TL across depth -------------------------------------------
def compute_depth_averaged_tl(tl_data, depth_range):
    """
    Calculates average TL across a depth range for each data slice and returns the 
    results as a new xarray Dataset.

    Parameters
    ----------
    tl_data : dict
        Contains xarray Dataset objects that each represents one TL model data slice. 
        The dict keys are azimuth values.
    depth_range : array-like
        Two-element array of floats representing the min and max depth values between 
        which to calculate the average TL.

    Returns
    -------
    ds_tl_mean : xarray Dataset
        Contains depth-average TL in a single Dataset with azimuth and distance as 
        coordinates (distance is a 2D array with azimuth as the first dimension).

    """
    
    # create Numpy array of azimuths (assuming dict is already sorted)
    azimuths = np.array(list(tl_data.keys()))
    n_azimuths = len(azimuths)
    
    # get number of distance points (assumes each slice has the same number of points)
    n_distances = len(tl_data[azimuths[0]].distance)
    
    # initialize distance and mean TL arrays
    distances = np.zeros([n_azimuths, n_distances], dtype=tl_data[azimuths[0]].distance.dtype)
    mean_tl = distances.copy()
    
    # loop through each data slice
    for i, az in enumerate(azimuths):
        # get slice
        ds_slice = tl_data[az]
        
        # get vector of binary depth weights where 1 is in range and 0 is out of range
        da_weights = xr.DataArray(
            (
                (ds_slice.depth >= min(depth_range))
                 & (ds_slice.depth <= max(depth_range))
             ).astype(float),
            dims="depth"
        )
        
        # convert TL to linear scale
        da_tl_linear = _db2linear(ds_slice.TL)
        
        # calculate average linear TL across depth based on weights
        da_tl_mean_linear = da_tl_linear.weighted(da_weights).mean(dim="depth")
        
        # convert averaged TL back to dB scale
        da_tl_mean = _linear2db(da_tl_mean_linear)
        
        # add data to mean TL and distance to matrices
        mean_tl[i,:] = da_tl_mean.values.astype(mean_tl.dtype)
        distances[i,:] = ds_slice.distance.values
        
    # create new xarray Dataset to store polar depth-averaged TL data
    ds_tl_mean = xr.Dataset(
        coords={
            "azimuth": azimuths,
            "distance": (("azimuth", "distance"), distances)
        },
        data_vars={
            "TL": (("azimuth", "distance"), mean_tl)
        }
    )
    
    return ds_tl_mean


# HELPERS =====================================================================
# Convert logscale TL to linear scale -----------------------------------------
# MAY MOVE TO A NEW MODULE
def _db2linear(tl_db):
    return 10 ** (tl_db / 10)


# Convert linear TL to log scale ----------------------------------------------
# MAY MOVE TO A NEW MODULE
def _linear2db(tl_linear):
    return 10 * np.log10(tl_linear)
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Module for handling import of TL model data from pickle files.

Created on Mon Jun 22 18:22:03 2026

@author: beslinw
"""

import pickle
from pathlib import Path

import numpy as np
import xarray as xr


# -----------------------------------------------------------------------------
def load_tl_model_output(tl_model_params):
    """
    Reads in CSnap model files representing transmission loss from a noise source and 
    imports the data as a dict of xarray Datasets (one Dataset for each file). The dict 
    keys are the azimuths.
    
    DEV NOTES: consider allowing the option to filter by depth.

    Parameters
    ----------
    tl_model_params : TLModelParams
        Object of NoiseLevelParams class containing user-specified parameters relating 
        to the noise source level.

    Returns
    -------
    data : dict
        Dict of TL xarray Datasets where keys are azimuth values.

    """

    # get file list
    files, file_az = _get_csnap_file_list(
        tl_model_params.data_folder, 
        tl_model_params.src_depth, 
        tl_model_params.src_freq, 
        tl_model_params.noise_date.strftime("%Y%m%d")
    )
    
    # initialize empty dictionary with azimuths as keys
    data = dict.fromkeys(file_az)
    
    # load and process each file one-by-one
    for i, f in enumerate(files):
        TL, distance, depth, title = _load_csnap(f)
        az = file_az[i]
        
        # get shape of current slice
        n_depth, n_distance = TL.shape
        
        # create xarray Dataset from data slice
        data[az] = xr.Dataset(
            coords={
                "depth": depth,
                "distance": distance
            },
            data_vars={
                "TL": (("depth", "distance"), TL)
            }
        )
    
    return data


# HELPERS =====================================================================
# -----------------------------------------------------------------------------
def _get_csnap_file_list(csnap_folder, src_depth, src_freq, date_str):
    """
    Get list of all CSnap pickle files in a folder for one particular source 
    (unique depth, frequency, and date). Also returns the azimuths in degrees as a 
    complimentary numpy array.
    """
    
    # define CSnap naming convention
    template_filename = f"csnapOut_{src_depth:04d}m_{src_freq:04d}Hz_???_{date_str}.pik"
    
    # get all files that match the template
    files = sorted([p for p in Path(csnap_folder).glob(template_filename) if p.is_file()])
    
    # get azimuths as a Numpy array
    azimuths = np.fromiter((int(f.name.split('_')[3]) for f in files), dtype='uint16')
    
    return files, azimuths


# -----------------------------------------------------------------------------
def _load_csnap(csnap_file):
    """
    loads a csnap pickle file and returns its TL matrix plus the distance and depth 
    vectors (and also the title).
    """
    
    with open(csnap_file,'br') as f:
        (title, max_depth, src_depth, src_freq, tl, distance, n_depth_pts) = pickle.load(f)
        
    tl = tl.astype('float32')
    distance = distance.astype('float32')
    depth = -np.linspace(0, max_depth, n_depth_pts, dtype='float32')
    #print(depth[0:5])  # DEBUG
    
    return tl, distance, depth, title
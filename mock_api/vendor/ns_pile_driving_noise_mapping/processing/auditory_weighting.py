#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Module containing code for auditory weighting.

Created on Tue Jun 23 17:14:26 2026

@author: beslinw
"""

import numpy as np
import pandas as pd


# compute received levels -----------------------------------------------------
def compute_received_levels(ds_tl, df_thr, df_weighting, exposure_params, tl_model_params, noise_level_params):
    """
    Calculates required received levels and adds them to a TL Dataset.

    Parameters
    ----------
    ds_tl : xarray Dataset
        Dataset containing TL model information.
    df_thr : pandas DataFrame
        DataFrame containing noise impact threshold information.
    df_weighting : pandas DataFrame
        DataFrame containing marine mammal auditory weighting information.
    noise_level_params : NoiseLevelParams
        Object of NoiseLevelParams class containing user-specified parameters relating 
        to the noise source level.

    Returns
    -------
    ds : xarray Dataset
        TL Dataset with group- and metric-specific received levels added as new 
        variables.

    """
    
    ds = ds_tl.copy()
    
    # Create a DataFrame based on df_th to identify which received levels need 
    # to be calculated
    df_rl_types = pd.DataFrame({
        "Metric": df_thr["Metric"],
        "HoursOfExposure": df_thr["HoursOfExposure"],
        "Weighting": None
    })
    if not exposure_params.disable_weighting:
        df_rl_types.loc[df_thr["IsWeighted"]==1, "Weighting"] = df_thr.loc[df_thr["IsWeighted"]==1, "HearingGroup"]
    df_rl_types.drop_duplicates(inplace=True)
    rl_prop_fields = df_rl_types.columns
    
    # loop through each RL type and calculate it
    ### NOTE: using itertuples here instead of iterrows because iterrows does 
    ### not conserve the Enum objects (they are transformed into strings).
    ### itertuples returns a "NamedTuple" object, which is similar to a 
    ### dictionary. Use dot notation to retrieve items from this object.
    for rl_props_row in df_rl_types.itertuples(name="RL_properties"):  
        i = rl_props_row.Index
    
        # Get SL based on metric
        SL = getattr(noise_level_params, rl_props_row.Metric.value) # NOTE: I may have to change how noise level params work in the future...
        
        # Calculate base (i.e., unweighted) RL
        RL = SL - abs(ds["TL"])  # Jinshan's TL values are negative
        
        # Apply relevant weighting if applicable
        if rl_props_row.Weighting is not None:
            #weighting_params = df_weighting.iloc[df_weighting["HearingGroup"]==rl_props_row.Weighting, :]
            
            weight = _compute_weights(
                tl_model_params.src_freq/1000.0,
                df_weighting.at[rl_props_row.Weighting,"a"],
                df_weighting.at[rl_props_row.Weighting,"b"],
                df_weighting.at[rl_props_row.Weighting,"f1"],
                df_weighting.at[rl_props_row.Weighting,"f2"],
                df_weighting.at[rl_props_row.Weighting,"C"],
            ).astype(ds["TL"].dtype)
            
            RL = RL + weight
            
        # Add results to Dataset with appropriate metadata
        var_name = f"RL_{i}"
        ds[var_name] = RL
        ds[var_name].attrs.update(dict(zip(rl_prop_fields,rl_props_row[1:])))
            
    return ds
  
    
# HELPERS =====================================================================
# compute weights -----------------------------------------------------------
def _compute_weights(f, a, b, f1, f2, C):
    """
    Calculate noise level weights in dB (positive) based on NMFS 2024 marine mammal 
    auditory weighting functions.
    
    ***IMPORTANT NOTE: the source frequency must be in kHz!***
    """
    
    weight_term_1 = (f/f1)**(2*a)
    weight_term_2 = (1 + (f/f1)**2)**a
    weight_term_3 = (1 + (f/f2)**2)**b
    weights = 10*np.log10(weight_term_1/(weight_term_2*weight_term_3)) + C
    
    return weights
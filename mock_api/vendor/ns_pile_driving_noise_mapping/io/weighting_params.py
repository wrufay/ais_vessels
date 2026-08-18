#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Module for handling import of marine mammal auditory weighting parameters from an input 
spreadsheet.

Created on Mon Jun 22 17:59:23 2026

@author: beslinw
"""

import pandas as pd


# -----------------------------------------------------------------------------
def load_weighting_params(file_path):
    """
    Returns a Pandas DataFrame containing NMFS auditory weighting parameters for marine 
    mammal hearing groups.

    Parameters
    ----------
    file_path : pathlib.Path
        Path to Noise_Impact_Thresholds.xlsx file.

    Returns
    -------
    df : pandas DataFrame
        DataFrame containing marine mammal auditory weighting parameters.

    """
    
    # read the spreadsheet
    df = pd.read_excel(file_path, sheet_name='NMFS2024_MammalWeightingParams')
    return df
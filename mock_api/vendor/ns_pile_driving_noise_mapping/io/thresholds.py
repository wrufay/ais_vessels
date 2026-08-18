#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Module for handling import of thresholds from a spreadsheet.

Created on Mon Jun 22 13:04:07 2026

@author: beslinw
"""

import pandas as pd


# -----------------------------------------------------------------------------
def load_thresholds(file_path):
    """
    Returns a Pandas DataFrame containing thresholds and associated data.

    Parameters
    ----------
    file_path : pathlib.Path
        path to Noise_Impact_Thresholds.xlsx file.

    Returns
    -------
    df : pandas DataFrame
        DataFrame containing noise impact threshold information.

    """
    
    # read the spreadsheet
    df = pd.read_excel(file_path, sheet_name='Thresholds')
    return df


# -----------------------------------------------------------------------------
def filter_thresholds(df, mask):
    """
    Filters the thresholds DataFrame based on a user-specified mask. Also removes 
    columns not needed for subsequent data processing.

    Parameters
    ----------
    df : pandas DataFrame
        DataFrame containing noise impact threshold information.
    mask : bool array
        Specifies which rows in the DataFrame should be kept.

    Returns
    -------
    df : pandas DataFrame
        Filtered thresholds DataFrame.

    """

    df = df.copy()
    
    df = df.loc[mask, ["HearingGroup", "Threshold_dB", "Impact", "Metric", "HoursOfExposure", "IsWeighted"]].reset_index(drop=True)
    
    return df
    
    
# -----------------------------------------------------------------------------
def string_columns_to_enum(df, mapping):
    """
    Converts string columns in a Pandas DataFrame to their enum equivalents.

    Parameters
    ----------
    df : pandas DataFrame
        Thresholds DataFrame.
    mapping : dict
        Dict of enum classes where the keys are column headings.

    Returns
    -------
    df : pandas DataFrame
        DataFrame with string values replaced by enum objects.

    """

    df = df.copy()
    
    for col, enum_class in mapping.items():
        df[col] = df[col].map(enum_class)
        
    return df
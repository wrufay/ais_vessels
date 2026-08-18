#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Utilities for ns_pile_driving_noise_mapping

Created on Tue Jun 23 08:03:46 2026

@author: beslinw
"""

import pandas as pd

# -----------------------------------------------------------------------------
def df_string_columns_to_enum(df, mapping):
    """
    Converts string columns in a Pandas DataFrame to enum equivalents.

    Parameters
    ----------
    df : Pandas DataFrame
        DataFrame with string columns.
    mapping : dict
        dict of enum classes where the keys are column headings.

    Returns
    -------
    df : Pandas DataFrame
        DataFrame with string columns converted to enum objects.

    """

    df = df.copy()
    
    for col, enum_class in mapping.items():
        #df[col] = df[col].map(enum_class)  # does not work; it seems that pandas implicitly converts the enums back to strings
        #df[col] = [enum_class(x) for x in df[col]]  # also doesn't work
        #df[col] = (df[col].astype(object).map(lambda x: enum_class(x)))  # still doesn't work... WTF Pandas
        df[col] = pd.Series(
            [enum_class(x) for x in df[col]],
            index=df.index,
            dtype=object
        )
        
        #** DEBUG
        #print(type(df[col].iloc[0]))
        #** END DEBUG
        
    return df

# -----------------------------------------------------------------------------
def df_string_columns_to_enum_TESTING(df, mapping):
    """
    Converts string columns in a Pandas DataFrame to enum equivalents.
    FOR DEBUGGING, DO NOT USE

    Parameters
    ----------
    df : Pandas DataFrame
        DataFrame with string columns.
    mapping : dict
        dict of enum classes where the keys are column headings.

    Returns
    -------
    df : Pandas DataFrame
        DataFrame with string columns converted to enum objects.

    """

    df = df.copy()
    
    for col, enum_class in mapping.items():
        def convert(x):
            try:
                return enum_class(x)
            except Exception:
                raise ValueError(f"Invalid value '{x}' in column '{col}'")
                
        df[col] = df[col].map(convert)
        a = enum_class(df[col].iloc[0])
        print(a)
        assert all(isinstance(v, enum_class) for v in df[col]), f"{col} conversion failed"
        print(type(df[col].iloc[0]))
        print(isinstance(df[col].iloc[0], enum_class))
        print(df[col].apply(type).unique())
        
    return df
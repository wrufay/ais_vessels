#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Creates boolean filters for a Pandas DataFrames holding threshold or model info.

Created on Fri Jun 19 17:14:09 2026

@author: beslinw
"""

from .enums import SourceType, Reference

# Threshold mask --------------------------------------------------------------
### NOT YET USABLE
def build_threshold_filter_mask(df, exposure_params):
    mask = (
        df["Reference"].isin(list(Reference)) &
        df["SourceType"].isin(list(SourceType)) &
        df["HearingGroup"].isin(exposure_params.hearing_groups) &
        df["Impact"].isin(exposure_params.impact_types) &
        df["Metric"].isin(exposure_params.metrics)
    )
    return mask

# Threshold mask (string version) ---------------------------------------------
### Use this for now
def build_threshold_filter_mask_str(df, exposure_params):
    mask = (
        df["Reference"].isin([ref.value for ref in list(Reference)]) &
        df["SourceType"].isin([src.value for src in list(SourceType)]) &
        df["HearingGroup"].isin([hg.value for hg in exposure_params.hearing_groups]) &
        df["Impact"].isin([imp.value for imp in exposure_params.impact_types]) &
        df["Metric"].isin([m.value for m in exposure_params.metrics])
    )
    return mask
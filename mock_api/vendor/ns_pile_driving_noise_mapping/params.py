#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Parameter classes to hold parameters for generating pile driving noise exposure maps.

Created on Thu Jun 18 11:21:30 2026

@author: beslinw
"""

from dataclasses import dataclass, field
from typing import List, Tuple
from pathlib import Path
from importlib import resources
from datetime import date, timedelta
from math import log10

from .enums import HearingGroup, Impact, Metric


# Exposure Assessment Params ==================================================
@dataclass
class ExposureAssessmentParams:
    """
    Data class to hold the following prameters:
        hearing_groups: list of HearingGroup enum objects
        impact_types: list of Impact enum objects
        metrics: list of Metric enum objects
        depth_range: tuple of two nonnegative floats
        show_dual_metrics: Boolean
        disable_weighting: Boolean
        file_path: Path
    """
    
    # ATTRIBUTES --------------------------------------------------------------
    hearing_groups: List[HearingGroup] = field(default_factory=lambda:list(HearingGroup))
    impact_types: List[Impact] = field(default_factory=lambda:list(Impact))
    metrics: List[Metric] = field(default_factory=lambda:list(Metric))
    depth_range: Tuple[float, float] = (0.0, float('inf'))
    show_dual_metrics: bool = False
    disable_weighting: bool = False
    file_path: Path = field(default_factory=lambda:ExposureAssessmentParams._get_default_data_file_path())
    
    # INITIALIZATION ----------------------------------------------------------
    def __post_init__(self):
        self.hearing_groups = self._validate_enum_list(self.hearing_groups, HearingGroup)
        self.impact_types = self._validate_enum_list(self.impact_types, Impact)
        self.metrics = self._validate_enum_list(self.metrics, Metric)
        self.depth_range = self._validate_depth_range(self.depth_range)
        if not self.file_path.exists():
            raise ValueError(f"File does not exist: {self.file_path}")
            
    # HELPERS -----------------------------------------------------------------
    # get default data file path ..............................................
    @staticmethod
    def _get_default_data_file_path():
        # get virtual file path
        workbook_resource = resources.files("ns_pile_driving_noise_mapping").joinpath("Noise_Impact_Thresholds.xlsx")
        
        # convert the virtual path to a real pathlib.Path object
        ### resources.as_file will do this automatically
        with resources.as_file(workbook_resource) as file_path:
            return file_path
    
    # validate enum lists .....................................................
    @staticmethod
    def _validate_enum_list(values, enum_type):
        if not isinstance(values, list):
            values = [values]
        
        validated = []
        for v in values:
            if isinstance(v, enum_type):
                validated.append(v)
            else:
                try:
                    validated.append(enum_type(v))  # convert string to enum
                except ValueError:
                    raise ValueError(f"Invalid {enum_type.__name__}: {v}")
                    
        return validated
    
    # validate depth range ....................................................
    @staticmethod
    def _validate_depth_range(value):
        if len(value) != 2:
            raise ValueError("depth_range must have two values")
            
        min_d, max_d = value
        
        #if min_d < 0 or max_d < 0:
        #    raise ValueError("depth must be non-negative")
            
        if min_d > max_d:
            raise ValueError("depth_range must be (min, max)")
            
        return value
    
    # __repr__ OVERRIDE -------------------------------------------------------
    def __repr__(self):
        return (
            "ExposureAssessmentParams(\n"
            f"    hearing_groups = {self.hearing_groups}\n"
            f"    impact_types = {self.impact_types}\n"
            f"    metrics = {self.metrics}\n"
            f"    depth_range = {self.depth_range}\n"
            f"    show_dual_metrics = {self.show_dual_metrics}\n"
            f"    disable_weighting = {self.disable_weighting}\n"
            f"    file_path = {self.file_path}\n)"
        )
    
    
# TL Model Params =============================================================
@dataclass
class TLModelParams:
    """
    Data class to hold the following parameters:
        src_depth: depth of the acoustic source in metres
        src_freq: frequency of the acoustic source in Hz
        src_lon: longitude of the acoustic source in decimal degrees
        src_lat: latitude of the acoustic source in decimal degrees
        noise_date: date of the pile driving activity (datetime 'date' object)
        model_name: name of the model
        data_folder: Path to a folder containing TL model pickle files (Path object)
    """
    
    # ATTRIBUTES --------------------------------------------------------------
    src_freq: float
    src_depth: float
    src_lon: float
    src_lat: float
    noise_date: date
    model_name: str
    data_folder: Path = Path(".")
    
    # INITIALIZATION ----------------------------------------------------------
    def __post_init__(self):
        if isinstance(self.data_folder, str):
            self.data_folder = Path(self.data_folder)
        if not self.data_folder.exists():
            raise ValueError(f"Path does not exist: {self.data_folder}")
            
    # __repr__ OVERRIDE -------------------------------------------------------
    def __repr__(self):
        return (
            "TLModelParams(\n"
            f"    src_freq = {self.src_freq}\n"
            f"    src_depth = {self.src_depth}\n"
            f"    src_lon = {self.src_lon}\n"
            f"    src_lat = {self.src_lat}\n"
            f"    noise_date = {self.noise_date}\n"
            f"    model_name = {self.model_name}\n"
            f"    data_folder = {self.data_folder}\n)"
        )
            
    
# Noise Level Params ==========================================================
@dataclass
class NoiseLevelParams:
    """
    Data class to hold the following parameters:
        SPL_peak: peak sound pressure level in dB
        SEL_single_strike: sound exposure level of a single strike
        n_strikes_per_pile: number of strikes per pile in the assessment period
        n_piles: total number of piles being driven in the assessment period
        assessment_period: timedelta object representing the length of time being examined
        SEL_cum (property): cumulative sound exposure level within the assessment period
    """
    
    # ATTRIBUTES --------------------------------------------------------------
    SPL_peak: float
    SEL_single_strike: float
    n_strikes_per_pile: int
    n_piles: int = 1
    assessment_period: timedelta = field(default_factory=lambda:timedelta(hours=24))
    
    # PROPERTIES --------------------------------------------------------------
    @property
    def SEL_cum(self) -> float:
        return float(self.SEL_single_strike + 10*log10(self.n_strikes_per_pile * self.n_piles))
    
    # __repr__ OVERRIDE -------------------------------------------------------
    def __repr__(self):
        return (
            "NoiseLevelParams(\n"
            f"    SPL_peak = {self.SPL_peak}\n"
            f"    SEL_single_strike = {self.SEL_single_strike}\n"
            f"    n_strikes_per_pile = {self.n_strikes_per_pile}\n"
            f"    n_piles = {self.n_piles}\n"
            f"    assessment_period = {self.assessment_period}\n"
            f"    SEL_cum = {self.SEL_cum}\n)"
        )
    
    
# Plot Params =================================================================
@dataclass
class PlotParams:
    """
    Data class to hold the following parameters:
        map_extents: The latitude and longitude range of the plot. Specify as a 
            dictionary with fields "lon_min", "lon_max", "lat_min", "lat_max".
        wea_shapefile_path: Path of folder containing WEA shapefiles
        fig_width: Width of the figure (WHICH UNITS???)
        fig_height: Height of the figure (WHICH UNITS???)
        
        ...and more to come including artist colours etc.
    """
    
    # ATTRIBUTES --------------------------------------------------------------
    wea_shapefile_path: Path
    map_extents: dict = None
    scalebar_length_km: float = 10
    wea_linecol: str = "darkred"
    land_col: str = "#f0efe8"
    water_col: str = "#d9ecff"
    colormap: str = "viridis"
    fig_width: float = 12
    fig_height: float = 9
    
    # INITIALIZATION ----------------------------------------------------------
    def __post_init__(self):
        if isinstance(self.wea_shapefile_path, str):
            self.wea_shapefile_path = Path(self.wea_shapefile_path)
        if not self.wea_shapefile_path.exists():
            raise ValueError(f"Path does not exist: {self.wea_shapefile_path}")
            
    # __repr__ OVERRIDE -------------------------------------------------------
    def __repr__(self):
        return (
            "PlotParams(\n"
            f"    wea_shapefile_path = {self.wea_shapefile_path}\n"
            f"    map_extents = {self.map_extents}\n"
            f"    scalebar_length_km = {self.scalebar_length_km}\n"
            f"    wea_linecol = {self.wea_linecol}\n"
            f"    land_col = {self.land_col}\n"
            f"    water_col = {self.water_col}\n"
            f"    colormap = {self.colormap}\n"
            f"    fig_width = {self.fig_width}\n"
            f"    fig_height = {self.fig_height}\n)"
        )
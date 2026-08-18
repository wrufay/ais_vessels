#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Enumeration classes for categorical data relating to pile driving noise exposure 
assessment. 

**THE STRINGS MUST MATCH THOSE IN THE Noise_Impact_Thresholds.xlsx WORKBOOK EXACTLY**


Created on Thu Jun 18 11:07:33 2026

@author: beslinw
"""

from enum import Enum

# Hearing Group ===============================================================
class HearingGroup(str, Enum):
    LF_CETACEANS = "LF Cetaceans"
    HF_CETACEANS = "HF Cetaceans"
    VHF_CETACEANS = "VHF Cetaceans"
    PHOCIDS = "Phocids Underwater"
    FISH_NO_BLADDER = "Fish - No Swim Bladder"
    FISH_NONAUDITORY_BLADDER = "Fish - Non-Auditory Swim Bladder"
    FISH_AUDITORY_BLADDER = "Fish - Auditory Swim Bladder"
    FISH_EGGS_LARVAE = "Fish - Eggs and Larvae"
    SEA_TURTLES = "Sea Turtles"
    
    def __str__(self):
        return self.value
    
    
# Impact ======================================================================
class Impact(str, Enum):
    TTS = ("TTS", ":")
    AUD_INJ = ("AUD INJ", "--")
    REC_INJ = ("REC INJ", "-.")
    MORTALITY = ("Mortality", "-")
    
    def __new__(cls, value, linestyle):
        # __new__ is the true class constructor. Here I'm overriding this to 
        # attach a "linestyle" attribute to the enum objects to assign a unique 
        # matplotlib linestyle for each category.
        obj = str.__new__(cls, value)
        obj._value_ = value
        obj.linestyle = linestyle
        return obj
    
    def __str__(self):
        return self.value
    

# Metric ======================================================================
class Metric(str, Enum):
    SPL_PEAK = "SPL_peak"
    SEL_CUM = "SEL_cum"
    
    def __str__(self):
        return self.value
    
    
# SourceType ==================================================================
class SourceType(str, Enum):
    IMPULSIVE = "Impulsive"
    PILE_DRIVING = "Pile Driving"
    
    def __str__(self):
        return self.value
    
    
# Reference ===================================================================
class Reference(str, Enum):
    NMFS_2024 = "NMFS 2024"
    POPPER_2014 = "Popper et al. 2014"
    
    def __str__(self):
        return self.value
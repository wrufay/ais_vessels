# -*- coding: utf-8 -*-

# debug script for ns_pile_driving_noise_mapping.params

from datetime import date

from ns_pile_driving_noise_mapping import ExposureAssessmentParams, TLModelParams, NoiseLevelParams


a1 = ExposureAssessmentParams()
a2 = ExposureAssessmentParams(hearing_groups="LF Cetaceans")
a3 = ExposureAssessmentParams(depth_range=(0,40))

b = TLModelParams(
    src_freq=500,
    src_depth=135,
    src_lon=62,
    src_lat=42,
    noise_date=date(2026, 6, 19)
)

c = NoiseLevelParams(
    SPL_peak = 230,
    SEL_single_strike = 210,
    n_strikes_per_pile = 770,
    n_piles = 8
)
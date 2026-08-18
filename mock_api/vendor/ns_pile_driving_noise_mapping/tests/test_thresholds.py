# -*- coding: utf-8 -*-

from ns_pile_driving_noise_mapping.io.thresholds import load_thresholds
from ns_pile_driving_noise_mapping import ExposureAssessmentParams


a = ExposureAssessmentParams(hearing_groups="LF Cetaceans", depth_range=(0,40))

df = load_thresholds(a)
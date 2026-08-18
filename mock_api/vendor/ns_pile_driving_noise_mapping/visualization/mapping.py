#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Module for plotting noise propagation and ecological impact data on a map.

Created on Tue Jul 14 13:23:04 2026

@author: beslinw
"""

import numpy as np
import geopandas as gpd
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
from matplotlib.patches import Patch
import cartopy.crs as ccrs
import cartopy.feature as cfeature
from mpl_toolkits.axes_grid1.anchored_artists import AnchoredSizeBar


# Create global Plate Carree projection (for lat/lon data)
PROJ_GEO = ccrs.PlateCarree()

# Define zorder for mapping components
ZORDER = {
    "OCEAN": 1,
    "NOISE FIELD": 2,
    "NOISE SOURCE": 3,
    "WEAS": 4,
    "IMPACT ZONE BASE": 10,
    "LAND": 100,
    "BORDERS": 101,
    "COASTLINE": 102,
    "GRIDLINES": 1000,
    "SCALEBAR": 1001,
    "LEGEND": 1002
}


# Main mapping function -------------------------------------------------------
def create_map(
        ds_noisefield,
        zones,
        df_th,
        exposure_params,
        tl_model_params,
        noise_level_params,
        plot_params
):
    """
    Main visualization function for plotting zones of acoustic impact on a map from 
    given data and parameters.

    Parameters
    ----------
    ds_noisefield : xarray Dataset
        Dataset containing averaged TL and RL information with zaimuth and distance as 
        coordinates.
    zones : list
        List of dicts containing data for each zone of impact.
    df_th : pandas DataFrame
        Table of noise impact threshold information.
    exposure_params : ExposureAssessmentParams
        Object of ExposureAssessmentParams class containing user-specified parameters 
        relating to noise exposure assessment.
    tl_model_params : TLModelParams
        Object of TLModelParams class containing user-specified parameters relating to 
        the noise propagation model.
    noise_level_params : NoiseLevelParams
        Object of NoiseLevelParams class containing user-specified parameters relating 
        to the noise source level.
    plot_params : PlotParams
        Object of PlotParams class containing user-specified parameters relating to 
        plotting.

    Returns
    -------
    ax : cartopy GeoAxes
        The GeoAxes object on which the map is plotted.

    """
    
    # Extract lon and lat grid for noise field
    lon_grid = ds_noisefield.attrs["GridMapper"].lon_grid
    lat_grid = ds_noisefield.attrs["GridMapper"].lat_grid
    
    # Interpolate TL
    tl = ds_noisefield.attrs["GridMapper"].interpolate(ds_noisefield["TL"])
    
    # Determine which impact zones should be plotted
    plot_zone = filter_impact_zones(exposure_params, df_th, zones)
    
    # Set up figure
    fig, ax = init_fig(plot_params)
    
    # Set axes limits
    ### If no manual limits were specified, determine automatic limits based on
    ### the extent of the TL/RL dataset
    if plot_params.map_extents is None:
        ax_limits = compute_auto_extents(ds_noisefield, tl_model_params)
    else:
        ax_limits = np.array([
            plot_params.map_extents["lon_min"],
            plot_params.map_extents["lon_max"],
            plot_params.map_extents["lat_min"],
            plot_params.map_extents["lat_max"]
        ])
    ax.set_extent(ax_limits, crs=PROJ_GEO)
    
    # Add basemap features
    plot_basemap(ax, plot_params)
    
    # Draw filled TL/RL field
    cf = plot_noisefield(
        ax, 
        lon_grid, 
        lat_grid, 
        tl, 
        plot_params
    )
    
    # Draw source location
    src_point = plot_noise_source(ax, tl_model_params)
    
    # Add WEA polygons from shapefile, if applicable
    if plot_params.wea_shapefile_path is not None:
        wea_proxy = plot_weas(ax, plot_params)
    else:
        wea_proxy = None
    
    # Add impact zones
    f_zones = plot_impact_zones(ax, df_th, zones, plot_zone)
    
    # Add scalebar
    plot_scalebar(ax, plot_params)
    
    # Add title and legend
    legend_elements = [src_point] + [wea_proxy] + f_zones
    leg = ax.legend(
        handles=legend_elements, 
        facecolor=(0.33,0.33,0.33),
        framealpha=0.85,
        labelcolor="white",
        fontsize=10,
        loc="upper right"
    )
    leg.set_zorder(ZORDER["LEGEND"])
    ax.set_title(
        f"Pile Driving Noise Footprint - {tl_model_params.model_name} ({tl_model_params.noise_date})\n"
        fr"Depth range={exposure_params.depth_range} m, SPL_peak={noise_level_params.SPL_peak:.1f} dB re 1 $\mu$Pa, SEL_cum={noise_level_params.SEL_cum:.1f} dB re 1 $\mu$Pa$^{{2}}$s",
        fontsize=13
    )
    
    # Show plot
    plt.show()
    
    return ax


# Filter zones ----------------------------------------------------------------
def filter_impact_zones(exposure_params, df_th, zones):
    """
    Flags impact zones that shouldn't be plotted, either because they don't exist 
    (i.e., area = 0) or because they are the smaller zone in a dual-metric pair.

    Parameters
    ----------
    exposure_params : ExposureAssessmentParams
        Object of ExposureAssessmentParams class containing user-specified parameters 
        relating to noise exposure assessment.
    df_th : pandas DataFrame
        Table of noise impact threshold information.
    zones : list
        List of dicts containing data for each zone of impact.

    Returns
    -------
    plot_zone : numpy bool array
        Array of boolean values indicating if a zone should be plotted or not.

    """
    
    # Flag impact zones with 0 area to avoid plotting them
    zone_areas = np.array([zone["Area"] for zone in zones])
    plot_zone = zone_areas != 0
    
    # For dual-metric criteria, check which zone(s) should be plotted based on area.
    #n_zones = len(df_th)
    #plot_zone = np.array([True]*n_zones)
    if not exposure_params.show_dual_metrics:
        for _, hg_i_group in df_th.iloc[plot_zone,].groupby(["HearingGroup","Impact"]):
            group_indices = hg_i_group.index.values
            group_areas = np.array([zones[i]["Area"] for i in group_indices])
            plot_zone[group_indices[group_areas != group_areas.max()]] = False
            
    return plot_zone


# Initialize figure -----------------------------------------------------------
def init_fig(
        plot_params,
        lambert_central_lon = -63.0,
        lambert_central_lat = 45.0,
        lambert_standard_parallels = (43.0, 47.0)
):
    """
    Create an empty GeoAxes plot with a Lambert Conformal CRS.

    Parameters
    ----------
    plot_params : PlotParams
        Object of PlotParams class containing user-specified parameters relating to 
        plotting.
    lambert_central_lon : float, optional
        Central longitude for Lambert Conformal Conic CRS. The default is -63.0.
    lambert_central_lat : float, optional
        Central latitude for Lambert Conformal Conic CRS. The default is 45.0.
    lambert_standard_parallels : tuple, optional
        2-element tuple of floats defining the standard parallels for the Lambert 
        Conformal Conic CRS. The default is (43.0, 47.0).

    Returns
    -------
    fig : matplotlib Figure
        Figure containing the plot.
    ax : cartopy GeoAxes
        The GeoAxes object on which the map is plotted.

    """
    
    # create Lambert Conformal Conic (LCC) projection centred roughly on Nova Scotia
    proj = ccrs.LambertConformal(
        central_longitude=lambert_central_lon,
        central_latitude=lambert_central_lat,
        standard_parallels=lambert_standard_parallels
    )
    
    # set up figure
    fig = plt.figure(figsize=(plot_params.fig_width, plot_params.fig_height))
    ax = plt.axes(projection=proj)
    
    return fig, ax


# Calculate automatic extents -------------------------------------------------
def compute_auto_extents(ds_noisefield, tl_model_params):
    """
    Determines automatic lon and lat limits for the plot based on extents of the data.

    Parameters
    ----------
    ds_noisefield : xarray Dataset
        Dataset containing averaged TL and RL information with zaimuth and distance as 
        coordinates.
    tl_model_params : TLModelParams
        Object of TLModelParams class containing user-specified parameters relating to 
        the noise propagation model.

    Returns
    -------
    ax_limits : numpy array
        Defines longitude and latitude limits for the plot.

    """
    
    # Convert extent to approximate degrees
    # 1 deg latitude ≈ 111.2 km (good rule of thumb)
    max_extent = ds_noisefield.distance.values.max()
    deg_lat = ((max_extent/1000) / 111.2)
    
    # longitude scaling by cos(Latitude)
    coslat = np.cos(np.radians(tl_model_params.src_lat))
    coslat = max(coslat, 0.15) # avoid tiny values near poles
    deg_lon = deg_lat/coslat

    # Add a dynamic buffer so the circle isn't hugging the frame.
    # For small radii, we want a minimum padding;
    # for large radii, we want proportionate padding.
    pad_factor = 0.50   # half the radius on each side
    min_pad_deg = 0.75  # ensures usable context for small radii
    pad_lat = max(min_pad_deg, pad_factor * deg_lat)
    pad_lon = max(min_pad_deg, pad_factor * deg_lon)
    
    # Apply extent in geographic coords
    ax_limits = np.array([
        tl_model_params.src_lon - (deg_lon + pad_lon),
        tl_model_params.src_lon + (deg_lon + pad_lon),
        tl_model_params.src_lat - (deg_lat + pad_lat),
        tl_model_params.src_lat + (deg_lat + pad_lat)
    ])
    
    return ax_limits


# Plot basemap ----------------------------------------------------------------
def plot_basemap(ax, plot_params):
    """
    Adds basemap features to the plot.

    Parameters
    ----------
    ax : cartopy GeoAxes
        The GeoAxes object on which the map is plotted.
    plot_params : PlotParams
        Object of PlotParams class containing user-specified parameters relating to 
        plotting.

    Returns
    -------
    None.

    """
    
    ax.add_feature(cfeature.LAND, facecolor=plot_params.land_col, zorder=ZORDER["LAND"])
    ax.add_feature(cfeature.OCEAN, facecolor=plot_params.water_col, zorder=ZORDER["OCEAN"])
    ax.add_feature(cfeature.COASTLINE, linewidth=0.8, zorder=ZORDER["COASTLINE"])
    ax.add_feature(cfeature.BORDERS, linewidth=0.5, linestyle=":", zorder=ZORDER["BORDERS"])
    gl = ax.gridlines(draw_labels=True, x_inline=False, y_inline=False, linewidth=0.4, color='gray', alpha=0.5)
    gl.set_zorder(ZORDER["GRIDLINES"])
    
    
# Plot TL/RL noisefield -------------------------------------------------------
def plot_noisefield(ax, lon_grid, lat_grid, tl, plot_params):
    """
    Draw TL or RL field as a filled colour mesh (currently only supports TL).

    Parameters
    ----------
    ax : cartopy GeoAxes
        The GeoAxes object on which the map is plotted.
    lon_grid : 2D numpy float array
        Array of longitude values generated using numpy's 'meshgrid' function.
    lat_grid : 2D numpy float array
        Array of latitude values generated using numpy's 'meshgrid' function.
    tl : numpy float array
        Array of interpolated TL or RL values.
    plot_params : PlotParams
        Object of PlotParams class containing user-specified parameters relating to 
        plotting.

    Returns
    -------
    cf : matplotlib QuadMesh
        Artist for visualizing the noise field.

    """
    
    # process colormap
    cmap = plot_params.colormap
    if cmap.startswith("cmo."):
        import cmocean.cm as cmo  # ignore warning
    
    # create colormesh
    cf = ax.pcolormesh(
        lon_grid, 
        lat_grid, 
        tl,
        transform=PROJ_GEO,
        cmap=cmap,
        vmin=-120,
        vmax=0,
        shading="auto",  # can be "gouraud" or "auto"
        zorder=ZORDER["NOISE FIELD"]
    )
    
    # add colorbar
    cbar = plt.colorbar(cf, ax=ax, shrink=0.7, pad=0.05, extend="min")
    cbar_label = "Transmission Loss [dB]"
    """
    if exposure_params.metric == "SEL_24h":
        if not impact_params["disable_weighting"]:
            cbar_label = "Weighted Received Level (SEL) [dB]"
        else:
            cbar_label = "Received Level (SEL, unweighted) [dB]"
    else:
        cbar_label = "Received Level (peak SPL) [dB]"
    """
    cbar.set_label(cbar_label)
    
    return cf


# Plot noise source -----------------------------------------------------------
def plot_noise_source(ax, tl_model_params):
    """
    Adds the noise source on the map as a black star.

    Parameters
    ----------
    ax : cartopy GeoAxes
        The GeoAxes object on which the map is plotted.
    tl_model_params : TLModelParams
        Object of TLModelParams class containing user-specified parameters relating to 
        the noise propagation model.

    Returns
    -------
    src_point : matplotlib Line2D
        Artist for visualizing the noise source.

    """
    
    src_point = ax.plot(
        tl_model_params.src_lon, 
        tl_model_params.src_lat,
        marker="*", markersize=10,
        color="black",
        linewidth=0,
        transform=PROJ_GEO,
        label=
            f"Pile Driving Source ({tl_model_params.src_freq} Hz, {tl_model_params.src_depth} m depth)",
            #f"Pile Driving Source\n"
            #f"({tl_model_params.src_depth}m, {tl_model_params.src_freq}Hz)",
        zorder=ZORDER["NOISE SOURCE"]
    )
    src_point = src_point[0]
    
    return src_point


# Plot WEAs -------------------------------------------------------------------
def plot_weas(ax, plot_params, clipping_buffer=0.2):
    """
    Adds NS Wind Energy Area polygons to an existing map.

    Parameters
    ----------
    ax : cartopy GeoAxes
        The GeoAxes object on which the map is plotted.
    plot_params : PlotParams
        Object of PlotParams class containing user-specified parameters relating to 
        plotting.
    clipping_buffer : float, optional
        Amount of padding to apply when clipping polygons. Clipping helps ensure that 
        the map extents are respected, but insufficient padding can cause the polygons 
        to appear cropped. The default is 0.2.

    Returns
    -------
    wea_proxy : matplotlib Patch
        Patch object with identical graphical properties as the WEA geometries. The 
        patch itself has not data on the map, but is used as a proxy that can be added 
        to a legend (the true geometries cannot be added to the legend directly)

    """
    
    # Load shapefile
    gdf_weas = gpd.read_file(plot_params.wea_shapefile_path)
    
    # Reproject CRS to WGS84 (EPSG:4326)
    ### A call to print(gdf.crs) shows that it is EPSG:4267 by default
    gdf_weas = gdf_weas.to_crs(epsg=4326) 
    
    # Clip WEAs to bounds
    ax_limits = ax.get_extent(crs=PROJ_GEO)  # Assuming that PROJ_GEO is the PlateCarree CRS, this will return extents in lon/lat.
    gdf_weas = gdf_weas.clip([
        ax_limits[0] - clipping_buffer, 
        ax_limits[2] - clipping_buffer, 
        ax_limits[1] + clipping_buffer, 
        ax_limits[3] + clipping_buffer
    ])
    
    # Plot the WEAs
    wea_facecol = "none"
    wea_linecol = plot_params.wea_linecol
    wea_linewidth = 1.5
    ax.add_geometries(
        gdf_weas.geometry, 
        crs=PROJ_GEO, 
        edgecolor=wea_linecol, 
        facecolor=wea_facecol, 
        linewidth=wea_linewidth,
        zorder=ZORDER["WEAS"]
    )
    
    # Create proxy artist to add WEAs to legend
    wea_proxy = Patch(
        facecolor=wea_facecol,
        edgecolor=wea_linecol,
        linewidth=wea_linewidth,
        label='Designated WEAs'
    )
    
    return wea_proxy


# Plot impact zones -----------------------------------------------------------
def plot_impact_zones(ax, df_th, zones, plot_zone):
    """
    Plot zones of noise impact - one zone per Hearing Group + Impact Type + Metric 
    combination, as specified by user (via df_th)

    Parameters
    ----------
    ax : cartopy GeoAxes
        The GeoAxes object on which the map is plotted.
    df_th : pandas DataFrame
        Table of noise impact threshold information.
    zones : list
        List of dicts containing data for each zone of impact.
    plot_zone : numpy bool array
        Array of boolean values indicating if a zone should be plotted or not.

    Returns
    -------
    f_zones : list
        List containing Polygon objects that each represent an impact zone.

    """
    
    # define contour properties
    ### alpha
    contour_alpha = 0.95
    
    ### zone colour - set this based on HearingGroup and Metric using 
    ### matplotlib's "tab20" colormap, which is a discrete colourmap that 
    ### defines a dark and light shade for 10 base colours; here, HearingGroup 
    ### determines the base colour, and Metric defines the shade.
    zone_col_list = plt.colormaps["tab20"].colors
    hearing_group_col_idx = {}
    metric_col_idx = {}
    for i, hg in enumerate(df_th["HearingGroup"].unique()):
        hearing_group_col_idx[hg] = 2*i
    for i, m in enumerate(df_th["Metric"].unique()):
        metric_col_idx[m] = i
    
    ### old colouring method that used different shades to distinguish Impact;
    ### I found this method less effective
    """
    zone_col_list = plt.colormaps["tab20c"].colors + plt.colormaps["tab20b"].colors
    hearing_group_col_idx = {}
    impact_col_idx = {}
    for i, hg in enumerate(df_th["HearingGroup"].unique()):
        hearing_group_col_idx[hg] = 4*i
    
    for i, imp in enumerate(df_th["Impact"].unique()):
        impact_col_idx[imp] = i
    """
    
    # draw impact zones one-by-one
    f_zones = []
    for i, zone in enumerate(zones):
        if plot_zone[i]:
            # extract metadata
            effect = df_th.loc[i,"Impact"]
            th = df_th.loc[i,"Threshold_dB"]
            hg = df_th.loc[i,"HearingGroup"]
            exphr = df_th.loc[i,"HoursOfExposure"]
            m_base = df_th.loc[i,"Metric"]
            m_full = m_base if np.isnan(exphr) else m_base + "_" + str(int(exphr)) + "h"
            
            # get area in square km - flag if the area is very small
            area_m = zone["Area"]
            area_km = area_m / 1000000
            if area_km > 0.01:
                area_str = f"= {area_km:.2f}"
            else:
                area_str = "< 0.01"
                
            # get average radius of area and its standard deviation
            r_ave_km = np.mean(zone["Distance"]) / 1000
            r_std_km = np.std(zone["Distance"]) / 1000
            
            # convert the mean +/- std radius to a string accurate to two 
            # decimal points - if either are smaller than 0.01, then adjust the
            # string accordingly
            if r_ave_km > 0.01:
                r_ave_str = f"= {r_ave_km:.2f}"
                if r_std_km > 0.01:
                    r_ave_str = r_ave_str + f" ± {r_std_km:.2f}"
                else:
                    r_ave_str = r_ave_str + " ± <0.01"
            else:
                r_ave_str = "< 0.01"
            
            # draw zone
            f_zone_i = ax.fill(
                zone["Longitude"], 
                zone["Latitude"], 
                transform=PROJ_GEO,
                color="none",
                alpha=contour_alpha,
                edgecolor=zone_col_list[hearing_group_col_idx[hg]+metric_col_idx[m_base]],
                linewidth=2,
                linestyle=effect.linestyle,
                label=
                    f'{effect} onset zone for {hg}\n'
                    f'    {int(th)} dB Threshold ({m_full})\n'
                    fr'    Area {area_str} km$^{{2}}$; Radius {r_ave_str} km',
                #    fr'{hg}: {effect} onset zone ({area_str}km$^{{2}}$)' + '\n'
                #    f'    {int(th)} dB threshold, {m}',
                zorder=ZORDER["IMPACT ZONE BASE"]+i
            )
            f_zones.append(f_zone_i[0])  # [0] because ax.fill returns a list
            
    return f_zones


# Plot scalebar ---------------------------------------------------------------
def plot_scalebar(ax, plot_params):
    """
    Adds a scale bar to the plot.

    Parameters
    ----------
    ax : cartopy GeoAxes
        The GeoAxes object on which the map is plotted.
    plot_params : PlotParams
        Object of PlotParams class containing user-specified parameters relating to 
        plotting.

    Returns
    -------
    None.

    """
    
    scalebar_length_m = plot_params.scalebar_length_km * 1000
    scalebar = AnchoredSizeBar(
        transform=ax.transData,
        size=scalebar_length_m,
        label=f'{plot_params.scalebar_length_km} km',
        loc='lower left',
        pad=0.5,
        color='black',
        frameon=True,
        size_vertical=scalebar_length_m * 0.05,
        fontproperties=fm.FontProperties(size=10)
    )
    scalebar.set_zorder(ZORDER["SCALEBAR"])
    ax.add_artist(scalebar)
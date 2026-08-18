#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Module for geospatial data processing

Created on Tue Jun 23 21:54:34 2026

@author: beslinw
"""

import numpy as np
from pyproj import Geod
from pyproj import Transformer
from scipy.spatial import Delaunay


# class PolarFieldInterpolator ------------------------------------------------
class PolarFieldInterpolator:
    """
    Class for interpolating polar noise field data on a longitude-latitude 
    grid. Stores the geographic grid itself, along with triangulation weights 
    and vertices needed to perform the interpolation operation. With this 
    approach, interpolation can be repeated efficiently for multiple data 
    arrays that share the same coordinates (e.g., RL fields with different 
    auditory weighting).
    
    This is basically a manual implementation of scipy's griddata(). Use it by creating 
    an instance of this class for a specific lon-lat grid and polar coordinates, and 
    calling the "interpolate()" method for an array that uses those polar coordinates.
    
    Attributes
    ----------
    lon_grid : 2D numpy float array
        Array of longitude values generated using numpy's 'meshgrid' function.
    lat_grid : 2D numpy float array
        Array of latitude values generated using numpy's 'meshgrid' function.
    weights : 2D numpy float array
        N-by-3 array of interpolation weights for each point in the grid.
    vertices : 2D numpy float array
        N-by-3 array of triangulation vertices for each point in the grid.
    
    """
    
    # Constructor .............................................................
    def __init__(
            self,
            ds,
            src_lon,
            src_lat,
            grid_res=500,
            crs="EPSG:3347"
    ):
        """
        Constructor for PolarFieldInterpolator.

        Parameters
        ----------
        ds : xarray Dataset
            Dataset containing the coordinates:
                "azimuth" - 1D array with dimensions (n_azimuths,)
                "distance" - 2D array with dimensions (n_azimuths,n_distance_points)
        src_lon : float
            Longitude of sound source.
        src_lat : float
            Latitude of sound source.
        grid_res : int, optional
            Number of points to use along each axis of a structured lon-lat grid. Grid 
            extents are determined automatically based on the data.
            The default is 500.
        crs : str, optional
            String describing the type of CRS to use. 
            The default is "EPSG:3347" (Statistics Canada Lambert).

        Returns
        -------
        PolarFieldInterpolator object.

        """
        
        # Extract data from Dataset
        azimuth = ds.azimuth.values
        distance = ds.distance.values
        
        # Convert polar data to geographic coordinates
        lon, lat = polar2geo(
            azimuth=np.broadcast_to(azimuth[:, None], distance.shape), 
            distance=distance,
            lon0=np.float32(src_lon),
            lat0=np.float32(src_lat)
        )
        
        # Convert geographic coordinates from the polar data to projected 
        # coordinates on the CRS
        x, y = geo2projected(lon, lat, crs)
        
        ### Group the (x,y) points into an N-by-2 array
        points_original = np.column_stack([
            x.ravel(),
            y.ravel()
        ])
        
        # Create a geographic grid based on the extents of the data
        lon_grid, lat_grid = np.meshgrid(
            np.linspace(lon.min(), lon.max(), num=grid_res),
            np.linspace(lat.min(), lat.max(), num=grid_res)
        )
        self.lon_grid = lon_grid
        self.lat_grid = lat_grid
        
        # Convert the geographic grid into projected coordinates
        x_grid, y_grid = geo2projected(lon_grid, lat_grid, crs)
        
        ### Group the (x,y) points into an N-by-2 array
        points_target = np.column_stack([
            x_grid.ravel(),
            y_grid.ravel()
        ])
        
        # Perform Delaunay triangulation and compute weights
        ### this will assign weights and vertices
        self._precompute_weights(points_original, points_target)
        
    # interpolate .............................................................
    def interpolate(self, da):
        """
        Interpolate values of a compatible DataArray based on precomputed interpolation 
        weights.

        Parameters
        ----------
        da : xarray DataArray
            TL or RL DataArray with compatible coordinate information.

        Returns
        -------
        result : numpy float array
            Array of interpolated TL or RL values.

        """
        
        # Extract and flatten data values
        values = da.values.ravel()
        
        # Interpolate using precalculated weights
        result = np.sum(values[self.vertices] * self.weights, axis=1)
        result = result.reshape(self.lon_grid.shape)
        
        return result
    
    # _precompute_weights .....................................................
    def _precompute_weights(self, points_original, points_target):
        """
        Applies Delaunay triangulation to calculate interpolation weights for a series 
        of unstructured points on a target grid. Results are stored directly as 
        attributes in an instance of this class.
        """
        
        # Perform triangulation
        tri = Delaunay(points_original)
        
        # Find the "simplex", i.e., the index of the triangle that each target 
        # point falls within
        simplex = tri.find_simplex(points_target)
        
        # Create mask to identify those points that do not fall within a 
        # triangle
        outside = simplex < 0
        
        # Find the "simplices", i.e., the vertices of the triangle that each 
        # target point falls within. This produces an M-by-3 matrix where M is 
        # the number of target points.
        simplices = tri.simplices[simplex.clip(min=0)]
        
        # Find barycentric weights for each target point -  i.e., weights 
        # associated with each vertex in the triangle that the point falls 
        # within, where the sum of all three weights = 1. These weights form a 
        # map that indicates where the point is located within its triangle,
        # and thus are also called "barycentric coordinates". This is the 
        # information that is needed for interpolation.
        
        # Scipy stores the matrix needed to compute the weights within the 
        # array "tri.transform". Use matrix multiplication to find the first 
        # two weights ("b"), then get the third by subtracting the sum of those 
        # weights from 1.
        ### Note: clip(min=0) is just there to temporarily ensure there are no 
        ### indexing errors with negative indices. Points with negative 
        ### (invalid) indices will eventually be removed.
        X = tri.transform[simplex.clip(min=0), :2]
        Y = points_target - tri.transform[simplex.clip(min=0), 2]
        b = np.einsum("ijk,ik->ij", X, Y)
        weights = np.c_[b, 1 - b.sum(axis=1)]
        
        # Set weights for all points outside the triangle network to NaN
        weights[outside] = np.nan
        
        # Assign attributes
        self.vertices = simplices
        self.weights = weights
        

# append geocoordinates -------------------------------------------------------
### DEFUNCT, but keep for reference
def append_geocoordinates(ds, tl_model_params):
    """
    Adds longitude and latitude as new coordinates to a polar TL Dataset.

    Parameters
    ----------
    ds : xarray Dataset
        Dataset of TL data with azimuth and distance as coordinates.
    tl_model_params : TLModelParams object
        TLModelParams.

    Returns
    -------
    ds : xarray Dataset
        TL Dataset with longitude and latitude added as coordinates.

    """
    
    ds = ds.copy()
    
    # Get expanded array of azimuths with dimensions n_azimuths, n_distances
    azimuths_broadcast = np.transpose(np.broadcast_to(ds.azimuth.values, np.transpose(ds.distance.values).shape))
    
    # Calculate lon and lat
    lon, lat = polar2geo(
        azimuth=azimuths_broadcast, 
        distance=ds.distance.values,
        lon0=np.float32(tl_model_params.src_lon),
        lat0=np.float32(tl_model_params.src_lat)
    )
    
    # Add lon and lat to Dataset
    ds = ds.assign_coords(
        longitude=(("azimuth", "distance"), lon),
        latitude=(("azimuth", "distance"), lat)
    )
    
    return ds
    

# polar2geo -------------------------------------------------------------------
def polar2geo(azimuth, distance, lon0, lat0):
    """
    Converts polar data points given by (azimuth_deg, distance_m) to lat and lon given a
    source location.

    Parameters
    ----------
    azimuth : numpy array
        Array of azimuth values in degrees.
    distance : numpy float array
        Array of distance values in metres.
    lon0 : float
        Longitude of source.
    lat0 : float
        Latitude of source.

    Returns
    -------
    lon : numpy float array
        Array of longitude values.
    lat : numpy float array
        Array of latitude values.

    """
    
    # get WGS84 ellipsoid object
    geod = Geod(ellps="WGS84")
    
    # convert coordinates using the forward method
    lon, lat, back_azimuth = geod.fwd(
        np.full(distance.shape, lon0), 
        np.full(distance.shape, lat0),
        azimuth,
        distance
    )
    
    return lon, lat


# geo2projected ---------------------------------------------------------------
def geo2projected(lon, lat, crs):
    """
    Converts Longitude and Latitude coordinates into projected coordinates on a 
    Coordinate Reference System (CRS).

    Parameters
    ----------
    lon : Array-like
        Array of longitudes.
    lat : Array-like
        Array of latitudes.
    crs : str
        String describing the CRS to project to.

    Returns
    -------
    x : Array-like
        Array of projected x values on the specified CRS.
    y : Array-like
        Array of projected y values on the specified CRS.

    """
    
    # Create pyproj Transformer object
    transformer = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
    
    # Apply transformation
    x, y = transformer.transform(lon, lat)
    
    return x, y
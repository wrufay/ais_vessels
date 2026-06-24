# June 23 2026

. in the netcdf file, we need to convert the x,y in netcdf file to longituder and latitude: you likely will need these information in netcdf file to make correct conversion :
bathymetry:grid_mapping = "spatial_ref" ;
        int band(band) ;
        int spatial_ref ;
                spatial_ref:crs_wkt = "PROJCS[\"unknown\",GEOGCS[\"WGS 84\",DATUM[\"WGS_1984\",SPHEROID[\"WGS 84\",6378137,298.257223563,AUTHORITY[\"EPSG\",\"7030\"]],AUTHORITY[\"EPSG\",\"6326\"]],PRIMEM[\"Greenwich\",0],UNIT[\"degree\",0.0174532925199433,AUTHORITY[\"EPSG\",\"9122\"]],AUTHORITY[\"EPSG\",\"4326\"]],PROJECTION[\"Lambert_Conformal_Conic_2SP\"],PARAMETER[\"latitude_of_origin\",46],PARAMETER[\"central_meridian\",-60],PARAMETER[\"standard_parallel_1\",48],PARAMETER[\"standard_parallel_2\",52],PARAMETER[\"false_easting\",0],PARAMETER[\"false_northing\",0],UNIT[\"metre\",1,AUTHORITY[\"EPSG\",\"9001\"]],AXIS[\"Easting\",EAST],AXIS[\"Northing\",NORTH]]" ;
                spatial_ref:semi_major_axis = 6378137. ;
                spatial_ref:semi_minor_axis = 6356752.31424518 ;
                spatial_ref:inverse_flattening = 298.257223563 ;
                spatial_ref:reference_ellipsoid_name = "WGS 84" ;
                spatial_ref:longitude_of_prime_meridian = 0. ;
                spatial_ref:prime_meridian_name = "Greenwich" ;
                spatial_ref:geographic_crs_name = "WGS 84" ;
                spatial_ref:horizontal_datum_name = "World Geodetic System 1984" ;
                spatial_ref:projected_crs_name = "unknown" ;
                spatial_ref:grid_mapping_name = "lambert_conformal_conic" ;
                spatial_ref:standard_parallel = 48., 52. ;
                spatial_ref:latitude_of_projection_origin = 46. ;
                spatial_ref:longitude_of_central_meridian = -60. ;
                spatial_ref:false_easting = 0. ;
                spatial_ref:false_northing = 0. ;
                spatial_ref:spatial_ref = "PROJCS[\"unknown\",GEOGCS[\"WGS 84\",DATUM[\"WGS_1984\",SPHEROID[\"WGS 84\",6378137,298.257223563,AUTHORITY[\"EPSG\",\"7030\"]],AUTHORITY[\"EPSG\",\"6326\"]],PRIMEM[\"Greenwich\",0],UNIT[\"degree\",0.0174532925199433,AUTHORITY[\"EPSG\",\"9122\"]],AUTHORITY[\"EPSG\",\"4326\"]],PROJECTION[\"Lambert_Conformal_Conic_2SP\"],PARAMETER[\"latitude_of_origin\",46],PARAMETER[\"central_meridian\",-60],PARAMETER[\"standard_parallel_1\",48],PARAMETER[\"standard_parallel_2\",52],PARAMETER[\"false_easting\",0],PARAMETER[\"false_northing\",0],UNIT[\"metre\",1,AUTHORITY[\"EPSG\",\"9001\"]],AXIS[\"Easting\",EAST],AXIS[\"Northing\",NORTH]]" ;
                spatial_ref:GeoTransform = "-679500.0 100.0 0.0 1693200.0 0.0 -100.0" ;




                
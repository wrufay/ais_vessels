# June 16


### Notes, things to try

- Try MapLibre GL vector tiles on a separate branch (currently using OpenLayers + Esri Ocean raster tiles) — faster pan/zoom, smaller downloads

- Put the hard-coded WEA and CHA inside a database instead of in the frontend

- Allow users to upload their own shapefiles - need to import shpjs to process to geoJSON (currently manual and hard coded) in the frontend (DONE)

- Would definitely need to include error handling, since user is uploading things

- Perhaps allow renaming your own uploaded shapefile (thinking about user auth and stuff again lol)

- Mooring data: work with the time ranges again. Right now thinking they could change state to be synced with the vessel time range, currently did that but make sure it's working as expected.

- Crashes when you click the moorings. Also the add by CSV feature is untested
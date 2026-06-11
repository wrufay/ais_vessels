Thursday, June 11th

- Currently trying to determine if it is worth migrating to use PostGIS instead of Shapely to generate the plots based on the shapefiles.
- Time the current script: Generated all four plots for the Sydney Bight region in ~3 seconds using the *time* command
- Also going to time how long it takes when using PostGIS (might be more efficient for seeing large regions.)
- Made a backup of pgdata just in case it gets touched during PostGIS setup


## Notes - commands
Stop the container:

**sg docker -c "docker compose down"**


Start Docker back up - takes a few minutes, new image is larger than the previous one

**sg docker -c "docker compose up -d"**


Access the site locally here

http://142.2.83.73

Check if PostGIS is available

**sg docker -c "docker exec ocean_noise_visualizer-db-1 psql -U postgres -d ais -c 'SELECT * FROM pg_available_extensions WHERE name = '"'"'postgis'"'"';'"**


Rebuild frontend

**sg docker -c "docker compose up --build frontend -d"**



- Some issues with PostGIS installation, would need to reingest all the data again to build the new image. Going to stick with Shapely for now, 3 seconds to generate the plot is good enough for a prototype

- Tested, put the output inside analysis/region_test.json

Using the *time* command:

real    0m0.704s

user    0m0.035s

sys     0m0.031s

Meaning it took 0.7 seconds to get the API response, 16k positions filtered through Shapely


### Frontend changes
- First test: Encountered errors
- Second test: Draw a polygon and analyze the region is working. Took more than 10 seconds, large region drawn and just shows some analysis of the number of vessels and the types in that region. + Add time it took into the UI, work to generate plots server-side by adapting the existing Sydney Bight analysis script, show the plots in the UI perhaps in a modal for now.
- Now working. For real use, we'd probably preload WEA polygons as shapefiles or coordinates even? And query them which would be much more accurate than drawing regions on the map. PostGIS would help a lot here!!!

- Going to work on frontend clean-up next, make it presentable, responsive and maybe even faster/easier to use
- Also need to allow show ALL the traffic in a certain region after drawing them.
- Could also generate as a heatmap instead of showing individual tracks. Just an idea.
- My UX idea: draw a region → sidebar filters to only vessels inside that region → user can select individual vessels or show all, colored by vessel type. Build all options and see what's actually useful 
- Prompted Claude to refactor the UI, much better UX now. Going to continue tweaking this

- I think being able to save a history of regions analyzed and starred vessels, tracks etc could be very useful.


## Next things to do
- Write detailed setup instructions
- Add option of showing the start to end from one track
- Add Critical Habitat Area (CHA), Roseway Basin, Grand Manan Basin
- Add mooring locations of for year from 2019 to 2023
- Add an option to load in these information from a csv file. See attached file for mooring location and time of deployment
- Functions to add (working on right now) run statistics within a certain geographical area, selected on the map (perhaps also be able to upload shapefiles)


## How I'm thinking about tackling these
- All of this is really one direction -> go from drawing rough boxes to analyzing real defined zones, against where the hydrophones actually were. That's the actual noise question.

- Real regions (CHA, Roseway, Grand Manan) + shapefile upload are basically the same feature. The backend already takes a GeoJSON polygon, so predefined zones is mostly: get the real coords -> ship them as GeoJSON the frontend loads -> toggle them on the map -> click to run the analysis we already built. Roseway + Grand Manan are SARA right whale critical habitats, official shapefiles exist on DFO/Open Canada. Hard part is getting accurate boundaries, not the code. Decision: support real .shp (geopandas) or just GeoJSON and convert offline?

- Moorings + CSV loader go together. Plot the hydrophone points from the CSV (lat/lon/name/deploy dates), filter by year. This is the noise half -> overlay where we were listening on top of who was passing. Decision: server reads a known CSV (simpler, better for non-technical users) vs upload in browser. Start server side.

- Start/end markers on a track is a quick win, Jinshan asked for it too. ~1hr of frontend.

- Order I'm thinking: predefined regions first (most value, cheapest, reuses everything), then moorings, then shapefile upload as the power user version. Start/end markers whenever.

- BIG thing to flag: moorings are 2019-2023 and habitat analysis needs multi-year traffic, but we've only ingested August 2025 so far. All of this looks empty until there's years of data in the db, and at ~7h/month over SSHFS that's a long ingestion runway. Need to decide next push = features or data volume.


## Roseway Basin coordinates
From Transport Canada Ship Safety Bulletin SSB No. 04/2025 (confirmed by Jinshan). This is a seasonal Area to be Avoided for vessels 300GT+ from June 1 to Dec 31, to protect North Atlantic right whales.

43° 16' N, 064° 55' W
42° 47' N, 064° 59' W
42° 39' N, 065° 31' W
42° 52' N, 066° 05' W

In decimal degrees:
43.2667, -64.9167
42.7833, -64.9833
42.6500, -65.5167
42.8667, -66.0833

Plan: hardcode as a GeoJSON polygon overlay on the map. Always visible as a labeled boundary. Eventually clickable to trigger region analysis. Still waiting on Jinshan to confirm if he also wants stats triggered.


## Grand Manan Basin coordinates
7-point polygon, Bay of Fundy. Also a critical habitat for North Atlantic right whales.

1  44° 49' N, 66° 27' W  →  44.8167, -66.4500
2  44° 47' N, 66° 17' W  →  44.7833, -66.2833
3  44° 40' N, 66° 17' W  →  44.6667, -66.2833
4  44° 33' N, 66° 22' W  →  44.5500, -66.3667
5  44° 29' N, 66° 30' W  →  44.4833, -66.5000
6  44° 29' N, 66° 37' W  →  44.4833, -66.6167
7  44° 42' N, 66° 37' W  →  44.7000, -66.6167

Both Roseway + Grand Manan are now ready to hardcode as overlays. Waiting on CHA boundary if separate.
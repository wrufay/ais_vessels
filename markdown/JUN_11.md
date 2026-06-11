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

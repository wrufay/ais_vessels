# Ocean Noise Data Visualization Webpage

### Current stack:
Python3
Frontend: React.js
Backend: FastAPI
OpenLayers to display map


### Potential features
- Interactive map using OpenLayers
- Real noise data that the /api/noise endpoint will return
- Way to run the acoustic model
    - Requires a form for users to set parameters, prompts backend to run the model and return the results to display
    - Will need to know WHAT model we are working with, and what a sample output from the model looks like so we can build the backend API around that output.

- Noise visualization on the map; decibel numbers into coloured tiles, with different colours indicating different levels of noise. Using tile pipeline.
- Species impact overlay that shows which maring animals are affected based on the noise levels, for example, coloured zones or dots on the map to display this
- Connect to a real data source like AIDsb for ship positions, bathymetry data for ocean depth, wind farm locations.
- Allow user to save the displayed data in filetype of their choice, like NetCDF.

### May 21, 2026
- Built skeleton for application, with React frontend and FastAPI backend running locally
- To do:
    ✔️ Get OpenLayers map rendering in Map.jsx
    ✔️ Deploy for easy sharing

### Notes
- In README, include local development instructions, and overview of project architecture
- Write documentation as you go
- Deployed on: https://noiseviz.vercel.app
- Backend: https://ocean-viz.up.railway.app




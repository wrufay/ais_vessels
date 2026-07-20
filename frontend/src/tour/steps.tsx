import type { TourStep } from "./types";

export interface TourActions {
  openVesselPanel: () => void;
  openMooringPanel: () => void;
  openRegionPanel: () => void;
  openMapPanel: () => void;
}

/**
 * Centralized tour content. Each entry's `target` key must match a key
 * registered via registerTarget(...) (or one of the special-cased refs) in
 * Map.tsx. Reordering or editing steps only requires touching this file.
 *
 * There's no dedicated "here's the panel" step — the panel-opening onEnter
 * lives on the first content step of each section instead, so the tour goes
 * straight from the icon-bar button to the first real feature inside it.
 */
export function createTourSteps(actions: TourActions): TourStep[] {
  return [
    {
      id: "intro",
      target: null,
      dim: false,
      title: "Welcome",
      body: "Use arrow keys or Next/Back to move around. Press Esc or click X anytime to exit.",
    },

    // --- Vessel Tracks ---
    {
      id: "tracks-button",
      target: "iconTracks",
      title: "Vessel Tracks",
      body: "View individual vessels displayed on the map.",
    },
    {
      id: "tracks-search",
      target: "vesselSearch",
      title: "Date & search",
      body: "Select the date range you want to view vessels from. Use search bar to find a specific MMSI or vessel name.",
      onEnter: actions.openVesselPanel,
    },
    {
      id: "tracks-list",
      target: "vesselList",
      title: "Vessel list",
      body: (
        <>
          <p>
            Scroll through the vessels found in that date range and click on
            one to display its track on the map.
          </p>
          <p className="mt-2">Use FILTER and SORT BY to refine the list.</p>
        </>
      ),
    },
    {
      id: "tracks-size",
      target: "vesselSize",
      title: "Size & opacity",
      body: "Adjust size and opacity of the visible points here, found at the bottom of each corresponding panel.",
    },

    // --- Moorings ---
    {
      id: "moorings-button",
      target: "iconMoorings",
      title: "Moorings",
      body: "View and manage mooring locations on the map.",
    },
    {
      id: "moorings-upload",
      target: "mooringUpload",
      title: "Upload moorings",
      body: "AMAR moorings displayed by default. Download a template CSV file and upload your own to view on the map.",
      onEnter: actions.openMooringPanel,
    },
    {
      id: "moorings-list",
      target: "mooringList",
      title: "Mooring list",
      body: "Moorings in the selected time range will show up here.",
    },

    // --- Regions ---
    {
      id: "regions-button",
      target: "iconRegions",
      title: "Regions",
      body: "Analyze pre-defined and custom-select regions.",
    },
    {
      id: "regions-customize",
      target: "regionCustomize",
      title: "Customize",
      body: "Draw a region on the map or upload a shapefile. These get added to the list, which you can view anytime.",
      onEnter: actions.openRegionPanel,
    },
    {
      id: "regions-list",
      target: "regionList",
      title: "Region list",
      body: "See pre-defined CHA and WEA, plus your own uploaded or drawn regions. Toggle display on the map.",
    },
    {
      id: "regions-analyze",
      target: "iconAnalyseGroup",
      title: "Analyze flow",
      body: "Clicking on the map region selects it, and allows you to analyze the region to view statistics, or see a simplified representation of all the traffic in the region.",
    },

    // --- Map ---
    {
      id: "map-button",
      target: "iconMap",
      title: "Map",
      body: "Switch base map and toggle data overlays.",
    },
    {
      id: "map-layers",
      target: "mapLayers",
      title: "Layers",
      body: "Toggle bathymetry and noise data map layers. Use each one's adjustment feature to customize the overlay.",
      onEnter: actions.openMapPanel,
    },
    {
      id: "map-basemap",
      target: "mapBasemap",
      title: "Base map",
      body: "Change which base map is used.",
    },
  ];
}

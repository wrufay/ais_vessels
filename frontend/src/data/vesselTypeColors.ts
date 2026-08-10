/* Every colour used in the app is stored in one place: colors.json. It's
split into 4 groups. This file just grabs the "vessel" group and makes it
available below as TYPE_COLORS -- the other 3 groups are used directly
inside utils/mapStyles.ts instead. Here's what each group actually changes
if you edit it:

VESSEL COLOURS (cargo, tanker, fishing, passenger, search & rescue, other, unknown)
- The coloured tag next to each vessel's name in the vessel list
- The coloured tags in the "Filter by..." popup
- The bar graphs in the analysis view (the Python file analysis/plots.py
  reads this same colors.json)
- The "Type" button in the all-traffic map view

REGION COLOURS (CHA, WEA, Uploaded, Drawn)
- The outline and fill colour of a region shape on the map, when you
  select, hover over, or click it
- See regionColor() in utils/mapStyles.ts

SPEED COLOURS (fast, mid, slow)
- The speed legend in the bottom-left corner of the map, and the smaller
  copy of it in the side icon bar
- The dots along a vessel's track, coloured by how fast it was going
- The "Speed" button in the all-traffic map view
- The little preview dots next to "Change size" in the vessel tracks panel
- See SPEED_STYLE in utils/mapStyles.ts

TRACK COLOURS (the default grey, plus 8 colours used to tell vessels apart)
- The "Uniform" and "Vessel" buttons in the all-traffic map view
- The preview dot next to "Change size" in the all-traffic panel
- See TRACK_DEFAULT_COLOR and VESSEL_PALETTE in utils/mapStyles.ts */

import colors from "./colors.json";

export const TYPE_COLORS: Record<string, string> = colors.vessel;

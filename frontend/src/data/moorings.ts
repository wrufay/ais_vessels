// AMAR (acoustic recorder) mooring deployment records. Custom object — not
// a standard geospatial format like the region files, just a plain shape
// made up for this app.

// To add a new mooring: copy one of the lines below, change the values, and
// add a comma. Keep the same fields — name, lat, lon, depth, deployment,
// recovery. Dates must be "YYYY-MM-DD" in quotes. Latitude/longitude are
// decimal degrees (not degrees-minutes-seconds).

export interface Mooring {
  name: string;
  lat: number;
  lon: number;
  depth: number;
  deployment: string;
  recovery: string;
}

export const AMAR_MOORINGS: Mooring[] = [
  { name: "201804ROB",  lat: 43.0026, lon: -65.5653, depth: 101, deployment: "2018-04-30", recovery: "2018-09-16" },
  { name: "201805EMBS", lat: 43.4976, lon: -62.8700, depth: 98,  deployment: "2018-05-01", recovery: "2018-09-23" },
  { name: "201809ROB",  lat: 43.0014, lon: -65.5660, depth: 119, deployment: "2018-09-16", recovery: "2019-10-07" },
  { name: "201809EMBS", lat: 43.4973, lon: -62.8699, depth: 120, deployment: "2018-09-23", recovery: "2019-10-06" },
  { name: "201809GMB",  lat: 44.6925, lon: -66.5311, depth: 175, deployment: "2018-09-21", recovery: "2019-04-08" },
  { name: "201904GMB",  lat: 44.6916, lon: -66.5299, depth: 179, deployment: "2019-04-08", recovery: "2019-11-07" },
  { name: "201904JOBW", lat: 43.3001, lon: -67.4999, depth: 179, deployment: "2019-04-09", recovery: "2019-10-07" },
  { name: "201910ROB",  lat: 43.0014, lon: -65.5648, depth: 105, deployment: "2019-10-07", recovery: "2020-08-31" },
  { name: "201910EMBS", lat: 43.4966, lon: -62.8694, depth: 96,  deployment: "2019-10-06", recovery: "2020-09-07" },
  { name: "201910JOBW", lat: 43.3025, lon: -67.4990, depth: 173, deployment: "2019-10-07", recovery: "2020-09-01" },
  { name: "202008ROB",  lat: 42.9996, lon: -65.5673, depth: 98,  deployment: "2020-08-31", recovery: "2021-08-19" },
  { name: "202009EMBS", lat: 43.4966, lon: -62.8696, depth: 98,  deployment: "2020-09-07", recovery: "2021-08-26" },
  { name: "202009GMB",  lat: 44.6965, lon: -66.5306, depth: 170, deployment: "2020-09-01", recovery: "2021-04-11" },
  { name: "202009JOBW", lat: 43.3031, lon: -67.4991, depth: 184, deployment: "2020-09-01", recovery: "2021-08-22" },
  { name: "202104GMB",  lat: 44.6995, lon: -66.5300, depth: 173, deployment: "2021-04-11", recovery: "2021-08-23" },
  { name: "202108EMBD", lat: 43.6085, lon: -62.8686, depth: 179, deployment: "2021-08-26", recovery: "2022-09-13" },
  { name: "202108GMB",  lat: 44.6923, lon: -66.5314, depth: 172, deployment: "2021-08-23", recovery: "2022-10-03" },
];

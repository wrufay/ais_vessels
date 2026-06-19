import { useEffect, useRef, useState } from "react";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import XYZ from "ol/source/XYZ";

import { fromLonLat } from "ol/proj";
import Feature, { type FeatureLike } from "ol/Feature";
import LineString from "ol/geom/LineString";
import Point from "ol/geom/Point";
import OLPolygon from "ol/geom/Polygon";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Style, Stroke, Circle as CircleStyle, Fill } from "ol/style";
import Draw from "ol/interaction/Draw";
import GeoJSON from "ol/format/GeoJSON";
import shp from "shpjs";
import "ol/ol.css";

const API = import.meta.env.VITE_API_URL ?? "";

// ---- Preset Regions ----
interface PresetRegion {
  name: string;
  geojson: object;
}

const CHA_REGIONS: PresetRegion[] = [
  {
    name: "Roseway Basin",
    geojson: {
      type: "Polygon",
      coordinates: [
        [
          [-64.9167, 43.2667],
          [-64.9833, 42.7833],
          [-65.5167, 42.65],
          [-66.0833, 42.8667],
          [-64.9167, 43.2667],
        ],
      ],
    },
  },
  {
    name: "Grand Manan Basin",
    geojson: {
      type: "Polygon",
      coordinates: [
        [
          [-66.45, 44.8167],
          [-66.2833, 44.7833],
          [-66.2833, 44.6667],
          [-66.3667, 44.55],
          [-66.5, 44.4833],
          [-66.6167, 44.4833],
          [-66.6167, 44.7],
          [-66.45, 44.8167],
        ],
      ],
    },
  },
];

const WEA_REGIONS: PresetRegion[] = [
  {
    name: "French Bank",
    geojson: {
      type: "Polygon",
      coordinates: [[[-61.75,44.4167],[-61.75,44.4333],[-61.775,44.4333],[-61.8,44.4333],[-61.8,44.45],[-61.825,44.45],[-61.825,44.4667],[-61.85,44.4667],[-61.85,44.4833],[-61.85,44.5],[-61.875,44.5],[-61.875,44.5167],[-61.875,44.5333],[-61.9,44.5333],[-61.9,44.55],[-61.925,44.55],[-61.925,44.5667],[-61.95,44.5667],[-61.95,44.5833],[-61.975,44.5833],[-62.0,44.5833],[-62.0,44.6],[-62.0,44.6167],[-62.0,44.6333],[-61.975,44.6333],[-61.975,44.65],[-61.95,44.65],[-61.925,44.65],[-61.9,44.65],[-61.9,44.6667],[-61.875,44.6667],[-61.85,44.6667],[-61.825,44.6667],[-61.825,44.6833],[-61.8,44.6833],[-61.8,44.7],[-61.775,44.7],[-61.775,44.7167],[-61.75,44.7167],[-61.75,44.7333],[-61.75,44.75],[-61.75,44.7667],[-61.75,44.7833],[-61.75,44.8],[-61.725,44.8],[-61.725,44.8167],[-61.725,44.8333],[-61.725,44.85],[-61.7,44.85],[-61.7,44.8667],[-61.675,44.8667],[-61.65,44.8667],[-61.625,44.8667],[-61.6,44.8667],[-61.575,44.8667],[-61.55,44.8667],[-61.55,44.8833],[-61.525,44.8833],[-61.5,44.8833],[-61.5,44.9],[-61.475,44.9],[-61.475,44.9167],[-61.45,44.9167],[-61.425,44.9167],[-61.425,44.9333],[-61.4,44.9333],[-61.4,44.95],[-61.375,44.95],[-61.35,44.95],[-61.35,44.9667],[-61.325,44.9667],[-61.325,44.9833],[-61.3,44.9833],[-61.275,44.9833],[-61.275,45.0],[-61.25,45.0],[-61.225,45.0],[-61.225,44.9833],[-61.2,44.9833],[-61.2,44.9667],[-61.2,44.95],[-61.175,44.95],[-61.175,44.9333],[-61.175,44.9167],[-61.15,44.9167],[-61.125,44.9167],[-61.125,44.9],[-61.1,44.9],[-61.1,44.8833],[-61.075,44.8833],[-61.075,44.8667],[-61.05,44.8667],[-61.05,44.85],[-61.05,44.8333],[-61.05,44.8167],[-61.05,44.8],[-61.05,44.7833],[-61.05,44.7667],[-61.075,44.7667],[-61.075,44.75],[-61.075,44.7333],[-61.075,44.7167],[-61.1,44.7167],[-61.1,44.7],[-61.1,44.6833],[-61.125,44.6833],[-61.125,44.6667],[-61.125,44.65],[-61.15,44.65],[-61.15,44.6333],[-61.15,44.6167],[-61.175,44.6167],[-61.175,44.6],[-61.15,44.6],[-61.15,44.5833],[-61.15,44.5667],[-61.15,44.55],[-61.125,44.55],[-61.125,44.5333],[-61.1,44.5333],[-61.1,44.5167],[-61.1,44.5],[-61.1,44.4833],[-61.125,44.4833],[-61.125,44.4667],[-61.15,44.4667],[-61.15,44.45],[-61.175,44.45],[-61.2,44.45],[-61.225,44.45],[-61.225,44.4333],[-61.25,44.4333],[-61.275,44.4333],[-61.3,44.4333],[-61.3,44.4167],[-61.325,44.4167],[-61.35,44.4167],[-61.375,44.4167],[-61.4,44.4167],[-61.425,44.4167],[-61.45,44.4167],[-61.45,44.4333],[-61.475,44.4333],[-61.5,44.4333],[-61.525,44.4333],[-61.55,44.4333],[-61.575,44.4333],[-61.575,44.4167],[-61.6,44.4167],[-61.625,44.4167],[-61.65,44.4167],[-61.675,44.4167],[-61.7,44.4167],[-61.725,44.4167],[-61.75,44.4167]]],
    },
  },
  {
    name: "Middle Bank",
    geojson: {
      type: "Polygon",
      coordinates: [[[-60.375,44.3167],[-60.375,44.3333],[-60.4,44.3333],[-60.4,44.35],[-60.425,44.35],[-60.45,44.35],[-60.475,44.35],[-60.5,44.35],[-60.525,44.35],[-60.55,44.35],[-60.575,44.35],[-60.575,44.3667],[-60.6,44.3667],[-60.625,44.3667],[-60.65,44.3667],[-60.675,44.3667],[-60.7,44.3667],[-60.725,44.3667],[-60.75,44.3667],[-60.775,44.3667],[-60.775,44.3833],[-60.8,44.3833],[-60.825,44.3833],[-60.85,44.3833],[-60.875,44.3833],[-60.875,44.4],[-60.9,44.4],[-60.9,44.4167],[-60.925,44.4167],[-60.95,44.4167],[-60.95,44.4333],[-60.975,44.4333],[-61.0,44.4333],[-61.025,44.4333],[-61.025,44.45],[-61.025,44.4667],[-61.025,44.4833],[-61.025,44.5],[-61.025,44.5167],[-61.025,44.5333],[-61.025,44.55],[-61.025,44.5667],[-61.025,44.5833],[-61.0,44.5833],[-61.0,44.6],[-61.0,44.6167],[-61.0,44.6333],[-60.975,44.6333],[-60.975,44.65],[-60.95,44.65],[-60.95,44.6667],[-60.925,44.6667],[-60.925,44.6833],[-60.925,44.7],[-60.9,44.7],[-60.875,44.7],[-60.85,44.7],[-60.85,44.7167],[-60.825,44.7167],[-60.8,44.7167],[-60.775,44.7167],[-60.75,44.7167],[-60.725,44.7167],[-60.7,44.7167],[-60.675,44.7167],[-60.675,44.7333],[-60.65,44.7333],[-60.625,44.7333],[-60.625,44.75],[-60.6,44.75],[-60.575,44.75],[-60.55,44.75],[-60.525,44.75],[-60.5,44.75],[-60.475,44.75],[-60.45,44.75],[-60.425,44.75],[-60.4,44.75],[-60.375,44.75],[-60.375,44.7333],[-60.375,44.7167],[-60.375,44.7],[-60.375,44.6833],[-60.375,44.6667],[-60.375,44.65],[-60.375,44.6333],[-60.35,44.6333],[-60.325,44.6333],[-60.3,44.6333],[-60.275,44.6333],[-60.25,44.6333],[-60.25,44.6167],[-60.25,44.6],[-60.25,44.5833],[-60.25,44.5667],[-60.25,44.55],[-60.25,44.5333],[-60.25,44.5167],[-60.25,44.5],[-60.25,44.4833],[-60.25,44.4667],[-60.25,44.45],[-60.25,44.4333],[-60.25,44.4167],[-60.25,44.4],[-60.25,44.3833],[-60.25,44.3667],[-60.25,44.35],[-60.275,44.35],[-60.275,44.3333],[-60.3,44.3333],[-60.3,44.3167],[-60.325,44.3167],[-60.35,44.3167],[-60.375,44.3167]]],
    },
  },
  {
    name: "Sable Island Bank",
    geojson: {
      type: "Polygon",
      coordinates: [[[-61.45,43.4667],[-61.45,43.4833],[-61.475,43.4833],[-61.475,43.5],[-61.475,43.5167],[-61.5,43.5167],[-61.5,43.5333],[-61.5,43.55],[-61.5,43.5667],[-61.525,43.5667],[-61.525,43.5833],[-61.525,43.6],[-61.525,43.6167],[-61.525,43.6333],[-61.525,43.65],[-61.525,43.6667],[-61.525,43.6833],[-61.525,43.7],[-61.525,43.7167],[-61.525,43.7333],[-61.525,43.75],[-61.525,43.7667],[-61.5,43.7667],[-61.5,43.7833],[-61.5,43.8],[-61.5,43.8167],[-61.5,43.8333],[-61.475,43.8333],[-61.475,43.85],[-61.475,43.8667],[-61.45,43.8667],[-61.45,43.8833],[-61.45,43.9],[-61.425,43.9],[-61.4,43.9],[-61.4,43.9167],[-61.375,43.9167],[-61.35,43.9167],[-61.35,43.9333],[-61.325,43.9333],[-61.325,43.95],[-61.3,43.95],[-61.3,43.9667],[-61.275,43.9667],[-61.275,43.9833],[-61.275,44.0],[-61.25,44.0],[-61.25,44.0167],[-61.25,44.0333],[-61.25,44.05],[-61.25,44.0667],[-61.225,44.0667],[-61.225,44.0833],[-61.225,44.1],[-61.2,44.1],[-61.2,44.1167],[-61.2,44.1333],[-61.175,44.1333],[-61.175,44.15],[-61.15,44.15],[-61.15,44.1667],[-61.15,44.1833],[-61.125,44.1833],[-61.125,44.2],[-61.125,44.2167],[-61.1,44.2167],[-61.075,44.2167],[-61.075,44.2333],[-61.05,44.2333],[-61.05,44.25],[-61.025,44.25],[-61.0,44.25],[-60.975,44.25],[-60.95,44.25],[-60.925,44.25],[-60.9,44.25],[-60.875,44.25],[-60.85,44.25],[-60.825,44.25],[-60.8,44.25],[-60.8,44.2333],[-60.775,44.2333],[-60.775,44.2167],[-60.75,44.2167],[-60.725,44.2167],[-60.725,44.2],[-60.7,44.2],[-60.7,44.1833],[-60.675,44.1833],[-60.675,44.1667],[-60.65,44.1667],[-60.625,44.1667],[-60.625,44.15],[-60.6,44.15],[-60.6,44.1333],[-60.575,44.1333],[-60.55,44.1333],[-60.525,44.1333],[-60.525,44.1167],[-60.5,44.1167],[-60.475,44.1167],[-60.45,44.1167],[-60.45,44.1],[-60.475,44.1],[-60.475,44.0833],[-60.475,44.0667],[-60.475,44.05],[-60.5,44.05],[-60.5,44.0333],[-60.5,44.0167],[-60.5,44.0],[-60.5,43.9833],[-60.5,43.9667],[-60.5,43.95],[-60.5,43.9333],[-60.5,43.9167],[-60.5,43.9],[-60.475,43.9],[-60.475,43.8833],[-60.475,43.8667],[-60.45,43.8667],[-60.45,43.85],[-60.45,43.8333],[-60.425,43.8333],[-60.425,43.8167],[-60.4,43.8167],[-60.4,43.8],[-60.375,43.8],[-60.375,43.7833],[-60.35,43.7833],[-60.35,43.7667],[-60.325,43.7667],[-60.3,43.7667],[-60.3,43.75],[-60.275,43.75],[-60.275,43.7333],[-60.25,43.7333],[-60.225,43.7333],[-60.225,43.7167],[-60.225,43.7],[-60.225,43.6833],[-60.25,43.6833],[-60.25,43.6667],[-60.25,43.65],[-60.275,43.65],[-60.3,43.65],[-60.3,43.6333],[-60.325,43.6333],[-60.35,43.6333],[-60.35,43.6167],[-60.375,43.6167],[-60.4,43.6167],[-60.425,43.6167],[-60.425,43.6],[-60.45,43.6],[-60.475,43.6],[-60.475,43.5833],[-60.5,43.5833],[-60.525,43.5833],[-60.55,43.5833],[-60.55,43.5667],[-60.575,43.5667],[-60.6,43.5667],[-60.625,43.5667],[-60.65,43.5667],[-60.675,43.5667],[-60.7,43.5667],[-60.7,43.55],[-60.725,43.55],[-60.75,43.55],[-60.775,43.55],[-60.8,43.55],[-60.825,43.55],[-60.85,43.55],[-60.875,43.55],[-60.9,43.55],[-60.925,43.55],[-60.925,43.5333],[-60.95,43.5333],[-60.975,43.5333],[-61.0,43.5333],[-61.025,43.5333],[-61.05,43.5333],[-61.05,43.5167],[-61.075,43.5167],[-61.1,43.5167],[-61.125,43.5167],[-61.15,43.5167],[-61.175,43.5167],[-61.175,43.5],[-61.2,43.5],[-61.225,43.5],[-61.225,43.4833],[-61.25,43.4833],[-61.275,43.4833],[-61.275,43.4667],[-61.3,43.4667],[-61.325,43.4667],[-61.35,43.4667],[-61.375,43.4667],[-61.4,43.4667],[-61.425,43.4667],[-61.45,43.4667]]],
    },
  },
  {
    name: "Sydney Bight",
    geojson: {
      type: "Polygon",
      coordinates: [[[-59.625,46.3833],[-59.625,46.4],[-59.65,46.4],[-59.675,46.4],[-59.675,46.4167],[-59.7,46.4167],[-59.725,46.4167],[-59.75,46.4167],[-59.775,46.4167],[-59.8,46.4167],[-59.8,46.4333],[-59.825,46.4333],[-59.85,46.4333],[-59.85,46.45],[-59.875,46.45],[-59.875,46.4667],[-59.9,46.4667],[-59.925,46.4667],[-59.95,46.4667],[-59.95,46.4833],[-59.975,46.4833],[-60.0,46.4833],[-60.025,46.4833],[-60.025,46.5],[-60.05,46.5],[-60.05,46.5167],[-60.025,46.5167],[-60.025,46.5333],[-60.025,46.55],[-60.025,46.5667],[-60.025,46.5833],[-60.025,46.6],[-60.0,46.6],[-60.0,46.6167],[-60.0,46.6333],[-60.0,46.65],[-60.0,46.6667],[-60.0,46.6833],[-60.0,46.7],[-59.975,46.7],[-59.975,46.7167],[-59.975,46.7333],[-59.95,46.7333],[-59.95,46.75],[-59.925,46.75],[-59.925,46.7667],[-59.9,46.7667],[-59.9,46.7833],[-59.875,46.7833],[-59.85,46.7833],[-59.825,46.7833],[-59.8,46.7833],[-59.8,46.7667],[-59.775,46.7667],[-59.75,46.7667],[-59.75,46.75],[-59.725,46.75],[-59.725,46.7333],[-59.7,46.7333],[-59.675,46.7333],[-59.675,46.7167],[-59.65,46.7167],[-59.65,46.7],[-59.625,46.7],[-59.625,46.6833],[-59.625,46.6667],[-59.6,46.6667],[-59.6,46.65],[-59.575,46.65],[-59.575,46.6333],[-59.55,46.6333],[-59.55,46.6167],[-59.55,46.6],[-59.525,46.6],[-59.525,46.5833],[-59.5,46.5833],[-59.5,46.5667],[-59.475,46.5667],[-59.475,46.55],[-59.45,46.55],[-59.45,46.5333],[-59.45,46.5167],[-59.45,46.5],[-59.45,46.4833],[-59.475,46.4833],[-59.475,46.4667],[-59.5,46.4667],[-59.5,46.45],[-59.525,46.45],[-59.525,46.4333],[-59.55,46.4333],[-59.55,46.4167],[-59.575,46.4167],[-59.575,46.4],[-59.6,46.4],[-59.6,46.3833],[-59.625,46.3833]]],
    },
  },
];

interface Vessel {
  mmsi: number;
  vessel_name: string | null;
  ship_type: string | number | null;
  source: string;
}

interface RoutePoint {
  time: number;
  latitude: number;
  longitude: number;
  sog: number | null;
  cog: number | null;
  source: string;
}

interface RegionStats {
  total_positions: number;
  unique_vessels: number;
  days: { date: string; vessel_counts: Record<string, number> }[];
  plots: { vessel_types?: string; speed_overall?: string; vessel_density?: string };
}

const TYPE_COLORS: Record<string, string> = {
  cargo: "#ee6c4d",
  tanker: "#3d5a80",
  fishing: "#639fab",
  passenger: "#293241",
  "search & rescue": "#e0fbfc",
  other: "#afa98d",
  unknown: "#cbd2d9",
};

function classifyType(code: string | number | null): string {
  const c = typeof code === "number" ? code : parseInt(String(code ?? ""), 10);
  if (Number.isNaN(c))
    return String(code ?? "").trim() ? String(code).toLowerCase() : "unknown";
  if (c >= 70 && c < 80) return "cargo";
  if (c >= 80 && c < 90) return "tanker";
  if (c === 30) return "fishing";
  if (c >= 60 && c < 70) return "passenger";
  if (c === 51) return "search & rescue";
  if (
    (c >= 20 && c < 30) ||
    (c >= 31 && c < 51) ||
    (c >= 52 && c < 60) ||
    (c >= 90 && c < 100)
  )
    return "other";
  return "unknown";
}

function formatTime(epochSeconds: number): string {
  return (
    new Date(epochSeconds * 1000).toISOString().replace("T", " ").slice(0, 19) +
    " UTC"
  );
}

function makeFeatureStyle(showStart: boolean, showEnd: boolean) {
  return function (feature: FeatureLike): Style {
    const geomType = feature.getGeometry()?.getType();
    if (geomType === "LineString") {
      // can change the colour of connecting line here (currently powder blue)
      return new Style({ stroke: new Stroke({ color: "#98c1d9", width: 2 }) });
    }
    const isStart = feature.get("isStart") as boolean;
    const isEnd = feature.get("isEnd") as boolean;
    if (isStart && !showStart) return new Style({});
    if (isEnd && !showEnd) return new Style({});
    if (isStart) {
      return new Style({
        image: new CircleStyle({
          radius: 7,
          fill: new Fill({ color: "#98c1d9" }),
          stroke: new Stroke({ color: "#fff", width: 2.5 }),
        }),
      });
    }
    if (isEnd) {
      return new Style({
        image: new CircleStyle({
          radius: 7,
          fill: new Fill({ color: "#ee6c4d" }),
          stroke: new Stroke({ color: "#fff", width: 2.5 }),
        }),
      });
    }
    const sog = (feature.get("sog") as number) || 0;
    const color = sog > 10 ? "#ee6c4d" : sog > 3 ? "#ffc857" : "#0a8754";
    return new Style({
      image: new CircleStyle({ radius: 4, fill: new Fill({ color }) }),
    });
  };
}

function regionColor(type: string) {
  if (type === "WEA") return { stroke: "#ee6c4d", fill: "rgba(238,108,77,0.07)", hoverFill: "rgba(238,108,77,0.15)" };
  if (type === "Uploaded") return { stroke: "#9b59b6", fill: "rgba(155,89,182,0.07)", hoverFill: "rgba(155,89,182,0.15)" };
  return { stroke: "#3d5a80", fill: "rgba(61,90,128,0.07)", hoverFill: "rgba(61,90,128,0.15)" };
}

function chaStyle(feature: FeatureLike): Style {
  const c = regionColor(feature.get("regionType") as string);
  return new Style({
    stroke: new Stroke({ color: c.stroke, width: 2 }),
    fill: new Fill({ color: c.fill }),
  });
}

function chaHoverStyle(feature: FeatureLike): Style {
  const c = regionColor(feature.get("regionType") as string);
  return new Style({
    stroke: new Stroke({ color: c.stroke, width: 2.5 }),
    fill: new Fill({ color: c.hoverFill }),
  });
}

// ---- Moorings ----
interface Mooring {
  name: string;
  lat: number;
  lon: number;
  depth: number;
  deployment: string;
  recovery: string;
}

const AMAR_MOORINGS: Mooring[] = [
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

function downloadPlot(b64: string, name: string) {
  const a = document.createElement("a");
  a.href = `data:image/png;base64,${b64}`;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function ShipMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<Map | null>(null);
  const sourceRef = useRef(new VectorSource());
  const drawSourceRef = useRef(new VectorSource());
  const chaSourceRef = useRef(new VectorSource());
  const mooringSourceRef = useRef(new VectorSource());
  const drawRef = useRef<Draw | null>(null);
  const routeLayerRef = useRef<VectorLayer | null>(null);
  const chaLayerRef = useRef<VectorLayer | null>(null);
  const bathyLayerRef = useRef<TileLayer | null>(null);

  interface Popup {
    x: number;
    y: number;
    time: number;
    lat: number;
    lon: number;
    sog: number | null;
    cog: number | null;
    source: string;
    isStart: boolean;
    isEnd: boolean;
  }

  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Vessel | null>(null);
  const [start, setStart] = useState("2025-08-01");
  const [end, setEnd] = useState("2025-08-31");
  const [pointCount, setPointCount] = useState<number | null>(null);
  const [popup, setPopup] = useState<Popup | null>(null);
  const [regionStats, setRegionStats] = useState<RegionStats | null>(null);
  const [regionLoading, setRegionLoading] = useState(false);
  const [regionTime, setRegionTime] = useState<number | null>(null);
  const [regionName, setRegionName] = useState<string | null>(null);
  const [drawnPolygon, setDrawnPolygon] = useState<object | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [hoveredCha, setHoveredCha] = useState<string | null>(null);
  const [showVesselPanel, setShowVesselPanel] = useState(false);
  const [showRegionPanel, setShowRegionPanel] = useState(false);
  const [showMooringPanel, setShowMooringPanel] = useState(false);
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [selectedRegionNames, setSelectedRegionNames] = useState<Set<string>>(new Set());
  const [uploadedRegions, setUploadedRegions] = useState<PresetRegion[]>([]);
  const [uploadedMoorings, setUploadedMoorings] = useState<Mooring[]>([]);
  const [hoveredMooring, setHoveredMooring] = useState<Mooring | null>(null);
  const [showBathymetry, setShowBathymetry] = useState(false);

  useEffect(() => {
    const fmt = new GeoJSON();
    chaSourceRef.current.clear();
    const allRegions = [
      ...CHA_REGIONS.map((r) => ({ ...r, regionType: "CHA" })),
      ...WEA_REGIONS.map((r) => ({ ...r, regionType: "WEA" })),
      ...uploadedRegions.map((r) => ({ ...r, regionType: "Uploaded" })),
    ];
    allRegions
      .filter((r) => selectedRegionNames.has(r.name))
      .forEach((r) => {
        const geom = fmt.readGeometry(r.geojson, {
          dataProjection: "EPSG:4326",
          featureProjection: "EPSG:3857",
        }) as OLPolygon;
        const f = new Feature({ geometry: geom, name: r.name, chaRegion: r, regionType: r.regionType });
        chaSourceRef.current.addFeature(f);
      });
  }, [selectedRegionNames, uploadedRegions]);

  // rebuild mooring points when date range or uploaded moorings change
  useEffect(() => {
    mooringSourceRef.current.clear();
    const allMoorings = [...AMAR_MOORINGS, ...uploadedMoorings];
    allMoorings
      .filter((m) => m.deployment <= end && m.recovery >= start)
      .forEach((m) => {
        const f = new Feature({
          geometry: new Point(fromLonLat([m.lon, m.lat])),
          mooring: m,
        });
        mooringSourceRef.current.addFeature(f);
      });
  }, [start, end, uploadedMoorings]);

  useEffect(() => {
    if (!mapRef.current) return;

    const chaLayer = new VectorLayer({
      source: chaSourceRef.current,
      style: chaStyle,
    });
    chaLayerRef.current = chaLayer;

    const mooringLayer = new VectorLayer({
      source: mooringSourceRef.current,
      style: new Style({
        image: new CircleStyle({
          radius: 7,
          fill: new Fill({ color: "#293241" }),
          stroke: new Stroke({ color: "#fff", width: 2 }),
        }),
      }),
    });

    const routeLayer = new VectorLayer({
      source: sourceRef.current,
      style: makeFeatureStyle(true, true),
    });
    routeLayerRef.current = routeLayer;

    const bathyLayer = new TileLayer({ visible: false });
    bathyLayerRef.current = bathyLayer;

    const map = new Map({
      target: mapRef.current,
      layers: [
        new TileLayer({
          source: new XYZ({
            url: "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}",
            attributions: "Tiles © Esri",
          }),
        }),
        bathyLayer,
        chaLayer,
        mooringLayer,
        routeLayer,
        new VectorLayer({
          source: drawSourceRef.current,
          style: new Style({
            stroke: new Stroke({ color: "#ee6c4d", width: 2 }),
            fill: new Fill({ color: "rgba(238,108,77,0.1)" }),
          }),
        }),
      ],
      view: new View({
        center: fromLonLat([-63.5, 44.5]),
        zoom: 6,
      }),
    });

    map.on("click", (e) => {
      // check CHA click first
      let chaClicked = false;
      map.forEachFeatureAtPixel(e.pixel, (feature) => {
        const cha = feature.get("chaRegion") as PresetRegion | undefined;
        if (cha) {
          chaClicked = true;
          runChaAnalysis(cha);
          return true;
        }
      });
      if (chaClicked) return;

      // then vessel point click
      map.forEachFeatureAtPixel(e.pixel, (feature) => {
        if (feature.getGeometry()?.getType() !== "Point") return;
        if (feature.get("chaRegion")) return;
        if (feature.get("mooring")) return;
        setPopup({
          x: e.pixel[0],
          y: e.pixel[1],
          time: feature.get("time"),
          lat: feature.get("lat"),
          lon: feature.get("lon"),
          sog: feature.get("sog"),
          cog: feature.get("cog"),
          source: feature.get("source"),
          isStart: feature.get("isStart") ?? false,
          isEnd: feature.get("isEnd") ?? false,
        });
        return true;
      }) ?? setPopup(null);
    });

    // hover cursor on CHA polygons and moorings
    map.on("pointermove", (e) => {
      let overCha = false;
      let overMooring = false;
      map.forEachFeatureAtPixel(e.pixel, (feature) => {
        if (feature.get("chaRegion")) {
          overCha = true;
          const name = feature.get("name") as string;
          setHoveredCha(name);
          (feature as Feature).setStyle(chaHoverStyle(feature));
          return true;
        }
        if (feature.get("mooring")) {
          overMooring = true;
          setHoveredMooring(feature.get("mooring") as Mooring);
          return true;
        }
      });
      if (!overCha) {
        setHoveredCha(null);
        chaSourceRef.current.getFeatures().forEach((f) => f.setStyle(undefined));
      }
      if (!overMooring) setHoveredMooring(null);
      map.getTargetElement().style.cursor = overCha || overMooring ? "pointer" : "";
    });

    mapObj.current = map;
    return () => map.setTarget(undefined);
  }, []);

  useEffect(() => {
    bathyLayerRef.current?.setVisible(showBathymetry);
  }, [showBathymetry]);

  useEffect(() => {
    fetch(`${API}/api/vessels?start=${start}T00:00:00&end=${end}T23:59:59`)
      .then((r) => r.json())
      .then((d) => setVessels(d.vessels || []))
      .catch(console.error);
  }, [start, end]);

  function downloadMooringTemplate() {
    const csv = [
      "name,lat,lon,depth,deployment,recovery",
      "MY_MOORING_01,43.0026,-65.5653,101,2023-05-01,2023-10-15",
      "MY_MOORING_02,43.4976,-62.8700,98,2023-06-01,2023-11-01",
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "mooring_template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function handleMooringUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const lines = (evt.target?.result as string).trim().split("\n");
        const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
        const idx = (col: string) => header.indexOf(col);
        const parsed: Mooring[] = lines.slice(1).map((line) => {
          const cols = line.split(",").map((c) => c.trim());
          return {
            name: cols[idx("name")],
            lat: parseFloat(cols[idx("lat")]),
            lon: parseFloat(cols[idx("lon")]),
            depth: parseFloat(cols[idx("depth")] ?? "0"),
            deployment: cols[idx("deployment")],
            recovery: cols[idx("recovery")],
          };
        }).filter((m) => m.name && !isNaN(m.lat) && !isNaN(m.lon));
        setUploadedMoorings((prev) => [...prev, ...parsed]);
      } catch {
        alert("Invalid CSV. Expected columns: name, lat, lon, depth, deployment, recovery");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function toggleRegion(name: string) {
    setSelectedRegionNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const buffer = evt.target?.result as ArrayBuffer;
        const fc = await shp(buffer);
        const features = Array.isArray(fc) ? fc.flatMap((f) => f.features) : fc.features;
        const name = file.name.replace(/\.zip$/i, "");
        features.forEach((feat, i) => {
          const regionName = feat.properties?.Name || feat.properties?.name || (features.length === 1 ? name : `${name} ${i + 1}`);
          const geometry = feat.geometry;
          setUploadedRegions((prev) => [...prev, { name: regionName, geojson: geometry }]);
          setSelectedRegionNames((prev) => new Set([...prev, regionName]));
        });
      } catch {
        alert("Invalid shapefile. Upload a .zip containing .shp, .dbf, and .prj files.");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  }

  function runChaAnalysis(cha: PresetRegion) {
    setRegionLoading(true);
    setRegionStats(null);
    setRegionTime(null);
    setRegionName(cha.name);
    setDrawnPolygon(null);
    drawSourceRef.current.clear();
    const t0 = performance.now();
    fetch(`${API}/api/analysis/region`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ polygon: cha.geojson, start, end }),
    })
      .then((r) => r.json())
      .then((d: RegionStats) => {
        setRegionStats(d);
        setRegionTime(Math.round(performance.now() - t0));
        setShowResults(true);
      })
      .catch(console.error)
      .finally(() => setRegionLoading(false));
  }

  function loadRoute(vessel = selected) {
    if (!vessel) return;
    setPointCount(null);
    sourceRef.current.clear();

    const params = new URLSearchParams({
      start: `${start}T00:00:00`,
      end: `${end}T23:59:59`,
    });

    fetch(`${API}/api/vessel/${vessel.mmsi}/route?${params}`)
      .then((r) => r.json())
      .then((data: { points: RoutePoint[] }) => {
        const pts = data.points || [];
        setPointCount(pts.length);
        if (pts.length === 0) return;

        const coords = pts.map((p) => fromLonLat([p.longitude, p.latitude]));
        sourceRef.current.addFeature(
          new Feature({ geometry: new LineString(coords) })
        );

        pts.forEach((p, i) => {
          const f = new Feature({
            geometry: new Point(fromLonLat([p.longitude, p.latitude])),
            sog: p.sog,
            cog: p.cog,
            time: p.time,
            lat: p.latitude,
            lon: p.longitude,
            source: p.source,
            isStart: i === 0,
            isEnd: i === pts.length - 1,
          });
          sourceRef.current.addFeature(f);
        });

        const extent = sourceRef.current.getExtent();
        if (extent)
          mapObj.current!.getView().fit(extent, {
            padding: [60, 60, 60, 60],
            maxZoom: 12,
            duration: 800,
          });
      })
      .catch(console.error);
  }

  function startDrawing() {
    if (!mapObj.current) return;
    if (drawRef.current) mapObj.current.removeInteraction(drawRef.current);
    setDrawnPolygon(null);
    setRegionStats(null);
    setRegionName(null);
    setDrawing(true);

    drawSourceRef.current.clear();
    const draw = new Draw({
      source: drawSourceRef.current,
      type: "Polygon",
      stopClick: true,
    });
    draw.on("drawend", (e) => {
      const fmt = new GeoJSON();
      const geojson = fmt.writeGeometryObject(e.feature.getGeometry()!, {
        dataProjection: "EPSG:4326",
        featureProjection: "EPSG:3857",
      });
      setDrawnPolygon(geojson);
      setDrawing(false);
      mapObj.current!.removeInteraction(draw);
      drawRef.current = null;
    });

    drawRef.current = draw;
    mapObj.current.addInteraction(draw);
  }

  function cancelDrawing() {
    if (mapObj.current && drawRef.current) {
      mapObj.current.removeInteraction(drawRef.current);
      drawRef.current = null;
    }
    drawSourceRef.current.clear();
    setDrawing(false);
  }

  function clearRegion() {
    drawSourceRef.current.clear();
    setDrawnPolygon(null);
    setRegionStats(null);
    setRegionTime(null);
    setRegionName(null);
  }

  function loadRegionStats() {
    if (!drawnPolygon) return;
    setRegionLoading(true);
    setRegionStats(null);
    setRegionTime(null);
    setRegionName("Custom Region");
    const t0 = performance.now();
    fetch(`${API}/api/analysis/region`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ polygon: drawnPolygon, start, end }),
    })
      .then((r) => r.json())
      .then((d: RegionStats) => {
        setRegionStats(d);
        setRegionTime(Math.round(performance.now() - t0));
        setShowResults(true);
      })
      .catch(console.error)
      .finally(() => setRegionLoading(false));
  }

  const filtered = vessels.filter((v) => {
    const q = search.toLowerCase();
    return (
      String(v.mmsi).includes(q) ||
      (v.vessel_name || "").toLowerCase().includes(q) ||
      String(v.ship_type || "")
        .toLowerCase()
        .includes(q)
    );
  });

  return (
    <div className="relative w-full h-screen overflow-hidden">
      {/* Map — full screen */}
      <div ref={mapRef} className="absolute inset-0" />

      {/* Drawing hint */}
      {drawing && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-white/95 backdrop-blur-md rounded-full shadow-lg ring-1 ring-slate-900/5 px-5 py-2.5 text-xs text-slate-600 flex items-center gap-3">
          <span>Click to add points · double-click to finish</span>
          <button
            onClick={cancelDrawing}
            className="text-slate-400 hover:text-slate-700 font-medium transition"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Mooring hover tooltip */}
      {hoveredMooring && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 bg-[#293241] text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg pointer-events-none">
          {hoveredMooring.name} · {hoveredMooring.depth}m · {hoveredMooring.deployment} → {hoveredMooring.recovery}
        </div>
      )}

      {/* CHA hover tooltip */}
      {hoveredCha && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 bg-[#293241] text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg pointer-events-none">
          {hoveredCha} — click to analyse
        </div>
      )}

      {/* Region loading indicator */}
      {regionLoading && regionName && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-white/95 backdrop-blur-md rounded-full shadow-lg ring-1 ring-slate-900/5 px-4 py-2 text-xs text-slate-600 flex items-center gap-2">
          <span className="w-3 h-3 rounded-full border-2 border-[#3d5a80] border-t-transparent animate-spin" />
          Analysing {regionName}…
        </div>
      )}

      {/* Left icon bar */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-3">
        {/* Vessels */}
        <div className="group relative">
          <button
            onClick={() => { setShowVesselPanel((p) => !p); setShowRegionPanel(false); setShowMooringPanel(false); setShowLayerPanel(false); }}
            className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition ${
              showVesselPanel
                ? "bg-[#293241] ring-2 ring-white/60"
                : "bg-[#3d5a80] hover:bg-[#293241]"
            } text-white`}
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <circle cx="3" cy="6" r="1" fill="currentColor" stroke="none" />
              <circle cx="3" cy="12" r="1" fill="currentColor" stroke="none" />
              <circle cx="3" cy="18" r="1" fill="currentColor" stroke="none" />
            </svg>
          </button>
          <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-slate-800 text-white text-xs font-medium px-2.5 py-1 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none">
            Vessels
          </div>
        </div>

        {/* Moorings */}
        <div className="group relative">
          <button
            onClick={() => { setShowMooringPanel((p) => !p); setShowVesselPanel(false); setShowRegionPanel(false); setShowLayerPanel(false); }}
            className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition ${
              showMooringPanel ? "bg-[#293241] ring-2 ring-white/60" : "bg-[#3d5a80] hover:bg-[#293241]"
            } text-white`}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="5" r="2" />
              <line x1="12" y1="7" x2="12" y2="19" />
              <path d="M8 11h8" />
              <path d="M5 19h6" /><path d="M13 19h6" />
            </svg>
          </button>
          <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-slate-800 text-white text-xs font-medium px-2.5 py-1 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none">
            Moorings
          </div>
        </div>

        {/* Regions */}
        <div className="group relative">
          <button
            onClick={() => {
              setShowRegionPanel((p) => !p);
              setShowVesselPanel(false);
              setShowMooringPanel(false);
              setShowLayerPanel(false);
            }}
            className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition ${
              showRegionPanel
                ? "bg-[#293241] ring-2 ring-white/60"
                : "bg-[#3d5a80] hover:bg-[#293241]"
            } text-white`}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="3,6 9,3 15,6 21,3 21,18 15,21 9,18 3,21" />
            </svg>
          </button>
          <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-slate-800 text-white text-xs font-medium px-2.5 py-1 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none">
            Regions
          </div>
        </div>

        {/* Draw Region */}
        <div className="group relative">
          <button
            onClick={drawing ? cancelDrawing : startDrawing}
            className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition text-white ${
              drawing
                ? "bg-[#ee6c4d] hover:bg-[#c4462a]"
                : "bg-[#3d5a80] hover:bg-[#293241]"
            }`}
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="12,3 20.5,8.5 20.5,15.5 12,21 3.5,15.5 3.5,8.5" />
            </svg>
          </button>
          <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-slate-800 text-white text-xs font-medium px-2.5 py-1 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none">
            {drawing ? "Cancel Drawing" : "Draw Region"}
          </div>
        </div>

        {/* Layers */}
        <div className="group relative">
          <button
            onClick={() => { setShowLayerPanel((p) => !p); setShowVesselPanel(false); setShowRegionPanel(false); setShowMooringPanel(false); }}
            className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition text-white ${
              showLayerPanel ? "bg-[#293241] ring-2 ring-white/60" : "bg-[#3d5a80] hover:bg-[#293241]"
            }`}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2"/>
              <polyline points="2 17 12 22 22 17"/>
              <polyline points="2 12 12 17 22 12"/>
            </svg>
          </button>
          <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-slate-800 text-white text-xs font-medium px-2.5 py-1 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none">
            Layers
          </div>
        </div>

        {/* Analyse (contextual) */}
        {drawnPolygon && !drawing && (
          <div className="group relative">
            <button
              onClick={loadRegionStats}
              disabled={regionLoading}
              className="w-12 h-12 rounded-full bg-[#98c1d9] text-white shadow-lg flex items-center justify-center hover:bg-[#7aadca] disabled:opacity-50 transition"
            >
              {regionLoading ? (
                <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              ) : (
                <svg
                  className="w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                  <line x1="2" y1="20" x2="22" y2="20" />
                </svg>
              )}
            </button>
            <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-slate-800 text-white text-xs font-medium px-2.5 py-1 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none">
              Analyse Region
            </div>
          </div>
        )}

        {/* View Results (contextual) */}
        {regionStats && !regionLoading && (
          <div className="group relative">
            <button
              onClick={() => setShowResults(true)}
              className="w-12 h-12 rounded-full bg-[#3d5a80] text-white shadow-lg flex items-center justify-center hover:bg-[#293241] transition"
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
            <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-slate-800 text-white text-xs font-medium px-2.5 py-1 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none">
              View Results
            </div>
          </div>
        )}

        {/* Clear Region (contextual) */}
        {drawnPolygon && (
          <div className="group relative">
            <button
              onClick={clearRegion}
              className="w-12 h-12 rounded-full bg-slate-500 text-white shadow-lg flex items-center justify-center hover:bg-slate-600 transition"
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
            </button>
            <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-slate-800 text-white text-xs font-medium px-2.5 py-1 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none">
              Clear Region
            </div>
          </div>
        )}
      </div>

      {/* Vessel panel — slides in from the right */}
      <div
        className={`absolute right-0 top-0 h-full w-72 bg-white z-20 flex flex-col shadow-xl transition-transform duration-200 ${
          showVesselPanel ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="px-5 pt-8 pb-4 shrink-0">
          <div className="grid grid-cols-2 gap-2 mb-4">
            <label className="flex flex-col gap-1">
              <span className="text-slate-400 text-xs font-medium uppercase tracking-wide">
                Start
              </span>
              <input
                type="date"
                className="bg-slate-50 border border-transparent rounded-xl px-3 py-2 text-sm focus:outline-none focus:bg-white focus:border-[#98c1d9] focus:ring-2 focus:ring-[#98c1d9]/20 transition"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-slate-400 text-xs font-medium uppercase tracking-wide">
                End
              </span>
              <input
                type="date"
                className="bg-slate-50 border border-transparent rounded-xl px-3 py-2 text-sm focus:outline-none focus:bg-white focus:border-[#98c1d9] focus:ring-2 focus:ring-[#98c1d9]/20 transition"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
          </div>

          {/* Search for a vessel input bar */}
          <div className="relative mb-4">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className="w-full bg-slate-50 border border-transparent rounded-xl pl-9 pr-3 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-[#98c1d9] focus:ring-2 focus:ring-[#98c1d9]/20 transition"
              placeholder="Search name, MMSI, or type…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-2.5 text-xs font-medium text-slate-400 border-t border-slate-100 shrink-0">
          <span className="uppercase tracking-wide">Vessels</span>
          <span className="tabular-nums">
            {filtered.length !== vessels.length
              ? `${filtered.length} / ${vessels.length}`
              : `${vessels.length}`}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 px-2 pb-2 pt-2">
          {filtered.length === 0 && (
            <p className="text-sm text-slate-400 p-6 text-center">
              {vessels.length === 0
                ? "Loading vessels…"
                : "No vessels match your search."}
            </p>
          )}
          {filtered.map((v) => {
            const type = classifyType(v.ship_type);
            const color = TYPE_COLORS[type] ?? TYPE_COLORS.unknown;
            const active = selected?.mmsi === v.mmsi;
            return (
              <button
                key={v.mmsi}
                onClick={() => {
                  setSelected(v);
                  sourceRef.current.clear();
                  setPointCount(null);
                  loadRoute(v);
                }}
                className={`w-full text-left px-3 py-2.5 rounded-xl mb-0.5 transition ${
                  active
                    ? "bg-[#3d5a80]/8 ring-1 ring-[#3d5a80]/20"
                    : "hover:bg-slate-50"
                }`}
              >
                <div
                  className={`font-medium truncate ${
                    active ? "text-[#293241]" : "text-slate-700"
                  }`}
                >
                  {v.vessel_name || "Unknown vessel"}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 text-[11px] text-slate-500 capitalize">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: color }}
                    />
                    {type}
                  </span>
                  <span className="text-[11px] text-slate-400 tabular-nums">
                    {v.mmsi}
                  </span>
                </div>
                {active && pointCount !== null && (
                  <p className="text-[11px] text-slate-400 mt-1.5 tabular-nums">
                    {pointCount === 0
                      ? "No data for this period."
                      : `${pointCount.toLocaleString()} position points in range`}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Moorings panel — slides in from the right */}
      <div
        className={`absolute right-0 top-0 h-full w-72 bg-white z-20 flex flex-col shadow-xl transition-transform duration-200 ${
          showMooringPanel ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="px-5 pt-8 pb-4 shrink-0">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Moorings</h2>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <label className="flex flex-col gap-1">
              <span className="text-slate-400 text-xs font-medium uppercase tracking-wide">Start</span>
              <input type="date" className="bg-slate-50 border border-transparent rounded-xl px-3 py-2 text-sm focus:outline-none focus:bg-white focus:border-[#98c1d9] focus:ring-2 focus:ring-[#98c1d9]/20 transition" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-slate-400 text-xs font-medium uppercase tracking-wide">End</span>
              <input type="date" className="bg-slate-50 border border-transparent rounded-xl px-3 py-2 text-sm focus:outline-none focus:bg-white focus:border-[#98c1d9] focus:ring-2 focus:ring-[#98c1d9]/20 transition" value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>
          <label className="flex flex-col items-center justify-center gap-1.5 w-full border-2 border-dashed border-slate-200 rounded-xl py-4 px-3 text-xs text-slate-400 cursor-pointer hover:border-[#293241] hover:text-[#293241] transition">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>Upload CSV</span>
            <span className="text-[10px] text-slate-300">name, lat, lon, depth, deployment, recovery</span>
            <input type="file" accept=".csv" className="hidden" onChange={handleMooringUpload} />
          </label>
          <button
            onClick={downloadMooringTemplate}
            className="mt-2 w-full text-[11px] text-slate-400 hover:text-[#3d5a80] text-center transition"
          >
            Download template
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-2 pb-4">
          {/* AMAR section */}
          <div className="px-3 pt-3 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">AMAR</div>
          {AMAR_MOORINGS.filter((m) => m.deployment <= end && m.recovery >= start).length === 0 && (
            <p className="text-xs text-slate-400 px-3 py-1">None active in this period.</p>
          )}
          {AMAR_MOORINGS.filter((m) => m.deployment <= end && m.recovery >= start).map((m) => (
            <div key={m.name} className="px-3 py-2.5 rounded-xl hover:bg-slate-50">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#293241] inline-block shrink-0" />
                <span className="text-sm font-medium text-slate-700">{m.name}</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">{m.depth}m · {m.deployment} → {m.recovery}</div>
            </div>
          ))}

          {/* Uploaded section */}
          {uploadedMoorings.length > 0 && (
            <>
              <div className="px-3 pt-3 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Uploaded</div>
              {uploadedMoorings.filter((m) => m.deployment <= end && m.recovery >= start).length === 0 && (
                <p className="text-xs text-slate-400 px-3 py-1">None active in this period.</p>
              )}
              {uploadedMoorings.filter((m) => m.deployment <= end && m.recovery >= start).map((m) => (
                <div key={m.name} className="px-3 py-2.5 rounded-xl hover:bg-slate-50">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#293241] inline-block shrink-0" />
                    <span className="text-sm font-medium text-slate-700">{m.name}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{m.depth}m · {m.deployment} → {m.recovery}</div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Regions panel — slides in from the right */}
      <div
        className={`absolute right-0 top-0 h-full w-72 bg-white z-20 flex flex-col shadow-xl transition-transform duration-200 ${
          showRegionPanel ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="px-5 pt-8 pb-4 shrink-0">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Regions</h2>

          {/* Shapefile / GeoJSON upload */}
          <label className="flex flex-col items-center justify-center gap-1.5 w-full border-2 border-dashed border-slate-200 rounded-xl py-4 px-3 text-xs text-slate-400 cursor-pointer hover:border-[#98c1d9] hover:text-[#3d5a80] transition">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>Upload Shapefile (.zip)</span>
            <input type="file" accept=".zip" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-2 pb-4">
          {/* CHA section */}
          <div className="px-3 pt-3 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Critical Habitat Areas</div>
          {CHA_REGIONS.map((r) => (
            <label key={r.name} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedRegionNames.has(r.name)}
                onChange={() => toggleRegion(r.name)}
                className="accent-[#3d5a80] w-4 h-4 rounded"
              />
              <div>
                <div className="text-sm font-medium text-slate-700">{r.name}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-[#3d5a80] inline-block" />
                  <span className="text-[11px] text-slate-400">CHA</span>
                </div>
              </div>
            </label>
          ))}

          {/* WEA section */}
          {/* Title for the region */}
          <div className="px-3 pt-3 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Wind Energy Areas</div>
          {
            // Text display for each region
            WEA_REGIONS.map((r) => (
              <label key={r.name} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedRegionNames.has(r.name)}
                  onChange={() => toggleRegion(r.name)}
                  className="accent-[#ee6c4d] w-4 h-4 rounded"
                />
                <div>
                  <div className="text-sm font-medium text-slate-700">{r.name}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-2 h-2 rounded-full bg-[#ee6c4d] inline-block" />
                    <span className="text-[11px] text-slate-400">WEA</span>
                  </div>
                </div>
              </label>
            ))
          }

          {/* Uploaded regions */}
          {uploadedRegions.length > 0 && (
            <>
              <div className="px-3 pt-4 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Uploaded</div>
              {uploadedRegions.map((r) => (
                <label key={r.name} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedRegionNames.has(r.name)}
                    onChange={() => toggleRegion(r.name)}
                    className="accent-[#9b59b6] w-4 h-4 rounded"
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-700">{r.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="w-2 h-2 rounded-full bg-[#9b59b6] inline-block" />
                      <span className="text-[11px] text-slate-400">Custom region</span>
                    </div>
                  </div>
                </label>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Layers panel — slides in from the right */}
      <div
        className={`absolute right-0 top-0 h-full w-72 bg-white z-20 flex flex-col shadow-xl transition-transform duration-200 ${
          showLayerPanel ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="px-5 pt-8 pb-4 shrink-0">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Layers</h2>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 px-2 pb-4">
          <div className="px-3 pt-1 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Ocean</div>
          <label className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 cursor-pointer">
            <input
              type="checkbox"
              checked={showBathymetry}
              onChange={() => setShowBathymetry((p) => !p)}
              className="accent-[#3d5a80] w-4 h-4 rounded"
            />
            <div>
              <div className="text-sm font-medium text-slate-700">Bathymetry</div>
              <div className="text-[11px] text-slate-400">Coming soon — awaiting DFO dataset</div>
            </div>
          </label>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-5 left-5 z-10 bg-white/90 backdrop-blur-md rounded-2xl shadow-lg shadow-slate-900/5 ring-1 ring-slate-900/5 px-4 py-3 text-xs">
        <div className="font-semibold mb-2 text-slate-600">Speed (knots)</div>
        <div className="flex items-center gap-2 mb-1 text-slate-500">
          <span className="w-2.5 h-2.5 rounded-full bg-[#0a8754] inline-block" />
          &lt; 3
        </div>
        <div className="flex items-center gap-2 mb-1 text-slate-500">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ffc857] inline-block" />
          3 – 10
        </div>
        <div className="flex items-center gap-2 text-slate-500">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ee6c4d] inline-block" />
          &gt; 10
        </div>
      </div>

      {/* Results modal */}
      {showResults && regionStats && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
          onClick={() => setShowResults(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between px-7 pt-6 pb-5 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-xl font-semibold text-slate-800 tracking-tight">
                  {regionName ?? "Region Analysis"}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  <span className="font-medium text-slate-700">
                    {regionStats.unique_vessels}
                  </span>{" "}
                  vessels ·{" "}
                  <span className="font-medium text-slate-700">
                    {regionStats.total_positions.toLocaleString()}
                  </span>{" "}
                  positions · {start} → {end}
                  {regionTime !== null && (
                    <span className="text-slate-400">
                      {" "}
                      · {(regionTime / 1000).toFixed(1)}s
                    </span>
                  )}
                </p>
              </div>
              <button
                onClick={() => setShowResults(false)}
                className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full w-8 h-8 flex items-center justify-center transition shrink-0"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto px-7 py-6 space-y-7">
              {regionStats.total_positions === 0 ? (
                <p className="text-sm text-slate-500 text-center py-10">
                  No vessel activity found in this region for the selected
                  dates.
                </p>
              ) : (
                <>
                  {regionStats.plots?.vessel_types && (
                    <figure>
                      <figcaption className="flex items-center justify-between mb-2.5">
                        <span className="text-sm font-semibold text-slate-700">
                          Daily vessels by type
                        </span>
                        <button
                          onClick={() =>
                            downloadPlot(
                              regionStats.plots.vessel_types!,
                              "vessels_by_type.png"
                            )
                          }
                          className="text-xs font-medium text-[#98c1d9] hover:bg-[#98c1d9]/10 rounded-full px-3 py-1 transition"
                        >
                          ↓ Download
                        </button>
                      </figcaption>
                      <img
                        src={`data:image/png;base64,${regionStats.plots.vessel_types}`}
                        className="w-full rounded-xl ring-1 ring-slate-100"
                      />
                    </figure>
                  )}
                  {regionStats.plots?.speed_overall && (
                    <figure>
                      <figcaption className="flex items-center justify-between mb-2.5">
                        <span className="text-sm font-semibold text-slate-700">
                          Daily mean speed
                        </span>
                        <button
                          onClick={() =>
                            downloadPlot(
                              regionStats.plots.speed_overall!,
                              "mean_speed.png"
                            )
                          }
                          className="text-xs font-medium text-[#98c1d9] hover:bg-[#98c1d9]/10 rounded-full px-3 py-1 transition"
                        >
                          ↓ Download
                        </button>
                      </figcaption>
                      <img
                        src={`data:image/png;base64,${regionStats.plots.speed_overall}`}
                        className="w-full rounded-xl ring-1 ring-slate-100"
                      />
                    </figure>
                  )}
                  {regionStats.plots?.vessel_density && (
                    <figure>
                      <figcaption className="flex items-center justify-between mb-2.5">
                        <span className="text-sm font-semibold text-slate-700">
                          Vessel traffic density
                        </span>
                        <button
                          onClick={() =>
                            downloadPlot(
                              regionStats.plots.vessel_density!,
                              "vessel_density.png"
                            )
                          }
                          className="text-xs font-medium text-[#98c1d9] hover:bg-[#98c1d9]/10 rounded-full px-3 py-1 transition"
                        >
                          ↓ Download
                        </button>
                      </figcaption>
                      <img
                        src={`data:image/png;base64,${regionStats.plots.vessel_density}`}
                        className="w-full rounded-xl ring-1 ring-slate-100"
                      />
                    </figure>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Point popup */}
      {popup && (
        <div
          className="absolute z-30 bg-white ring-1 ring-slate-900/5 rounded-2xl shadow-xl px-4 py-3 text-xs pointer-events-none"
          style={{ left: popup.x + 12, top: popup.y - 8 }}
        >
          <div className="font-semibold text-[#3d5a80] mb-1.5">
            {popup.isStart ? "Start" : popup.isEnd ? "End" : popup.source}
          </div>
          <div className="text-slate-600 space-y-1 tabular-nums">
            <div>
              <span className="text-slate-400 inline-block w-16">Time</span>
              {formatTime(popup.time)}
            </div>
            <div>
              <span className="text-slate-400 inline-block w-16">Latitude</span>
              {popup.lat?.toFixed(5)}°N
            </div>
            <div>
              <span className="text-slate-400 inline-block w-16">
                Longitude
              </span>
              {popup.lon?.toFixed(5)}°
            </div>
            <div>
              <span className="text-slate-400 inline-block w-16">Speed</span>
              {popup.sog != null ? `${popup.sog} kt` : "—"}
            </div>
            <div>
              <span className="text-slate-400 inline-block w-16">Course</span>
              {popup.cog != null ? `${popup.cog}°` : "—"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ShipMap;

import React, { useEffect, useRef } from 'react';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import { fromLonLat } from 'ol/proj';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import 'ol/ol.css';

function ShipMap() {
  const mapRef = useRef(null);

  useEffect(() => {
    const vectorSource = new VectorSource();

    const map = new Map({
      target: mapRef.current,
      layers: [
        new TileLayer({ source: new OSM() }),
        new VectorLayer({ source: vectorSource }),
      ],
      view: new View({
        center: fromLonLat([-63.5, 44.5]),
        zoom: 6,
      }),
    });

    return () => map.setTarget(null);
  }, []);

  return <div ref={mapRef} style={{ width: '100%', height: '100vh' }} />;
}

export default ShipMap;

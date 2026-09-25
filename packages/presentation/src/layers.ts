/** Plugin-owned native layers, registered with the host using public APIs. */
import type { FeatureCollection } from 'geojson';
import type { Map, GeoJSONSource, LayerSpecification } from 'maplibre-gl';
import type { NormalizedBundle } from '../../domain/src/types';
import type { GeoLibreAppAPI } from './geolibre-api';
export const layerId = 'geotrust-fixtures';
const sourceId = 'geotrust-fixtures-source';
const nativeIds = ['geotrust-areas', 'geotrust-roads', 'geotrust-points'];
export function fixtureFeatures(bundle: NormalizedBundle): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      ...bundle.assets.map((asset) => ({
        type: 'Feature' as const,
        id: asset.id,
        geometry: asset.geometry,
        properties: { label: asset.name, kind: asset.kind, synthetic: true },
      })),
      ...bundle.hazards
        .filter((hazard) => hazard.geometry !== null)
        .map((hazard) => ({
          type: 'Feature' as const,
          id: hazard.id,
          geometry: hazard.geometry!,
          properties: { label: hazard.title, kind: hazard.kind, synthetic: true },
        })),
    ],
  };
}
export function mountLayers(app: GeoLibreAppAPI, map: Map, data: FeatureCollection): () => void {
  const specs: LayerSpecification[] = [
    {
      id: nativeIds[0]!,
      source: sourceId,
      type: 'fill',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': '#e59c32', 'fill-opacity': 0.2 },
    },
    {
      id: nativeIds[1]!,
      source: sourceId,
      type: 'line',
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: { 'line-color': '#507aa6', 'line-width': 3 },
    },
    {
      id: nativeIds[2]!,
      source: sourceId,
      type: 'circle',
      filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-color': '#0d8176', 'circle-radius': 7 },
    },
  ];
  let removed = false;
  let disposed = false;
  function draw(): void {
    if (removed || disposed || !map.isStyleLoaded()) return;
    const source = map.getSource<GeoJSONSource>(sourceId);
    if (source) source.setData(data);
    else map.addSource(sourceId, { type: 'geojson', data });
    for (const spec of specs) if (!map.getLayer(spec.id)) map.addLayer(spec);
  }
  function clear(): void {
    for (const id of [...nativeIds].reverse()) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(sourceId)) map.removeSource(sourceId);
  }
  draw();
  map.on('style.load', draw);
  try {
    app.registerExternalNativeLayer!({
      id: layerId,
      name: 'GeoTrust synthetic fixtures',
      type: 'geojson',
      nativeLayerIds: [...nativeIds],
      sourceId,
      sourceIds: [sourceId],
      source: { type: 'geojson', data },
      geojson: data,
    });
  } catch (error) {
    disposed = true;
    map.off('style.load', draw);
    clear();
    throw error;
  }
  const unsubscribe = app.onLayersChanged!((ids) => {
    if (!ids.includes(layerId)) {
      removed = true;
      clear();
    }
  });
  return () => {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    map.off('style.load', draw);
    app.unregisterExternalNativeLayer!(layerId);
    clear();
  };
}

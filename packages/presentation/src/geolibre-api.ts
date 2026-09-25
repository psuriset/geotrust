/**
 * Narrow structural subset of GeoLibre's PUBLIC plugin API at e7db039.
 * Keep this boundary compatible with upstream types.ts; never import its private store.
 * Map itself is the public MapLibre type (a host-owned instance).
 */
import type { FeatureCollection } from 'geojson';
import type { Map } from 'maplibre-gl';
export interface RightPanel {
  id: string;
  title: string;
  defaultWidth?: number;
  render: (container: HTMLElement) => void | (() => void);
}
export interface NativeLayer {
  id: string;
  name: string;
  type?: 'geojson';
  nativeLayerIds: string[];
  sourceId?: string;
  sourceIds?: string[];
  source?: Record<string, unknown>;
  geojson?: FeatureCollection;
}
export interface GeoLibreAppAPI {
  getMap?: () => Map | null;
  registerRightPanel?: (panel: RightPanel) => () => void;
  openRightPanel?: (id: string) => boolean;
  closeRightPanel?: (id: string) => void;
  registerExternalNativeLayer?: (layer: NativeLayer) => void;
  unregisterExternalNativeLayer?: (id: string) => void;
  onLayersChanged?: (callback: (ids: string[]) => void) => () => void;
}
export interface GeoLibrePlugin {
  id: string;
  name: string;
  version: string;
  engines?: 'maplibre'[];
  activate: (app: GeoLibreAppAPI) => boolean | void;
  deactivate: (app: GeoLibreAppAPI) => void;
  getProjectState?: () => unknown;
  applyProjectState?: (app: GeoLibreAppAPI, state: unknown) => boolean | void;
}

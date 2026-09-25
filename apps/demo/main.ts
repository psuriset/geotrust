/** A real local MapLibre map with a small API harness, NOT an upstream GeoLibre runtime. */
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../../packages/plugin/style.css';
import './style.css';
import { createLivePlugin } from '../../packages/plugin/src/live';
import { createPlugin } from '../../packages/plugin/src/plugin';
import type { GeoLibreAppAPI, RightPanel } from '../../packages/presentation/src/geolibre-api';
setWorkerUrl(workerUrl);
const map = new MapLibreMap({
  container: 'map',
  center: [-78.4, 35.6],
  zoom: 7,
  style: {
    version: 8,
    sources: {},
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e6eeec' } }],
  },
  attributionControl: false,
});
const live = new URLSearchParams(location.search).get('mode') === 'live';
if (live) {
  document.querySelector('header p')!.textContent =
    'Development harness · live NWS NC / USGS global · not the GeoLibre host';
  document.querySelector('#map')!.setAttribute('aria-label', 'Live source event map');
}
const plugin = live
  ? createLivePlugin()
  : createPlugin(
      import.meta.env.VITE_GEOTRUST_PROFILE ??
        (import.meta.env.PROD ? 'production' : 'development'),
    );
const panel = document.querySelector<HTMLElement>('#panel')!;
const status = document.querySelector<HTMLElement>('#status')!;
const toggle = document.querySelector<HTMLButtonElement>('#toggle')!;
let registration: RightPanel | undefined;
let cleanup: (() => void) | void;
let active = false;
const ids = new Set<string>();
const listeners = new Set<(ids: string[]) => void>();
const app: GeoLibreAppAPI = {
  getMap: () => map,
  registerRightPanel(value) {
    registration = value;
    return () => {
      registration = undefined;
    };
  },
  openRightPanel() {
    if (!registration) return false;
    cleanup = registration.render(panel);
    return true;
  },
  closeRightPanel() {
    cleanup?.();
    cleanup = undefined;
    panel.replaceChildren();
  },
  registerExternalNativeLayer(layer) {
    ids.add(layer.id);
    for (const listener of listeners) listener([...ids]);
  },
  unregisterExternalNativeLayer(id) {
    ids.delete(id);
    for (const listener of listeners) listener([...ids]);
  },
  onLayersChanged(callback) {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  },
};
function activate(): void {
  active = plugin.activate(app) !== false;
  toggle.textContent = active ? 'Deactivate plugin' : 'Activate plugin';
  status.textContent = active
    ? live
      ? 'Live feed mode — local gateway'
      : 'Offline fixtures — no live data'
    : 'Plugin inactive';
}
map.on('load', () => {
  activate();
  toggle.disabled = false;
});
map.on('error', (event) => {
  console.error('GeoTrust map error', event.error);
  status.textContent = 'Map error; check WebGL support.';
});
map.on('idle', () => {
  const layers = ['geotrust-areas', 'geotrust-roads', 'geotrust-points'].filter((id) =>
    map.getLayer(id),
  );
  status.dataset.renderedFeatures = String(
    layers.length ? map.queryRenderedFeatures({ layers }).length : 0,
  );
});
toggle.addEventListener('click', () => {
  if (active) {
    plugin.deactivate(app);
    active = false;
    toggle.textContent = 'Activate plugin';
    status.textContent = 'Plugin inactive';
  } else activate();
});
window.addEventListener('pagehide', () => {
  plugin.deactivate(app);
  map.remove();
});

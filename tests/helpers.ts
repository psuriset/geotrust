import { vi } from 'vitest';
import type { Map } from 'maplibre-gl';
import type { GeoLibreAppAPI, RightPanel } from '../packages/presentation/src/geolibre-api';
export function fakeHost() {
  const container = document.createElement('div');
  const sources = new globalThis.Map<string, { setData: ReturnType<typeof vi.fn> }>();
  const layers = new Set<string>();
  const owned = new Set<string>();
  const styles = new Set<() => void>();
  const listeners = new Set<(ids: string[]) => void>();
  let ready = true;
  let panel: RightPanel | undefined;
  let panelCleanup: (() => void) | void;
  const map = {
    isStyleLoaded: () => ready,
    getSource: (id: string) => sources.get(id),
    getLayer: (id: string) => layers.has(id),
    addSource: vi.fn((id: string) => {
      sources.set(id, { setData: vi.fn() });
    }),
    removeSource: vi.fn((id: string) => sources.delete(id)),
    addLayer: vi.fn((spec: { id: string }) => layers.add(spec.id)),
    removeLayer: vi.fn((id: string) => layers.delete(id)),
    on: vi.fn((_event: string, fn: () => void) => styles.add(fn)),
    off: vi.fn((_event: string, fn: () => void) => styles.delete(fn)),
  };
  const app: GeoLibreAppAPI = {
    getMap: () => map as unknown as Map,
    registerRightPanel: vi.fn((value) => {
      panel = value;
      return () => {
        panel = undefined;
      };
    }),
    openRightPanel: vi.fn(() => {
      if (!panel) return false;
      panelCleanup = panel.render(container);
      return true;
    }),
    closeRightPanel: vi.fn(() => {
      panelCleanup?.();
      panelCleanup = undefined;
    }),
    registerExternalNativeLayer: vi.fn((layer) => {
      owned.add(layer.id);
      listeners.forEach((listener) => listener([...owned]));
    }),
    unregisterExternalNativeLayer: vi.fn((id) => {
      owned.delete(id);
      listeners.forEach((listener) => listener([...owned]));
    }),
    onLayersChanged: vi.fn((listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }),
  };
  return {
    app,
    map,
    container,
    sources,
    layers,
    owned,
    styles,
    listeners,
    setReady: (value: boolean) => {
      ready = value;
    },
    reloadStyle: () => {
      sources.clear();
      layers.clear();
      styles.forEach((fn) => fn());
    },
    deleteLayer: () => {
      owned.clear();
      listeners.forEach((fn) => fn([]));
    },
  };
}

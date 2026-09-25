import { IndexedEvidenceStore, type EvidenceStore } from '../../storage/src/index';
import { GeoEventAdapter, type FeedLoader } from '../../feeds/src/adapter';
import type { GeoLibrePlugin } from '../../presentation/src/geolibre-api';
import { mountLayers } from '../../presentation/src/layers';
/** Live presentation consumes normalized events; it never mixes fixture assets into analysis. */
export function createLivePlugin(
  store: EvidenceStore = new IndexedEvidenceStore(),
  loader?: FeedLoader,
): GeoLibrePlugin {
  const adapter = new GeoEventAdapter(store, loader);
  let cleanup: (() => void) | undefined;
  return {
    id: 'geotrust',
    name: 'GeoTrust',
    version: '0.2.0',
    engines: ['maplibre'],
    activate(app) {
      cleanup?.();
      const map = app.getMap?.();
      if (
        !map ||
        !app.registerRightPanel ||
        !app.openRightPanel ||
        !app.closeRightPanel ||
        !app.registerExternalNativeLayer ||
        !app.unregisterExternalNativeLayer ||
        !app.onLayersChanged
      )
        return false;
      let alive = true;
      let target: HTMLElement | undefined;
      let clearLayers: (() => void) | undefined;
      let busy = false;
      let snapshots: Awaited<ReturnType<typeof adapter.refresh>>[] = [];
      const draw = () => {
        if (!target) return;
        target.replaceChildren();
        const heading = document.createElement('h2');
        heading.textContent = 'GeoTrust · live source events';
        target.append(heading);
        const note = document.createElement('p');
        note.textContent =
          'NWS: North Carolina. USGS: global weekly catalog. No asset exposure analysis or inferred facts.';
        target.append(note);
        for (const snapshot of snapshots) {
          const status = document.createElement('p');
          status.textContent = `${snapshot.source}: ${snapshot.status} · ${snapshot.freshnessState} · last success ${snapshot.lastSuccess ?? 'never'} · ${snapshot.error ?? ''}`;
          target.append(status);
          for (const event of snapshot.events) {
            const row = document.createElement('p');
            row.textContent = `${event.title} · ${event.freshnessState} · ${event.confirmationStatus} · confidence ${event.confidenceBand}${event.geometry ? '' : ' · location unknown'}`;
            target.append(row);
          }
        }
      };
      const unregister = app.registerRightPanel({
        id: 'geotrust-live',
        title: 'GeoTrust live feeds',
        render(element) {
          target = element;
          draw();
          return () => {
            target = undefined;
            element.replaceChildren();
          };
        },
      });
      const refresh = async () => {
        if (busy) return;
        busy = true;
        try {
          snapshots = await Promise.all([adapter.refresh('nws'), adapter.refresh('usgs')]);
          if (!alive) return;
          clearLayers?.();
          clearLayers = mountLayers(app, map, {
            type: 'FeatureCollection',
            features: snapshots.flatMap((s) =>
              s.events
                .filter(
                  (e) =>
                    e.geometry !== null &&
                    e.freshnessState === 'fresh' &&
                    !['test', 'cancelled'].includes(e.confirmationStatus),
                )
                .map((e) => ({
                  type: 'Feature' as const,
                  id: e.id,
                  geometry: e.geometry!,
                  properties: { title: e.title, source: e.source.id },
                })),
            ),
          });
          draw();
        } catch (error) {
          if (alive && target)
            target.textContent = 'Evidence storage or adapter error: ' + String(error);
        } finally {
          busy = false;
        }
      };
      const timer = setInterval(() => {
        void refresh();
      }, 60_000);
      cleanup = () => {
        alive = false;
        clearInterval(timer);
        clearLayers?.();
        app.closeRightPanel?.('geotrust-live');
        unregister();
        cleanup = undefined;
      };
      if (!app.openRightPanel('geotrust-live')) {
        cleanup();
        return false;
      }
      void refresh();
      return true;
    },
    deactivate() {
      cleanup?.();
    },
  };
}

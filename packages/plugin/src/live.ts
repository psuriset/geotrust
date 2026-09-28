import { resolveEventZones, zoneGeometry, type ZoneRecord } from '../../zones/src/index';
import { renderExposurePanel } from '../../presentation/src/exposure-panel';
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
  let zones: ZoneRecord[] = [];
  let cleanup: (() => void) | undefined;
  return {
    id: 'geotrust',
    name: 'GeoTrust',
    version: '0.4.0',
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
      let exposure: ReturnType<typeof renderExposurePanel> | undefined;
      const draw = () => {
        if (!target) return;
        target.replaceChildren();
        const heading = document.createElement('h2');
        heading.textContent = 'GeoTrust · live source events';
        target.append(heading);
        const note = document.createElement('p');
        note.textContent =
          'NWS: North Carolina. USGS: global weekly catalog. NC inventory screening below; no inferred damage or operational status.';
        target.append(note);
        for (const snapshot of snapshots) {
          const status = document.createElement('p');
          status.textContent = `${snapshot.source}: ${snapshot.status} · ${snapshot.freshnessState} · last success ${snapshot.lastSuccess ?? 'never'} · ${snapshot.error ?? ''}`;
          target.append(status);
          for (const event of snapshot.events) {
            const row = document.createElement('p');
            row.textContent = `${event.title} · ${event.freshnessState} · ${event.confirmationStatus} · confidence ${event.confidenceBand}${event.geometry ? '' : zoneGeometry(event, zones) ? ' · NWS zone geometry' : ' · location unknown'}`;
            target.append(row);
          }
        }
      };
      const unregister = app.registerRightPanel({
        id: 'geotrust-live',
        title: 'GeoTrust live feeds',
        render(element) {
          const feeds = document.createElement('div');
          const slot = document.createElement('div');
          element.append(slot, feeds);
          target = feeds;
          exposure = renderExposurePanel(slot);
          draw();
          if (snapshots.length) exposure.update(snapshots, zones, new Date().toISOString());
          return () => {
            exposure?.dispose();
            exposure = undefined;
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
          zones = (await resolveEventZones(snapshots.flatMap((s) => s.events))).records;
          if (!alive) return;
          clearLayers?.();
          clearLayers = mountLayers(
            app,
            map,
            {
              type: 'FeatureCollection',
              features: snapshots.flatMap((s) =>
                s.events
                  .filter(
                    (e) =>
                      (e.geometry !== null || zoneGeometry(e, zones) !== null) &&
                      e.freshnessState === 'fresh' &&
                      !['test', 'cancelled'].includes(e.confirmationStatus),
                  )
                  .map((e) => ({
                    type: 'Feature' as const,
                    id: e.id,
                    geometry: (e.geometry ?? zoneGeometry(e, zones))!,
                    properties: {
                      title: e.title,
                      source: e.source.id,
                      geometryBasis: e.geometry ? 'source' : 'nws-zones',
                    },
                  })),
              ),
            },
            'GeoTrust live events',
          );
          draw();
          exposure?.update(snapshots, zones, new Date().toISOString());
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

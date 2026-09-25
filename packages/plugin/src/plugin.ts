/** Composition root; all asynchronous activation work is generation-scoped. */
import { loadConfig } from '../../config/src/index';
import { createFixtureAdapter } from '../../ingestion/src/index';
import { normalizeBundle } from '../../normalization/src/index';
import { analyze } from '../../analysis/src/index';
import { createEvidence, evidenceLabel } from '../../provenance/src/index';
import { dependencyStatus } from '../../dependencies/src/index';
import { fixtureFeatures, mountLayers } from '../../presentation/src/layers';
import { renderPanel } from '../../presentation/src/panel';
import type { GeoLibreAppAPI, GeoLibrePlugin } from '../../presentation/src/geolibre-api';
export const identity = { id: 'geotrust', name: 'GeoTrust', version: '0.1.0' };
export function createPlugin(profile = 'production'): GeoLibrePlugin {
  const config = loadConfig(profile);
  let generation = 0;
  let stop: (() => void) | undefined;
  return {
    ...identity,
    engines: ['maplibre'],
    activate(app) {
      stop?.();
      const token = ++generation;
      const map = app.getMap?.();
      if (
        !map ||
        !app.registerRightPanel ||
        !app.openRightPanel ||
        !app.closeRightPanel ||
        !app.registerExternalNativeLayer ||
        !app.unregisterExternalNativeLayer ||
        !app.onLayersChanged
      ) {
        console.error(
          'GeoTrust requires the documented MapLibre, native-layer and right-panel APIs.',
        );
        return false;
      }
      let container: HTMLElement | undefined;
      let render: ((element: HTMLElement) => () => void) | undefined;
      let clearPanel: (() => void) | undefined;
      let clearLayers: (() => void) | undefined;
      let unregister: (() => void) | undefined;
      stop = () => {
        ++generation;
        clearLayers?.();
        clearLayers = undefined;
        clearPanel?.();
        clearPanel = undefined;
        app.closeRightPanel?.(identity.id);
        unregister?.();
        unregister = undefined;
        container = undefined;
        stop = undefined;
      };
      try {
        unregister = app.registerRightPanel({
          id: identity.id,
          title: 'GeoTrust · offline fixtures',
          defaultWidth: 400,
          render(element) {
            container = element;
            if (render) clearPanel = render(element);
            else element.textContent = 'Loading synthetic fixtures…';
            return () => {
              clearPanel?.();
              clearPanel = undefined;
              container = undefined;
              element.replaceChildren();
            };
          },
        });
        if (!app.openRightPanel(identity.id)) throw new Error('GeoTrust panel could not be opened');
      } catch (error) {
        stop();
        console.error('GeoTrust activation failed', error);
        return false;
      }
      void (async () => {
        try {
          const input = createFixtureAdapter(config.maxInputBytes).load();
          const bundle = normalizeBundle(input);
          const result = analyze(bundle, config.asOf, config.earthquakeRadiusKm);
          const evidence = await createEvidence(input, result, bundle.issues);
          if (generation !== token) return;
          clearLayers = mountLayers(app, map, fixtureFeatures(bundle));
          render = (element) => {
            element.replaceChildren();
            return renderPanel(
              element,
              bundle,
              evidence,
              dependencyStatus([]).reason,
              evidenceLabel(evidence),
            );
          };
          if (container) {
            clearPanel?.();
            clearPanel = render(container);
          }
        } catch (error) {
          if (generation !== token) return;
          clearLayers?.();
          clearLayers = undefined;
          const message = 'GeoTrust fixture load failed: ' + String(error);
          render = (element) => {
            element.textContent = message;
            return () => element.replaceChildren();
          };
          if (container) {
            clearPanel?.();
            clearPanel = render(container);
          }
          console.error(message);
        }
      })();
      return true;
    },
    deactivate() {
      stop?.();
    },
    getProjectState() {
      return { schemaVersion: 1, mode: 'fixture' };
    },
    applyProjectState(_app: GeoLibreAppAPI, state: unknown) {
      return (
        typeof state === 'object' &&
        state !== null &&
        Object.keys(state).length === 2 &&
        'schemaVersion' in state &&
        state.schemaVersion === 1 &&
        'mode' in state &&
        state.mode === 'fixture'
      );
    },
  };
}

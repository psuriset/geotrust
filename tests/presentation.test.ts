import { afterEach, expect, it, vi } from 'vitest';
import { fakeHost } from './helpers';
import { createFixtureAdapter } from '../packages/ingestion/src/index';
import { normalizeBundle } from '../packages/normalization/src/index';
import { fixtureFeatures, layerId, mountLayers } from '../packages/presentation/src/layers';
import { renderPanel } from '../packages/presentation/src/panel';
import { createEvidence } from '../packages/provenance/src/index';
import { analyze } from '../packages/analysis/src/index';
const bundle = () => normalizeBundle(createFixtureAdapter(1_000_000).load());
afterEach(() => vi.restoreAllMocks());
it('draws bounded layers, survives style reloads and tears down exactly once', () => {
  const host = fakeHost();
  const features = fixtureFeatures(bundle());
  expect(features.features).toHaveLength(5);
  const stop = mountLayers(host.app, host.app.getMap!()!, features);
  expect(host.layers.size).toBe(3);
  expect(host.sources.size).toBe(1);
  expect(host.owned.has(layerId)).toBe(true);
  for (let i = 0; i < 10; i++) host.styles.forEach((draw) => draw());
  expect(host.map.addSource).toHaveBeenCalledTimes(1);
  host.reloadStyle();
  expect(host.layers.size).toBe(3);
  stop();
  stop();
  expect(host.layers.size).toBe(0);
  expect(host.sources.size).toBe(0);
  expect(host.styles.size).toBe(0);
  expect(host.listeners.size).toBe(0);
});
it('waits for a ready style and respects user removal through later style changes', () => {
  const host = fakeHost();
  host.setReady(false);
  const stop = mountLayers(host.app, host.app.getMap!()!, fixtureFeatures(bundle()));
  expect(host.layers.size).toBe(0);
  host.setReady(true);
  host.reloadStyle();
  expect(host.layers.size).toBe(3);
  host.deleteLayer();
  host.reloadStyle();
  expect(host.layers.size).toBe(0);
  stop();
});
it('cleans map mutations if host registration fails', () => {
  const host = fakeHost();
  host.app.registerExternalNativeLayer = () => {
    throw new Error('host error');
  };
  expect(() => mountLayers(host.app, host.app.getMap!()!, fixtureFeatures(bundle()))).toThrow(
    'host error',
  );
  expect(host.layers.size).toBe(0);
  expect(host.styles.size).toBe(0);
});
it('renders dangerous text safely, links evidence and downloads a JSON snapshot', async () => {
  const input = createFixtureAdapter(1_000_000).load();
  const data = normalizeBundle(input);
  data.hazards[0]!.title = '<img src=x onerror=alert(1)>';
  const run = await createEvidence(input, analyze(data, '2026-09-25T12:00:00Z', 100), [
    { sourceId: 'test', recordId: 'x', reason: 'missing geometry' },
  ]);
  const container = document.createElement('div');
  const stop = renderPanel(container, data, run, 'Dependencies unknown', 'Synthetic evidence');
  expect(container.querySelector('img')).toBeNull();
  expect(container.textContent).toContain('<img');
  expect(container.textContent).toContain('Evidence:');
  expect(container.textContent).toContain('missing geometry');
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  container.querySelector('button')!.click();
  expect(create).toHaveBeenCalledOnce();
  expect(click).toHaveBeenCalledOnce();
  await vi.waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:test'));
  stop();
  expect(container.children).toHaveLength(0);
});

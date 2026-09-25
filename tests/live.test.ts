import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createLivePlugin } from '../packages/plugin/src/live';
import { IndexedEvidenceStore } from '../packages/storage/src/index';
import { fakeHost } from './helpers';
import nws from '../data/fixtures/feeds/nws.json';
import usgs from '../data/fixtures/feeds/usgs.json';
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const fixtureLoader = async (source: string) => ({
  payload: source === 'nws' ? nws : usgs,
  retrievedAt: new Date().toISOString(),
});
it('live plugin renders feed status safely and cleans up across refresh, reopen and deactivate', async () => {
  const db = new IndexedEvidenceStore(new IDBFactory());
  const plugin = createLivePlugin(db, fixtureLoader);
  const host = fakeHost();
  expect(plugin.activate({})).toBe(false);
  expect(plugin.activate(host.app)).toBe(true);
  await vi.waitFor(() => expect(host.container.textContent).toContain('nws: ok'));
  expect(host.container.textContent).toContain('confidence unknown');
  expect(host.container.textContent).toContain('location unknown');
  host.app.closeRightPanel!('geotrust-live');
  host.app.openRightPanel!('geotrust-live');
  expect(host.container.textContent).toContain('USGS');
  plugin.activate(host.app);
  await vi.waitFor(() => expect(host.container.textContent).toContain('nws: ok'));
  plugin.deactivate(host.app);
  plugin.deactivate(host.app);
  expect(host.layers.size).toBe(0);
  expect(host.container.textContent).toBe('');
  host.app.openRightPanel = () => false;
  expect(plugin.activate(host.app)).toBe(false);
  await db.close();
});
it('handles persistence failure and ignores late results after deactivation', async () => {
  const host = fakeHost();
  const db = new IndexedEvidenceStore(new IDBFactory());
  vi.spyOn(db, 'put').mockRejectedValue(new Error('Quota'));
  const plugin = createLivePlugin(db, fixtureLoader);
  plugin.activate(host.app);
  await vi.waitFor(() => expect(host.container.textContent).toContain('storage or adapter error'));
  plugin.deactivate(host.app);
  await db.close();
  const other = new IndexedEvidenceStore(new IDBFactory());
  let finish!: (v: { payload: unknown; retrievedAt: string }) => void;
  const delayed = createLivePlugin(
    other,
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  delayed.activate(host.app);
  await vi.waitFor(() => expect(finish).toBeDefined());
  delayed.deactivate(host.app);
  finish({ payload: usgs, retrievedAt: new Date().toISOString() });
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(host.layers.size).toBe(0);
  await other.close();
});
it('polls serially and uses the default IndexedDB store only when requested', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  expect(createLivePlugin()).toBeDefined();
  let tick!: () => void;
  vi.spyOn(globalThis, 'setInterval').mockImplementation((handler) => {
    tick = handler as () => void;
    return 123 as unknown as ReturnType<typeof setInterval>;
  });
  const db = new IndexedEvidenceStore(new IDBFactory());
  const host = fakeHost();
  let calls = 0;
  const plugin = createLivePlugin(db, async (source) => {
    calls++;
    return fixtureLoader(source);
  });
  plugin.activate(host.app);
  await vi.waitFor(() => expect(host.container.textContent).toContain('nws: ok'));
  tick();
  tick();
  await vi.waitFor(() => expect(calls).toBe(4));
  await new Promise((resolve) => setTimeout(resolve, 20));
  plugin.deactivate(host.app);
  await db.close();
  expect(calls).toBe(4);
});

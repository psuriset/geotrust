import { afterEach, expect, it, vi } from 'vitest';
import { fakeHost } from './helpers';
import { createPlugin } from '../packages/plugin/src/plugin';
afterEach(() => vi.restoreAllMocks());
const loaded = async (host: ReturnType<typeof fakeHost>) =>
  vi.waitFor(() => expect(host.container.textContent).toContain('How reliable'));
it('activates synchronously, loads offline evidence and supports repeated lifecycle cleanup', async () => {
  const host = fakeHost();
  const plugin = createPlugin('test');
  for (let i = 0; i < 20; i++) {
    expect(plugin.activate(host.app)).toBe(true);
    await loaded(host);
    expect(host.layers.size).toBe(3);
    plugin.deactivate(host.app);
    expect(host.container.textContent).toBe('');
    expect(host.styles.size).toBe(0);
    expect(host.listeners.size).toBe(0);
  }
  plugin.deactivate(host.app);
});
it('accepts only the non-secret fixture project-state schema', () => {
  const host = fakeHost();
  const plugin = createPlugin();
  expect(plugin.applyProjectState!(host.app, plugin.getProjectState!())).toBe(true);
  for (const value of [
    null,
    'state',
    {},
    { schemaVersion: 2, mode: 'fixture' },
    { schemaVersion: 1, mode: 'live' },
    { schemaVersion: 1, mode: 'fixture', apiKey: 'rejected' },
  ]) {
    expect(plugin.applyProjectState!(host.app, value)).toBe(false);
  }
});
it('fails cleanly on incompatible host APIs and refused panels', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const plugin = createPlugin('test');
  expect(plugin.activate({})).toBe(false);
  const host = fakeHost();
  host.app.openRightPanel = () => false;
  expect(plugin.activate(host.app)).toBe(false);
  expect(host.layers.size).toBe(0);
  const failing = fakeHost();
  failing.app.registerRightPanel = () => {
    throw new Error('panel refused');
  };
  expect(plugin.activate(failing.app)).toBe(false);
});
it('prevents late async results from resurrecting a deactivated plugin', async () => {
  const host = fakeHost();
  const plugin = createPlugin('test');
  plugin.activate(host.app);
  plugin.deactivate(host.app);
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(host.layers.size).toBe(0);
  expect(host.container.textContent).toBe('');
  plugin.activate(host.app);
  plugin.activate(host.app);
  await loaded(host);
  expect(host.listeners.size).toBe(1);
  plugin.deactivate(host.app);
});
it('can close/reopen a panel before and after async completion', async () => {
  const host = fakeHost();
  const plugin = createPlugin('test');
  plugin.activate(host.app);
  host.app.closeRightPanel!('geotrust');
  await vi.waitFor(() => expect(host.layers.size).toBe(3));
  host.app.openRightPanel!('geotrust');
  await loaded(host);
  host.app.closeRightPanel!('geotrust');
  host.app.openRightPanel!('geotrust');
  await loaded(host);
  plugin.deactivate(host.app);
});
it('shows an explicit load error without leaked native layers', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const host = fakeHost();
  host.app.registerExternalNativeLayer = () => {
    throw new Error('registration refused');
  };
  const plugin = createPlugin('test');
  plugin.activate(host.app);
  await vi.waitFor(() => expect(host.container.textContent).toContain('fixture load failed'));
  expect(host.layers.size).toBe(0);
  host.app.closeRightPanel!('geotrust');
  host.app.openRightPanel!('geotrust');
  expect(host.container.textContent).toContain('fixture load failed');
  plugin.deactivate(host.app);
});

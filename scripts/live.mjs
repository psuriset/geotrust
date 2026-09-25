import { createGateway } from '../dist/gateway/server.mjs';
createGateway(
  process.env.GEOTRUST_WEB_ROOT ?? 'dist/demo',
  undefined,
  Date.now,
  4174,
  process.env.GEOTRUST_HOST_MODE === 'geolibre',
).listen(4174, '127.0.0.1', () =>
  console.info('GeoTrust local feeds: http://127.0.0.1:4174/?mode=live'),
);

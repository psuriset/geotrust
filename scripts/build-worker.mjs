import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
const result = await build({
  entryPoints: ['packages/jobs/src/worker-entry.ts'],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  minify: true,
  legalComments: 'inline',
});
await mkdir('generated', { recursive: true });
await writeFile(
  'generated/worker-source.ts',
  'export default ' + JSON.stringify(result.outputFiles[0].text) + ';\n',
);

/** Public, validated configuration. No network mode or secret configuration exists. */
import { z } from 'zod';
import development from '../../../config/development.json';
import test from '../../../config/test.json';
import production from '../../../config/production.json';
const schema = z
  .object({
    profile: z.enum(['development', 'test', 'production']),
    mode: z.literal('fixture'),
    asOf: z.iso.datetime({ offset: true }),
    earthquakeRadiusKm: z.number().min(10).max(300),
    maxInputBytes: z.number().int().min(1).max(20_000_000),
  })
  .strict();
export type Config = z.infer<typeof schema>;
export function validateConfig(value: unknown): Config {
  return schema.parse(value);
}
export function loadConfig(profile: string): Config {
  const profiles = { development, test, production };
  if (profile !== 'development' && profile !== 'test' && profile !== 'production') {
    throw new Error('Unknown GeoTrust profile: ' + profile);
  }
  return validateConfig(profiles[profile]);
}

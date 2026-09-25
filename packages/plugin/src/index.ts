/** Self-contained external-plugin entry; profile is replaced at build time. */
import { createLivePlugin } from './live';
import { createPlugin } from './plugin';
declare const __GEOTRUST_PROFILE__: string;
declare const __GEOTRUST_MODE__: string;
export default __GEOTRUST_MODE__ === 'live'
  ? createLivePlugin()
  : createPlugin(__GEOTRUST_PROFILE__);

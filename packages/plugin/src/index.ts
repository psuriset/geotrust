/** Self-contained external-plugin entry; profile is replaced at build time. */
import { createPlugin } from './plugin';
declare const __GEOTRUST_PROFILE__: string;
export default createPlugin(__GEOTRUST_PROFILE__);

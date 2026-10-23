import { runStage } from './runtime.mjs';
import * as domain from './domain.mjs';
import * as learning from './learning.mjs';
window.ZhizhiPi = { runStage, ...domain, ...learning };

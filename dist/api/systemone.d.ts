/**
 * System One API for kenari.
 * POST /v1/systemone
 *
 * kenari's own decision contract: `questions` runs noul, choice, score and box
 * questions. No OpenAI or Anthropic SDK method maps to it.
 */
import type { KenariSystemOneOptions, KenariSystemOneResponse } from "../types.js";
export declare function runSystemOne(options: KenariSystemOneOptions): Promise<KenariSystemOneResponse>;
//# sourceMappingURL=systemone.d.ts.map
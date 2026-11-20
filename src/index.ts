/**
 * omp-kenari-provider
 *
 * An omp (oh-my-pi) extension that registers kenari as a native AI provider.
 * kenari (https://kenari.id/v1) is an LLM gateway that speaks both the OpenAI
 * Chat Completions API and the Anthropic Messages API, routes to many upstream
 * providers, and bills in Indonesian Rupiah.
 *
 * Features:
 *  - Dynamic model discovery from GET /v1/models (public, no key needed)
 *  - OpenAI-completions wire format (kenari is an OpenAI drop-in)
 *  - :free model variants (no balance deducted)
 *  - System One models registered as native omp `judge` models
 *  - Image generation, embeddings, rerank, moderations
 *  - Web and X search (POST /v1/web/search, /v1/web/fetch, /v1/x/search),
 *    with web search also registered as the `kenari_web_search` tool
 *  - API key auth via KENARI_API_KEY env var or /login kenari
 *
 * Two omp details shape this file:
 *
 *  1. `openai-completions` is a built-in omp API, so the provider needs no
 *     `streamSimple`: omp dispatches chat models through its own transport.
 *  2. omp has no classifiers. System One models are judge models instead, and
 *     they carry their own per-model `baseUrl` because the `typesafe` wire
 *     wants the origin while every other kenari surface wants `/v1`.
 */

import type { Model, OAuthCredentials } from "@oh-my-pi/pi-ai";
import type {
  ExtensionAPI,
  ProviderConfig,
  ProviderModelConfig,
} from "@oh-my-pi/pi-coding-agent";
import {
  BASE_URL_KENARI,
  KENARI_API_KEY_ENV,
  PROVIDER_KENARI,
} from "./constants.js";
import {
  fetchKenariDynamicModels,
  getKenariBaselineModels,
} from "./models.js";
import {
  fetchKenariSystemOneDynamicModels,
  getKenariSystemOneBaselineModels,
  toProviderJudgeConfigs,
} from "./systemone.js";
import { generateImageTool } from "./tools/image.js";
import { kenariWebSearchTool } from "./tools/web.js";
import type { KenariModel } from "./types.js";
// =============================================================================
// Model conversion
// =============================================================================

/**
 * Convert kenari chat models to the configs `registerProvider` accepts.
 *
 * `baseUrl` is emitted per model rather than relying on the provider-level one,
 * because kenari's chat and judge surfaces live at different roots: chat wants
 * `https://kenari.id/v1` (omp appends `/chat/completions`), while the `typesafe`
 * judge wire appends `/v1/systemone` and so wants the bare origin. Emitting it
 * per model keeps both correct without a second provider registration.
 */
function toProviderModelConfigs(models: KenariModel[]): ProviderModelConfig[] {
  return models.map((m) => ({
    id: m.id,
    name: m.name,
    api: m.api,
    baseUrl: m.baseUrl,
    reasoning: m.reasoning ?? false,
    ...(m.thinking !== undefined ? { thinking: m.thinking } : {}),
    input: [...m.input],
    cost: m.cost,
    // `ModelSpec.contextWindow` is nullable (a spec may omit one); the provider
    // config requires a concrete number, so fall back to a sane default.
    contextWindow: m.contextWindow ?? 131072,
    maxTokens: m.maxTokens ?? 65536,
    ...(m.compat !== undefined ? { compat: m.compat } : {}),
    ...(m.headers !== undefined ? { headers: m.headers } : {}),
  }));
}

// =============================================================================
// Extension entry point
// =============================================================================

export default async function (omp: ExtensionAPI) {
  /**
   * Discover both catalogs up front.
   *
   * This runs in the extension factory rather than through the provider's
   * `fetchDynamicModels`, and that is deliberate. omp resolves ONE `baseUrl` per
   * provider: with a dynamic model manager installed it projects every model of
   * that provider onto the provider-level URL, ignoring a model's own `baseUrl`.
   * kenari needs two — `https://kenari.id/v1` for chat and the bare origin for
   * the `typesafe` judge wire, which appends `/v1/systemone` — so a dynamic
   * manager would send every judge to `/v1/v1/systemone`.
   *
   * Without it, omp honours per-model `baseUrl` (proven by test), so one
   * provider serves both surfaces and, crucially, keeps ONE credential: omp keys
   * credential lookups strictly by provider id, so a second provider id could
   * never read the key that `/login kenari` stores.
   *
   * Discovery is best-effort: a failed fetch falls back to the static baseline,
   * matching what `fetchDynamicModels` did.
   */
  const [chatModels, judgeModels] = await Promise.all([
    fetchKenariDynamicModels(undefined),
    fetchKenariSystemOneDynamicModels(undefined),
  ]);

  omp.registerProvider(PROVIDER_KENARI, {
    baseUrl: BASE_URL_KENARI,
    api: "openai-completions",
    // Names a credential source for omp's auth cascade but must NOT build a
    // header: with `authHeader: true`, omp composes
    // `Authorization: Bearer <apiKey>` from this *literal string*
    // (createConfigHeaderResolver), so an unset env var ships
    // "Bearer KENARI_API_KEY" and every call 401s — bypassing the cascade that
    // correctly resolves the key saved by `/login kenari`.
    apiKey: KENARI_API_KEY_ENV,
    models: [
      ...toProviderModelConfigs(chatModels),
      ...toProviderJudgeConfigs(judgeModels),
    ],
    // API-key login so /login kenari stores the key for later sessions.
    oauth: {
      name: "kenari API key",
      login: async (
        callbacks: Parameters<NonNullable<ProviderConfig["oauth"]>["login"]>[0],
      ): Promise<OAuthCredentials> => {
        const key = await callbacks.onPrompt({
          message: "Enter kenari API key (kn-...)",
        });
        if (!key?.trim())
          throw new Error("kenari login cancelled: no API key entered");
        return {
          refresh: key.trim(),
          access: key.trim(),
          expires: Number.MAX_SAFE_INTEGER,
        };
      },
      refreshToken: async (credentials: OAuthCredentials) => credentials,
      getApiKey: (credentials: OAuthCredentials) => credentials.access,
    },
  });

  // generate_image: draw with kenari image models, render inline, save to cwd.
  omp.registerTool(generateImageTool);

  // kenari_web_search: live web search, authenticated by the /login kenari key.
  omp.registerTool(kenariWebSearchTool);

}

export { createEmbeddings } from "./api/embeddings.js";
export {
  decodeImage,
  generateImageBytes,
  generateImages,
} from "./api/images.js";
export { moderateContent } from "./api/moderations.js";
export { rerankDocuments } from "./api/rerank.js";
export { webFetch, webSearch, xSearch } from "./api/web.js";
// Re-export for programmatic use.
export {
  fetchKenariModels,
  fetchKenariModelsByModality,
  fetchKenariDynamicModels,
  toKenariModels,
} from "./models.js";
export { generateImageTool } from "./tools/image.js";
export { kenariWebSearchTool } from "./tools/web.js";
export type {
  KenariAnthropicModel,
  KenariImageData,
  KenariImageGenerateOptions,
  KenariImageResponse,
  KenariImageResult,
  KenariModality,
  KenariModel,
  KenariOpenAIModel,
  KenariPricingLine,
  KenariWebFetchOptions,
  KenariWebFetchResponse,
  KenariWebMeta,
  KenariWebSearchOptions,
  KenariWebSearchResponse,
  KenariWebSearchResult,
  KenariXSearchFilter,
  KenariXSearchOptions,
  KenariXSearchResponse,
} from "./types.js";
export { KENARI_MODALITIES } from "./types.js";

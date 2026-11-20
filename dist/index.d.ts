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
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
export default function (omp: ExtensionAPI): void;
export { createEmbeddings } from "./api/embeddings.js";
export { decodeImage, generateImageBytes, generateImages, } from "./api/images.js";
export { moderateContent } from "./api/moderations.js";
export { rerankDocuments } from "./api/rerank.js";
export { webFetch, webSearch, xSearch } from "./api/web.js";
export { fetchKenariModels, fetchKenariModelsByModality, fetchKenariDynamicModels, toKenariModels, } from "./models.js";
export { generateImageTool } from "./tools/image.js";
export { kenariWebSearchTool } from "./tools/web.js";
export type { KenariAnthropicModel, KenariImageData, KenariImageGenerateOptions, KenariImageResponse, KenariImageResult, KenariModality, KenariModel, KenariOpenAIModel, KenariPricingLine, KenariWebFetchOptions, KenariWebFetchResponse, KenariWebMeta, KenariWebSearchOptions, KenariWebSearchResponse, KenariWebSearchResult, KenariXSearchFilter, KenariXSearchOptions, KenariXSearchResponse, } from "./types.js";
export { KENARI_MODALITIES } from "./types.js";
//# sourceMappingURL=index.d.ts.map
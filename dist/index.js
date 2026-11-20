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
import { fileURLToPath } from "node:url";
import { BASE_URL_KENARI, PROVIDER_KENARI } from "./constants.js";
import { fetchKenariDynamicModels, getKenariBaselineModels, } from "./models.js";
import { fetchKenariSystemOneDynamicModels, getKenariSystemOneBaselineModels, toProviderJudgeConfigs, } from "./systemone.js";
import { generateImageTool } from "./tools/image.js";
import { systemOneTool } from "./tools/systemone.js";
import { kenariWebSearchTool } from "./tools/web.js";
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
function toProviderModelConfigs(models) {
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
export default function (omp) {
    const baselineChatConfigs = toProviderModelConfigs(getKenariBaselineModels());
    // System One models are judge models: they answer bounded questions instead of
    // generating text, so they live in omp's `judge` role rather than /model.
    // They carry their own origin baseUrl; chat models carry the /v1 one.
    const baselineJudgeConfigs = toProviderJudgeConfigs(getKenariSystemOneBaselineModels());
    omp.registerProvider(PROVIDER_KENARI, {
        baseUrl: BASE_URL_KENARI,
        api: "openai-completions",
        // A plain env-var name; omp resolves it, and a key stored by
        // `/login kenari` wins over it because `oauth` is present.
        apiKey: "KENARI_API_KEY",
        authHeader: true,
        models: [...baselineChatConfigs, ...baselineJudgeConfigs],
        // No `streamSimple`: `openai-completions` is a built-in omp API and omp
        // dispatches these chat models through its own transport.
        //
        // No `classifiers`: omp has no classifier concept. The System One models
        // above are `kind: "judge"` on the built-in `typesafe` api instead, which
        // is what wires them into the judge role.
        // API-key login so /login kenari stores the key for later sessions.
        oauth: {
            name: "kenari API key",
            login: async (callbacks) => {
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
            refreshToken: async (credentials) => credentials,
            getApiKey: (credentials) => credentials.access,
        },
        /**
         * Live discovery. omp calls this with the resolved API key and replaces the
         * extension-provided models with whatever it returns, falling back to the
         * static `models` above when the fetch fails.
         *
         * Both catalogs are fetched: the chat catalog from the bare endpoint and the
         * judge catalog from `?modality=systemone`. Each model keeps its own
         * `baseUrl`, so the judge entries stay on the origin.
         */
        fetchDynamicModels: async (apiKey) => {
            const [chatModels, judgeModels] = await Promise.all([
                fetchKenariDynamicModels(apiKey),
                fetchKenariSystemOneDynamicModels(apiKey),
            ]);
            return [
                ...toProviderModelConfigs(chatModels),
                ...toProviderJudgeConfigs(judgeModels),
            ];
        },
    });
    // system_one: bounded judgments through kenari's System One models.
    omp.registerTool(systemOneTool);
    // generate_image: draw with kenari image models, render inline, save to cwd.
    omp.registerTool(generateImageTool);
    // kenari_web_search: live web search, authenticated by the /login kenari key.
    omp.registerTool(kenariWebSearchTool);
    // Ship the skill with the extension. Resolving the path from this module
    // means an installed package and a local checkout both find it.
    omp.on("resources_discover", () => ({
        skillPaths: [fileURLToPath(new URL("../skills", import.meta.url))],
    }));
}
export { createEmbeddings } from "./api/embeddings.js";
export { decodeImage, generateImageBytes, generateImages, } from "./api/images.js";
export { moderateContent } from "./api/moderations.js";
export { rerankDocuments } from "./api/rerank.js";
export { runSystemOne } from "./api/systemone.js";
export { webFetch, webSearch, xSearch } from "./api/web.js";
// Re-export for programmatic use.
export { fetchKenariModels, fetchKenariModelsByModality, fetchKenariDynamicModels, toKenariModels, } from "./models.js";
export { generateImageTool } from "./tools/image.js";
export { kenariWebSearchTool } from "./tools/web.js";
export { KENARI_MODALITIES } from "./types.js";

/**
 * Model catalog for kenari.
 *
 * kenari's catalog is dynamic — GET /v1/models (public) lists chat models with
 * prices and capabilities. We fetch it at discovery time and merge with a static
 * baseline for offline initialization. See llms-full.txt ("Models and pricing").
 *
 * Prices arrive as micro-Rupiah per 1M tokens and are converted to omp's
 * USD-per-1M-token ModelCost. One model can have a paid id and a `:free`
 * variant; both are listed by the API and both are surfaced here.
 */
import { BASE_URL_KENARI, MICRO_IDR_PER_1M_TO_USD_PER_1M, PROVIDER_KENARI, } from "./constants.js";
// =============================================================================
// Baseline catalog (offline fallback)
// =============================================================================
const ZERO_COST = Object.freeze({
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
});
/**
 * Shared OpenAI-compat overrides for kenari.
 *
 * kenari documents `max_tokens` (not `max_completion_tokens`) and its chat
 * completions endpoint has no `store` field, but it does accept
 * `reasoning_effort`. Typed against omp's compat bag so a renamed or removed
 * key fails the build instead of being silently ignored on the wire.
 */
const KENARI_COMPAT = Object.freeze({
    supportsStore: false,
    maxTokensField: "max_tokens",
    supportsReasoningEffort: true,
});
/**
 * The built-in kenari-free route: exists on every account, points at free
 * models, costs nothing, rate-limited per account. It is a route, not a
 * model, so GET /v1/models never lists it — add it manually.
 */
export const KENARI_FREE_ROUTE_MODEL = {
    id: "kenari-free",
    name: "kenari-free route (free models)",
    api: "openai-completions",
    provider: PROVIDER_KENARI,
    baseUrl: BASE_URL_KENARI,
    reasoning: false,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: 131072,
    maxTokens: 65536,
    compat: KENARI_COMPAT,
    isFree: true,
};
/** Static baseline models — used for offline init before first fetch. Prices from live catalog. */
export const KENARI_BASELINE_MODELS = [
    // Only used before the first live fetch, so these must be ids kenari still
    // serves: a stale baseline is what a user gets when discovery fails, and an
    // id the gateway has retired answers 400 model_not_found on every call.
    {
        id: "beam-1-0:free",
        name: "Beam 1.0 (Free)",
        api: "openai-completions",
        provider: PROVIDER_KENARI,
        baseUrl: BASE_URL_KENARI,
        reasoning: false,
        input: ["text"],
        cost: ZERO_COST,
        contextWindow: 262144,
        maxTokens: 65536,
        compat: KENARI_COMPAT,
        isFree: true,
    },
    {
        id: "glm-4-7-flash:free",
        name: "GLM 4.7 Flash (Free)",
        api: "openai-completions",
        provider: PROVIDER_KENARI,
        baseUrl: BASE_URL_KENARI,
        reasoning: false,
        input: ["text"],
        cost: ZERO_COST,
        contextWindow: 200000,
        maxTokens: 65536,
        compat: KENARI_COMPAT,
        isFree: true,
    },
    {
        id: "qwen3-5-397b-a17b:free",
        name: "Qwen3.5 397B (Free)",
        api: "openai-completions",
        provider: PROVIDER_KENARI,
        baseUrl: BASE_URL_KENARI,
        reasoning: false,
        input: ["text", "image"],
        cost: ZERO_COST,
        contextWindow: 262144,
        maxTokens: 65536,
        compat: KENARI_COMPAT,
        isFree: true,
    },
    KENARI_FREE_ROUTE_MODEL,
];
// =============================================================================
// Dynamic catalog fetch
// =============================================================================
/** Fetch the full chat model catalog from kenari's public /v1/models endpoint. */
export async function fetchKenariModels(signal) {
    const url = `${BASE_URL_KENARI}/models`;
    const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal,
    });
    if (!response.ok) {
        throw new Error(`kenari /v1/models returned ${response.status}: ${await response.text()}`);
    }
    const json = (await response.json());
    return json.data ?? [];
}
/**
 * Fetch models filtered by modality. The bare `/v1/models` call lists only
 * chat, image, speech, transcription, music and video models — embedding,
 * rerank, moderation and System One models appear only through this filter.
 *
 * The call is public (no key needed). Entries carry `modality` and
 * `pricing_lines`, and their `pricing` holds only `input`, `free`, `currency`
 * and `unit`.
 */
export async function fetchKenariModelsByModality(modality, signal) {
    const url = `${BASE_URL_KENARI}/models?modality=${modality}`;
    const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal,
    });
    if (!response.ok) {
        // The 400 body lists the accepted values, so keep it in the message.
        throw new Error(`kenari /v1/models?modality=${modality} returned ${response.status}: ${await response.text()}`);
    }
    const json = (await response.json());
    return json.data ?? [];
}
// =============================================================================
// Catalog conversion
// =============================================================================
/** Convert kenari micro-IDR-per-1M-token rates to pi's USD-per-1M-token ModelCost. */
export function microIdrCost(pricing) {
    const rate = (v) => typeof v === "number" && Number.isFinite(v)
        ? v * MICRO_IDR_PER_1M_TO_USD_PER_1M
        : 0;
    const input = rate(pricing.input);
    return {
        input,
        output: rate(pricing.output),
        cacheRead: rate(pricing.cache_read),
        // kenari bills cache-write at the input rate when no own rate is set.
        cacheWrite: rate(pricing.cache_write ?? pricing.input),
    };
}
/**
 * Map kenari's `reasoning_options` onto omp's {@link ThinkingConfig}.
 *
 * kenari reports the efforts a model accepts as plain strings in a fixed
 * ladder. omp wants an ordered `efforts` list plus an `effortMap` from each
 * user-facing effort to the wire value, and it drops the model's thinking
 * surface entirely when the list would be empty — so an unknown option set
 * returns `undefined` rather than a config that advertises nothing.
 *
 * `minimal` is clamped to the lowest effort the model actually supports, since
 * kenari has no separate minimal rung.
 */
function toThinkingConfig(options) {
    if (!options || options.length === 0)
        return undefined;
    // omp's `Effort` is a const enum over exactly these wire strings. Declaring
    // the ladder as `Effort[]` keeps `efforts` correctly typed without turning the
    // runtime strings into enum member access (the enum erases at compile time and
    // would break under `isolatedModules`).
    const ladder = [
        "low",
        "medium",
        "high",
        "xhigh",
        "max",
    ];
    const supported = ladder.filter((l) => options.includes(l));
    if (supported.length === 0)
        return undefined;
    const lowest = supported[0];
    /** Highest supported rung at or below `level`, else the lowest rung. */
    const clamp = (level) => {
        const rank = ladder.indexOf(level);
        if (rank === -1)
            return lowest; // minimal -> lowest supported option
        for (let i = rank; i >= 0; i--) {
            const candidate = ladder[i];
            if (candidate && options.includes(candidate))
                return candidate;
        }
        return lowest;
    };
    const effortMap = {
        // kenari translates reasoning_effort "none" to the backend's native off.
        minimal: clamp("minimal"),
    };
    for (const level of ladder) {
        effortMap[level] = clamp(level);
    }
    return {
        // kenari takes the effort as `reasoning_effort` on an OpenAI-compatible body.
        mode: "effort",
        efforts: supported,
        effortMap,
    };
}
/** Convert a kenari API model to a pi-ai Model. */
export function toKenariModel(apiModel) {
    const id = apiModel.id;
    if (!id)
        return null;
    const isFree = id.endsWith(":free") || apiModel.pricing?.free === true;
    const reasoning = apiModel.reasoning ?? false;
    const inputs = apiModel.modalities?.input ?? ["text"];
    const model = {
        id,
        name: apiModel.name ?? id,
        api: "openai-completions",
        provider: PROVIDER_KENARI,
        baseUrl: BASE_URL_KENARI,
        reasoning,
        ...(reasoning && {
            thinking: toThinkingConfig(apiModel.reasoning_options),
        }),
        input: inputs.includes("image")
            ? ["text", "image"]
            : ["text"],
        // :free entries carry the paid rates in the catalog but are billed Rp 0.
        cost: isFree
            ? { ...ZERO_COST }
            : apiModel.pricing
                ? microIdrCost(apiModel.pricing)
                : { ...ZERO_COST },
        contextWindow: apiModel.context_length ?? 131072,
        // Catalog exposes no max-output field; reasoning traces bill against
        // max_tokens, so use a generous cap (see kenari docs
        // "Small max_tokens and empty output").
        maxTokens: 65536,
        compat: KENARI_COMPAT,
        isFree,
    };
    return model;
}
/** Convert a catalog of kenari API models to pi-ai Models. */
export function toKenariModels(apiModels) {
    const models = [];
    for (const apiModel of apiModels) {
        const model = toKenariModel(apiModel);
        if (model)
            models.push(model);
    }
    return models;
}
// =============================================================================
// Model discovery (called by omp via `fetchDynamicModels`)
// =============================================================================
/**
 * Discover the chat catalog for omp's `fetchDynamicModels` hook.
 *
 * omp calls this with the resolved API key and caches the result in its SQLite
 * model store, so there is no `RefreshModelsContext` to thread through: no
 * `allowNetwork` flag, no `stored` snapshot, no `publish` callback. The key is
 * unused — kenari's catalog endpoint is public — but the signature is fixed by
 * the contract.
 *
 * Failures never throw: an unreachable catalog degrades to the static baseline,
 * so an offline start still has working models.
 */
export async function fetchKenariDynamicModels(_apiKey) {
    try {
        const apiModels = await fetchKenariModels();
        const models = toKenariModels(apiModels);
        // The built-in route is not a catalog model; keep it available.
        if (!models.some((m) => m.id === KENARI_FREE_ROUTE_MODEL.id)) {
            models.unshift(KENARI_FREE_ROUTE_MODEL);
        }
        return models.length > 0 ? models : KENARI_BASELINE_MODELS;
    }
    catch {
        return KENARI_BASELINE_MODELS;
    }
}
/** Get the baseline models for offline init. */
export function getKenariBaselineModels() {
    return KENARI_BASELINE_MODELS;
}

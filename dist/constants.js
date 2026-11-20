/**
 * Shared constants for omp-kenari-provider.
 */
export const PROVIDER_KENARI = "kenari";
/**
 * Base URL for kenari's OpenAI-compatible surface: chat completions, images,
 * embeddings and rerank all live under `/v1`, and omp's transports append their
 * own path (`/chat/completions`, `/images/generations`, `/embeddings`,
 * `/rerank`) to whatever base they are given.
 */
export const BASE_URL_KENARI = "https://kenari.id/v1";
/**
 * Base URL for kenari's System One surface, which omp's `typesafe` judge wire
 * drives as `{baseUrl}/v1/systemone`.
 *
 * This is the *origin*, with no `/v1`, and it cannot be the same string as
 * {@link BASE_URL_KENARI}: that one already ends in `/v1`, so reusing it would
 * request `/v1/v1/systemone`. Judge models therefore carry their own per-model
 * `baseUrl` while every chat and image model carries the `/v1` one.
 */
export const BASE_URL_KENARI_ORIGIN = "https://kenari.id";
/** Free image model the `generate_image` tool falls back to. */
export const DEFAULT_IMAGE_MODEL = "agnes-image-2-5-flash:free";
export const KENARI_API_KEY_ENV = "KENARI_API_KEY";
/**
 * kenari prices are micro-IDR per 1M tokens; omp's ModelCost is USD per 1M
 * tokens. USD/1M = micro-IDR / (1e6 * IDR-per-USD).
 */
// ponytail: fixed FX rate, retune when IDR/USD moves materially
export const KENARI_IDR_PER_USD = 16_500;
/** micro-IDR per 1M tokens -> USD per 1M tokens. */
export const MICRO_IDR_PER_1M_TO_USD_PER_1M = 1 / (1_000_000 * KENARI_IDR_PER_USD);

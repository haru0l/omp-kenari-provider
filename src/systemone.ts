/**
 * System One models for kenari, registered as omp `judge` models.
 *
 * kenari's System One endpoint (`POST /v1/systemone`) speaks TypeSafe's native
 * protocol, and omp's built-in `typesafe` runner API drives exactly that wire.
 * Registering these models with `api: "typesafe"` and `kind: "judge"` puts them
 * in omp's `judge` model role, so `judge_batch`, jfind's cascade ranking and
 * every other consumer of the judge chain can select a kenari model without
 * knowing anything about kenari.
 *
 * The models come from `GET /v1/models?modality=systemone` — they are absent
 * from the bare chat catalog.
 *
 * Base URL note: the `typesafe` wire targets `{baseUrl}/v1/systemone`, so these
 * models carry {@link BASE_URL_KENARI_ORIGIN} — the origin, without `/v1` —
 * while chat and image models carry the `/v1` base. See constants.ts.
 */

import type { Model, ModelSpec, ThinkingConfig } from "@oh-my-pi/pi-ai";
import {
  BASE_URL_KENARI_ORIGIN,
  MICRO_IDR_PER_1M_TO_USD_PER_1M,
  PROVIDER_KENARI,
} from "./constants.js";
import { fetchKenariModelsByModality } from "./models.js";
import type { KenariApiModel } from "./types.js";

/**
 * omp's built-in TypeSafe System One runner; kenari's endpoint is wire-compatible.
 *
 * A model declared with this api serves exactly one kind — `judge` — and omp
 * rejects a static `models` entry whose `kind` its api cannot serve. The pair is
 * therefore always `api: "typesafe"` with `kind: "judge"`.
 */
export const KENARI_SYSTEMONE_API = "typesafe";

/**
 * kenari's catalog carries no `context_length` for System One entries. TypeSafe
 * runs the same models with a 64k window, and kenari enforces its own limits.
 */
const SYSTEMONE_CONTEXT_WINDOW = 64_000;

/** System One models bill input tokens only; nothing is generated. */
const SYSTEMONE_OUTPUT_COST = 0;

/**
 * ollama: this is an omp judge model, not a chat model.
 *
 * `kind: "judge"` is what routes it into the `judge` model role; omp derives
 * that from the api when `kind` is absent, but this type states it explicitly so
 * a stale api/kind pair can never be carried through unnoticed.
 */
export interface KenariSystemOneModel extends ModelSpec<typeof KENARI_SYSTEMONE_API> {
  kind: "judge";
  /** Whether this is a :free variant (no balance deducted). */
  isFree?: boolean;
  /**
   * The catalog's own input rate, micro-Rupiah per 1M tokens, kept alongside
   * `cost` so model choice can quote the price in the currency kenari bills.
   */
  inputMicroIdr?: number;
}

/**
 * Shape of a judge entry in `ProviderConfig.models`.
 *
 * omp's `ProviderModelConfig` is a flat shape with an optional `kind` — there is
 * no `type` discriminator and no per-kind variant type. `baseUrl` is required
 * here rather than optional because judge models must carry the origin base,
 * not the provider-level `/v1` one.
 */
export interface KenariSystemOneModelConfig {
  id: string;
  name: string;
  api: typeof KENARI_SYSTEMONE_API;
  kind: "judge";
  baseUrl: string;
  input: ("text" | "image")[];
  cost: KenariSystemOneModel["cost"];
  contextWindow: number;
  maxTokens: number;
}

/** Convert kenari micro-IDR-per-1M-token input pricing to pi's USD ModelCost. */
function systemOneCost(
  pricing: KenariApiModel["pricing"],
): KenariSystemOneModel["cost"] {
  const input =
    typeof pricing?.input === "number" && Number.isFinite(pricing.input)
      ? pricing.input * MICRO_IDR_PER_1M_TO_USD_PER_1M
      : 0;
  return {
    input,
    output: SYSTEMONE_OUTPUT_COST,
    cacheRead: 0,
    cacheWrite: 0,
  };
}

/** The catalog input rate in micro-Rupiah per 1M tokens, when it quotes one. */
function microInputRate(
  pricing: KenariApiModel["pricing"],
): number | undefined {
  const input = pricing?.input;
  return typeof input === "number" && Number.isFinite(input)
    ? input
    : undefined;
}

/**
 * A paid baseline entry's rate, in both pi's USD `cost` and the catalog's own
 * micro-IDR, so the two never drift apart in the static list.
 */
function paidRate(
  microIdr: number,
): Pick<KenariSystemOneModel, "cost" | "inputMicroIdr"> {
  return { cost: systemOneCost({ input: microIdr }), inputMicroIdr: microIdr };
}

/**
 * Model families that answer `fields` extraction only and reject `questions`.
 *
 * This build has no `fields` mode, and a `typesafe` judge only sends
 * `questions`, so such a model would 400 on every judge call. kenari still
 * lists `clairic:free` in the live catalog, so it is filtered out of both the
 * judge list and the model-choice catalog rather than offered and failing.
 */
function isFieldsOnly(id: string): boolean {
  return id.startsWith("clairic");
}

/** Convert a kenari `?modality=systemone` entry to an omp judge model. */
export function toKenariSystemOneModel(
  apiModel: KenariApiModel,
): KenariSystemOneModel | null {
  const id = apiModel.id;
  if (!id || isFieldsOnly(id)) return null;

  const isFree = id.endsWith(":free") || apiModel.pricing?.free === true;
  // A typesafe judge carries text and image; audio and video stay with the tool.
  const supportsImage = apiModel.modalities?.input?.includes("image") ?? false;
  const microInput = microInputRate(apiModel.pricing);

  return {
    id,
    name: apiModel.name ?? id,
    api: KENARI_SYSTEMONE_API,
    kind: "judge",
    provider: PROVIDER_KENARI,
    // The typesafe wire appends `/v1/systemone`, so this base is the origin.
    baseUrl: BASE_URL_KENARI_ORIGIN,
    reasoning: false,
    input: supportsImage ? ["text", "image"] : ["text"],
    cost: isFree
      ? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      : systemOneCost(apiModel.pricing),
    contextWindow: apiModel.context_length ?? SYSTEMONE_CONTEXT_WINDOW,
    maxTokens: SYSTEMONE_OUTPUT_COST,
    isFree,
    ...(microInput !== undefined && { inputMicroIdr: microInput }),
  };
}

/** Convert a System One catalog to omp judge models, dropping non-questions models. */
export function toKenariSystemOneModels(
  apiModels: KenariApiModel[],
): KenariSystemOneModel[] {
  const models: KenariSystemOneModel[] = [];
  for (const apiModel of apiModels) {
    const model = toKenariSystemOneModel(apiModel);
    if (model) models.push(model);
  }
  return models;
}

/**
 * Convert judge models to the configs `registerProvider` accepts.
 *
 * Every field here is load-bearing on the omp side: `api: "typesafe"` selects
 * the System One wire, `kind: "judge"` routes the model into the judge role,
 * and `baseUrl` must be the origin because that wire appends `/v1/systemone`.
 * omp fails `registerProvider` outright when a static entry's `kind` is not one
 * its `api` serves, so an api/kind mismatch is a startup error, not a silent one.
 */
export function toProviderJudgeConfigs(
  models: KenariSystemOneModel[],
): KenariSystemOneModelConfig[] {
  return models.map((m) => ({
    id: m.id,
    name: m.name,
    api: m.api,
    kind: "judge" as const,
    baseUrl: m.baseUrl,
    input: m.input,
    cost: m.cost,
    contextWindow: m.contextWindow ?? SYSTEMONE_CONTEXT_WINDOW,
    // Required by omp's model config shape. A judge generates no tokens, so the
    // output budget is 0: there is nothing for the model to emit.
    maxTokens: SYSTEMONE_OUTPUT_COST,
  }));
}

// =============================================================================
// Baseline catalog (offline fallback)
// =============================================================================

/**
 * Static baseline, mirroring the live `?modality=systemone` catalog.
 */
export const KENARI_SYSTEMONE_BASELINE_MODELS: KenariSystemOneModel[] = [
  {
    id: "clef:free",
    name: "Clef",
    api: KENARI_SYSTEMONE_API,
    kind: "judge",
    provider: PROVIDER_KENARI,
    baseUrl: BASE_URL_KENARI_ORIGIN,
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: SYSTEMONE_CONTEXT_WINDOW,
    maxTokens: SYSTEMONE_OUTPUT_COST,
    isFree: true,
  },
  {
    id: "clef",
    name: "Clef",
    api: KENARI_SYSTEMONE_API,
    kind: "judge",
    provider: PROVIDER_KENARI,
    baseUrl: BASE_URL_KENARI_ORIGIN,
    reasoning: false,
    input: ["text"],
    ...paidRate(3_000_000_000),
    contextWindow: SYSTEMONE_CONTEXT_WINDOW,
    maxTokens: SYSTEMONE_OUTPUT_COST,
    isFree: false,
  },
  {
    id: "clef-flash:free",
    name: "Clef Flash",
    api: KENARI_SYSTEMONE_API,
    kind: "judge",
    provider: PROVIDER_KENARI,
    baseUrl: BASE_URL_KENARI_ORIGIN,
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: SYSTEMONE_CONTEXT_WINDOW,
    maxTokens: SYSTEMONE_OUTPUT_COST,
    isFree: true,
  },
  {
    id: "clef-omni:free",
    name: "Clef Omni",
    api: KENARI_SYSTEMONE_API,
    kind: "judge",
    provider: PROVIDER_KENARI,
    baseUrl: BASE_URL_KENARI_ORIGIN,
    reasoning: false,
    // Audio and video are dropped: a typesafe judge carries text and image only.
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: SYSTEMONE_CONTEXT_WINDOW,
    maxTokens: SYSTEMONE_OUTPUT_COST,
    isFree: true,
  },
  {
    id: "jev-1-13",
    name: "Jev 1.13",
    api: KENARI_SYSTEMONE_API,
    kind: "judge",
    provider: PROVIDER_KENARI,
    baseUrl: BASE_URL_KENARI_ORIGIN,
    reasoning: false,
    input: ["text"],
    ...paidRate(850_000_000),
    contextWindow: SYSTEMONE_CONTEXT_WINDOW,
    maxTokens: SYSTEMONE_OUTPUT_COST,
    isFree: false,
  },
  {
    id: "jev-1-14",
    name: "Jev 1.14",
    api: KENARI_SYSTEMONE_API,
    kind: "judge",
    provider: PROVIDER_KENARI,
    baseUrl: BASE_URL_KENARI_ORIGIN,
    reasoning: false,
    input: ["text", "image"],
    ...paidRate(850_000_000),
    contextWindow: SYSTEMONE_CONTEXT_WINDOW,
    maxTokens: SYSTEMONE_OUTPUT_COST,
    isFree: false,
  },
];

/** Get the baseline System One judge models for offline init. */
export function getKenariSystemOneBaselineModels(): KenariSystemOneModel[] {
  return KENARI_SYSTEMONE_BASELINE_MODELS;
}


// =============================================================================
// Discovery
// =============================================================================

/** Fetch the System One catalog (public, no key needed). */
export async function fetchKenariSystemOneModels(
  signal?: AbortSignal,
): Promise<KenariSystemOneModel[]> {
  const apiModels = await fetchKenariModelsByModality("systemone", signal);
  return toKenariSystemOneModels(apiModels);
}

/**
 * Discover the System One judge models for omp's `fetchDynamicModels` hook.
 *
 * The key is unused — the catalog endpoint is public — but the signature is
 * fixed by the contract. A failed fetch degrades to the static baseline, so an
 * offline start still offers judge models.
 */
export async function fetchKenariSystemOneDynamicModels(
  _apiKey: string | undefined,
): Promise<KenariSystemOneModel[]> {
  try {
    const apiModels = await fetchKenariModelsByModality("systemone");
    const models = toKenariSystemOneModels(apiModels);
    return models.length > 0 ? models : KENARI_SYSTEMONE_BASELINE_MODELS;
  } catch {
    return KENARI_SYSTEMONE_BASELINE_MODELS;
  }
}

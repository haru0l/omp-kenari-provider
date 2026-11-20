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
import type { ModelSpec } from "@oh-my-pi/pi-ai";
import type { KenariApiModel } from "./types.js";
/**
 * omp's built-in TypeSafe System One runner; kenari's endpoint is wire-compatible.
 *
 * A model declared with this api serves exactly one kind — `judge` — and omp
 * rejects a static `models` entry whose `kind` its api cannot serve. The pair is
 * therefore always `api: "typesafe"` with `kind: "judge"`.
 */
export declare const KENARI_SYSTEMONE_API = "typesafe";
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
/** Convert a kenari `?modality=systemone` entry to an omp judge model. */
export declare function toKenariSystemOneModel(apiModel: KenariApiModel): KenariSystemOneModel | null;
/** Convert a System One catalog to omp judge models, dropping non-questions models. */
export declare function toKenariSystemOneModels(apiModels: KenariApiModel[]): KenariSystemOneModel[];
/**
 * Convert judge models to the configs `registerProvider` accepts.
 *
 * Every field here is load-bearing on the omp side: `api: "typesafe"` selects
 * the System One wire, `kind: "judge"` routes the model into the judge role,
 * and `baseUrl` must be the origin because that wire appends `/v1/systemone`.
 * omp fails `registerProvider` outright when a static entry's `kind` is not one
 * its `api` serves, so an api/kind mismatch is a startup error, not a silent one.
 */
export declare function toProviderJudgeConfigs(models: KenariSystemOneModel[]): KenariSystemOneModelConfig[];
/**
 * Static baseline, mirroring the live `?modality=systemone` catalog.
 */
export declare const KENARI_SYSTEMONE_BASELINE_MODELS: KenariSystemOneModel[];
/** Get the baseline System One judge models for offline init. */
export declare function getKenariSystemOneBaselineModels(): KenariSystemOneModel[];
/** Fetch the System One catalog (public, no key needed). */
export declare function fetchKenariSystemOneModels(signal?: AbortSignal): Promise<KenariSystemOneModel[]>;
/**
 * Discover the System One judge models for omp's `fetchDynamicModels` hook.
 *
 * The key is unused — the catalog endpoint is public — but the signature is
 * fixed by the contract. A failed fetch degrades to the static baseline, so an
 * offline start still offers judge models.
 */
export declare function fetchKenariSystemOneDynamicModels(_apiKey: string | undefined): Promise<KenariSystemOneModel[]>;
//# sourceMappingURL=systemone.d.ts.map
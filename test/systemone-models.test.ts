import { describe, expect, it } from "vitest";
import {
  fetchKenariSystemOneDynamicModels,
  getKenariSystemOneBaselineModels,
  KENARI_SYSTEMONE_BASELINE_MODELS,
  toKenariSystemOneModel,
  toKenariSystemOneModels,
  toProviderJudgeConfigs,
} from "../src/systemone.js";
import type { KenariApiModel } from "../src/types.js";

/**
 * System One models are only ever registered as native omp `judge` models —
 * there is no `system_one` tool and no chat surface. These tests pin the three
 * things that make the registration work and fail silently if wrong:
 *
 *  - `api: "typesafe"` + `kind: "judge"` (omp rejects a kind its api cannot
 *    serve),
 *  - the bare origin `baseUrl`, because that wire appends `/v1/systemone`,
 *  - Clairic filtered out, because a judge only sends `questions` and Clairic
 *    answers `fields` only.
 */
function apiModel(overrides: Partial<KenariApiModel> = {}): KenariApiModel {
  return {
    id: "clef:free",
    name: "Clef",
    pricing: { currency: "IDR", free: true, input: null },
    modalities: { input: ["text", "image"] },
    endpoints: ["systemone"],
    ...overrides,
  };
}

describe("System One judge models", () => {
  it("maps a free image model to a judge model with zero cost", () => {
    const model = toKenariSystemOneModel(apiModel());
    expect(model).toMatchObject({
      id: "clef:free",
      api: "typesafe",
      kind: "judge",
      provider: "kenari",
      // The typesafe wire appends `/v1/systemone`, so the base is the origin.
      baseUrl: "https://kenari.id",
      input: ["text", "image"],
      isFree: true,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    });
  });

  it("keeps text-only models text-only", () => {
    const model = toKenariSystemOneModel(
      apiModel({
        id: "jev-1-13",
        name: "Jev 1.13",
        pricing: { input: 850_000_000 },
        modalities: { input: ["text"] },
      }),
    );
    expect(model?.input).toEqual(["text"]);
    expect(model?.isFree).toBe(false);
  });

  it("converts micro-IDR input pricing to USD per million tokens", () => {
    const model = toKenariSystemOneModel(
      apiModel({ id: "clef", pricing: { input: 3_000_000_000 } }),
    );
    // 3000 IDR per 1M tokens at 16500 IDR/USD.
    expect(model?.cost.input).toBeCloseTo(
      3_000_000_000 / (1_000_000 * 16_500),
      12,
    );
    expect(model?.cost.output).toBe(0);
    expect(model?.cost.cacheRead).toBe(0);
  });

  it("drops Clairic: a judge sends questions, which it rejects", () => {
    expect(toKenariSystemOneModel(apiModel({ id: "clairic:free" }))).toBeNull();
    const models = toKenariSystemOneModels([
      apiModel({ id: "clairic:free" }),
      apiModel({ id: "clef:free" }),
    ]);
    expect(models.map((m) => m.id)).toEqual(["clef:free"]);
  });

  it("falls back to a 64k context window when the catalog omits one", () => {
    expect(toKenariSystemOneModel(apiModel())?.contextWindow).toBe(64_000);
    expect(
      toKenariSystemOneModel(apiModel({ context_length: 32_000 }))
        ?.contextWindow,
    ).toBe(32_000);
  });

  it("ships a baseline of every questions-capable model", () => {
    const ids = getKenariSystemOneBaselineModels().map((m) => m.id);
    expect(ids).toEqual([
      "clef:free",
      "clef",
      "clef-flash:free",
      "clef-omni:free",
      "jev-1-13",
      "jev-1-14",
    ]);
    expect(ids.some((id) => id.startsWith("clairic"))).toBe(false);
    // clef-omni also reads audio and video; a typesafe judge carries text and image.
    const omni = KENARI_SYSTEMONE_BASELINE_MODELS.find(
      (m) => m.id === "clef-omni:free",
    );
    expect(omni?.input).toEqual(["text", "image"]);
  });

  it("registers judge configs with the api/kind pair omp requires", () => {
    const configs = toProviderJudgeConfigs(getKenariSystemOneBaselineModels());
    expect(configs).toHaveLength(6);
    expect(configs[0]).toMatchObject({
      id: "clef:free",
      api: "typesafe",
      kind: "judge",
      baseUrl: "https://kenari.id",
      contextWindow: 64_000,
    });
    // Every config must carry the pair; omp rejects a kind its api cannot serve.
    for (const config of configs) {
      expect(config.api).toBe("typesafe");
      expect(config.kind).toBe("judge");
    }
  });
});

describe("discovery", () => {
  it("degrades to the baseline when the catalog endpoint is unreachable", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as typeof fetch;

    try {
      const models = await fetchKenariSystemOneDynamicModels(undefined);
      expect(models.map((m) => m.id)).toEqual(
        KENARI_SYSTEMONE_BASELINE_MODELS.map((m) => m.id),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

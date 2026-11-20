import { describe, expect, it } from "vitest";
import register from "../src/index.js";

/**
 * Provider registration under omp's contract.
 *
 * Two things replaced pi's classifier machinery and are pinned here because
 * both fail silently rather than loudly:
 *
 *  1. omp has no `classifiers` map. System One models are registered as
 *     `kind: "judge"` models on the built-in `typesafe` api, which is what
 *     routes them into the judge role.
 *  2. The `typesafe` wire targets `{baseUrl}/v1/systemone`, while every other
 *     kenari surface lives under `/v1`. So judge models must carry the bare
 *     origin and chat models the `/v1` base — a single provider-level base
 *     cannot serve both.
 */
describe("provider registration", () => {
  interface CapturedModel {
    id: string;
    api?: string;
    kind?: string;
    baseUrl?: string;
    input: string[];
    cost: { input: number };
    contextWindow: number;
    maxTokens: number;
  }

  interface CapturedConfig {
    baseUrl?: string;
    api?: string;
    apiKey?: string;
    authHeader?: boolean;
    models: CapturedModel[];
    oauth?: unknown;
    fetchDynamicModels?: (apiKey: string | undefined) => Promise<unknown>;
    classifiers?: unknown;
    streamSimple?: unknown;
  }

  async function capture() {
    const providers: { id: string; config: CapturedConfig }[] = [];
    const tools: string[] = [];
    const omp = {
      registerProvider: (id: string, config: unknown) => {
        providers.push({ id, config: config as CapturedConfig });
      },
      registerTool: (tool: { name: string }) => {
        tools.push(tool.name);
      },
      on: () => {},
    };
    // The factory discovers catalogs up front; stay offline so it uses the
    // static baseline and the assertions below stay deterministic.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("offline in tests");
    }) as typeof fetch;
    try {
      await register(omp as never);
    } finally {
      globalThis.fetch = originalFetch;
    }
    return { providers, tools };
  }

  it("registers System One models as judge models on the typesafe api", async () => {
    const { providers } = await capture();
    const [provider] = providers;

    expect(provider?.id).toBe("kenari");

    const judgeModels = provider?.config.models.filter(
      (model) => model.kind === "judge",
    );
    expect(judgeModels?.length).toBeGreaterThan(0);

    // The api/kind pair is load-bearing: omp fails registerProvider when a
    // static entry's kind is not one its api serves.
    for (const model of judgeModels ?? []) {
      expect(model.api).toBe("typesafe");
      expect(model.kind).toBe("judge");
      // Judge models carry the origin, because the typesafe wire appends
      // `/v1/systemone` itself.
      expect(model.baseUrl).toBe("https://kenari.id");
    }
  });

  it("gives chat models the /v1 base so omp appends /chat/completions once", async () => {
    const { providers } = await capture();
    const chatModels =
      providers[0]?.config.models.filter((m) => m.kind !== "judge") ?? [];

    expect(chatModels.length).toBeGreaterThan(0);
    for (const model of chatModels) {
      expect(model.baseUrl).toBe("https://kenari.id/v1");
    }
  });

  it("does not use the pi-only registration surfaces or a dynamic model manager", async () => {
    const { providers } = await capture();
    const config = providers[0]?.config;

    // `classifiers` does not exist in omp; registering it is dead weight that
    // suggests a transport is wired when it is not.
    expect(config?.classifiers).toBeUndefined();
    // `openai-completions` is built into omp, so a custom stream is unnecessary
    // and would bypass omp's own retry and normalization layers.
    expect(config?.streamSimple).toBeUndefined();
    // Discovery runs in the factory, not through a dynamic model manager: one
    // provider cannot serve two base URLs once `fetchDynamicModels` installs
    // one (see the comment in src/index.ts).
    expect(config?.fetchDynamicModels).toBeUndefined();
  });

  it("names an env key but never builds the auth header itself", async () => {
    const { providers } = await capture();
    const config = providers[0]?.config;

    expect(config?.apiKey).toBe("KENARI_API_KEY");
    expect(config?.oauth).toBeDefined();

    // `authHeader: true` makes omp compose `Authorization: Bearer <apiKey>`
    // from the *literal* config string, so an unset env var ships
    // "Bearer KENARI_API_KEY" and every call 401s — bypassing the auth cascade
    // that holds the key saved by `/login kenari`. Leave header building to the
    // cascade.
    expect(config?.authHeader).toBeUndefined();
  });

  it("registers only the image and web-search tools", async () => {
    const { tools } = await capture();
    // System One is judge-model only: omp reaches it through the `judge` role,
    // so there is no system_one tool to register.
    expect(tools).not.toContain("system_one");
    expect(tools).toContain("generate_image");
    // Distinct from omp's built-in `web_search` on purpose.
    expect(tools).toContain("kenari_web_search");
    expect(tools).toHaveLength(2);
  });
});

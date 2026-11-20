import { afterEach, describe, expect, it, vi } from "vitest";
import { runSystemOne } from "../src/api/systemone.js";

describe("runSystemOne", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(body: unknown, status = 200) {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: status < 400,
      status,
      json: async () => body,
      text: async () =>
        typeof body === "string" ? body : JSON.stringify(body),
    }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("posts questions to /v1/systemone with the bearer key", async () => {
    const fetchMock = stubFetch({
      model: "clef:free",
      answers: { q: { type: "noul", noul: 0.98 } },
      usage: { input_tokens: 12, output_tokens: 0 },
    });

    const result = await runSystemOne({
      apiKey: "kn-test",
      model: "clef:free",
      state: "a cat sitting on a rug",
      questions: {
        q: { type: "noul", instructions: "Is this about an animal?" },
      },
    });

    expect(result.answers.q).toMatchObject({ type: "noul", noul: 0.98 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://kenari.id/v1/systemone");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer kn-test",
    );
    expect(JSON.parse(init.body as string)).toEqual({
      model: "clef:free",
      state: "a cat sitting on a rug",
      questions: {
        q: { type: "noul", instructions: "Is this about an animal?" },
      },
    });
  });

  it("sends an object state as its JSON text", async () => {
    const fetchMock = stubFetch({
      model: "clef:free",
      answers: { ok: { type: "noul", noul: 0.9 } },
      usage: { input_tokens: 12, output_tokens: 0 },
    });

    await runSystemOne({
      apiKey: "kn-test",
      model: "clef:free",
      state: { order: "INV-2291", total: 4_250_000 },
      questions: { ok: { type: "noul", instructions: "Above one million?" } },
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).state).toBe(
      '{"order":"INV-2291","total":4250000}',
    );
  });

  it("passes named questions and image assets through", async () => {
    const fetchMock = stubFetch({
      model: "clef:free",
      answers: { total: { type: "noul", noul: 0.99 } },
      usage: { input_tokens: 20, output_tokens: 0 },
    });

    await runSystemOne({
      apiKey: "kn-test",
      model: "clef:free",
      state: "Invoice INV-2291, issued 3 March 2026.",
      questions: { total: { type: "noul", instructions: "Is a total due?" } },
      assets: {
        invoice: { format: "png", data_base64: "iVBORw0KGgo=" },
      },
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sent = JSON.parse(init.body as string);
    expect(sent.questions).toEqual({
      total: { type: "noul", instructions: "Is a total due?" },
    });
    expect(sent.assets).toEqual({
      invoice: { format: "png", data_base64: "iVBORw0KGgo=" },
    });
    // The removed Clairic-only fields must never reach the wire.
    expect(sent).not.toHaveProperty("fields");
    expect(sent).not.toHaveProperty("reference_date");
    expect(sent).not.toHaveProperty("options");
    // the client-only apiKey must never reach the wire
    expect(sent).not.toHaveProperty("apiKey");
  });

  it("throws kenari's message on a rejected request", async () => {
    stubFetch('{"error":{"message":"state is required"}}', 400);

    await expect(
      runSystemOne({
        apiKey: "kn-test",
        model: "clef:free",
        questions: { q: { type: "noul", instructions: "yes?" } },
      }),
    ).rejects.toThrow(/systemone failed \(400\).*state is required/);
  });

  it("requires an api key", async () => {
    await expect(
      runSystemOne({ model: "clef:free", questions: {} }),
    ).rejects.toThrow(/API key required/);
  });
});

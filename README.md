# omp-kenari-provider

An [omp (oh-my-pi)](https://omp.sh) extension that registers [kenari](https://kenari.id) as a native AI provider.

kenari is an LLM gateway — one base URL (`https://kenari.id/v1`) speaks both the OpenAI Chat Completions API and the Anthropic Messages API, routes to many upstream providers, and bills in Indonesian Rupiah from a prepaid balance.

## Features

- **Dynamic model discovery** — fetches the full catalog from `GET /v1/models` (public, no key needed) through `fetchDynamicModels`
- **Dual wire formats** — supports both `openai-completions` and `anthropic-messages` APIs
- **:free models** — surfaces free-tier variants (e.g. `step-3-7-flash:free`) that deduct no balance
- **Image generation** — `POST /v1/images/generations` (OpenAI Images-compatible)
- **Embeddings** — `POST /v1/embeddings` (OpenAI Embeddings-compatible)
- **Rerank** — `POST /v1/rerank` (Cohere-style relevance ranking)
- **Moderations** — `POST /v1/moderations` (OpenAI Moderations-compatible)
- **System One as judge models** — every questions-capable System One model is registered as a native `kind: "judge"` model on omp's built-in `typesafe` api, so omp's `judge` role, `judge_batch` and jfind ranking can select a kenari model directly (no tool, no chat surface)
- **`generate_image` tool** — draws with kenari image models, renders the picture inline in the conversation, and saves the same bytes into the working directory
- **Specialized model discovery** — `GET /v1/models?modality=` for `embedding`, `rerank`, `moderation` and `systemone` models
- **Web search / fetch / X search** — `POST /v1/web/search`, `/v1/web/fetch` and `/v1/x/search`
- **API key auth** — via `KENARI_API_KEY` env var or `/login kenari`

## Installation

The package declares an `omp` manifest, so omp discovers it as an extension package:

```json
{
  "omp": {
    "extensions": ["./dist/index.js"]
  }
}
```

Or install from GitHub:

```bash
omp plugin install haru0l/omp-kenari-provider
```

## Authentication

Set your kenari API key (starts with `kn-`):

```bash
export KENARI_API_KEY=kn-...
```

Or run `/login kenari` in omp to store the key securely. A key saved by `/login` wins over the env var.

Get your key from the [kenari dashboard](https://kenari.id/login).

## Usage

Once authenticated, kenari models appear in `/models`:

```
kenari/step-3-7-flash:free    # Free tier
kenari/step-3-7-flash         # Paid from balance
```

Use them like any omp model:

```
> kenari/step-3-7-flash:free
Hello!
```

Judge models are separate from chat models and are selected through omp's `judge` role:

```
/model judge kenari/clef:free
```

## Base URLs, and why models carry their own

omp appends a path to whatever base URL a model is given, and kenari's two surfaces sit at different roots:

| Surface | Model base | omp appends | Final URL |
| --- | --- | --- | --- |
| Chat | `https://kenari.id/v1` | `/chat/completions` | `https://kenari.id/v1/chat/completions` |
| Images | `https://kenari.id/v1` | `/images/generations` | `https://kenari.id/v1/images/generations` |
| Embeddings | `https://kenari.id/v1` | `/embeddings` | `https://kenari.id/v1/embeddings` |
| Rerank | `https://kenari.id/v1` | `/rerank` | `https://kenari.id/v1/rerank` |
| Judge | `https://kenari.id` | `/v1/systemone` | `https://kenari.id/v1/systemone` |

One provider-level `baseUrl` cannot serve both, so every registered model carries its own. Judge models use the bare origin; everything else uses `/v1`. Getting this wrong requests `/v1/v1/systemone`, which is why it is stated explicitly and pinned by tests.

## System One

System One models answer bounded questions about state you supply. They are not chat models, so they never appear in `/model` — they are registered as omp **judge** models (`api: "typesafe"`, `kind: "judge"`).

Every questions-capable System One model (`clef:free`, `clef-flash:free`, `clef-omni:free`, `clef`, `jev-1-13`, `jev-1-14`) is registered with `api: "typesafe"` and `kind: "judge"`. omp's `typesafe` wire posts kenari's own `{ model, state, questions }` body to `{baseUrl}/v1/systemone`, so a kenari model answers every judgment omp routes through its `judge` role: `judge_batch`, jfind's cascade ranking, and anything else resolving the judge chain.

Select one:

```
/model judge kenari/clef:free
```

That is the whole integration — there is no tool to call. omp's judge role is the only entry point, which is also why nothing here defaults or validates model choice: pick the model in omp and omp runs it.

`clairic:free` is filtered out of the catalog: it answers `fields` extraction and rejects `questions`, which the `typesafe` wire only ever sends. Registering it would 400 on every judge call.

Nothing in omp can `classify()` — that was pi's API. The judge role replaced it.

## API

### `default(omp: ExtensionAPI)`

The extension entry point. Registers the kenari provider with omp.

### `fetchKenariDynamicModels(apiKey?: string): Promise<KenariModel[]>`

Discover and convert the kenari chat catalog. This is the function omp calls through the provider's `fetchDynamicModels` hook; a failed fetch degrades to the static baseline rather than throwing.

### `fetchKenariSystemOneDynamicModels(apiKey?: string): Promise<KenariSystemOneModel[]>`

Discover the System One catalog from `GET /v1/models?modality=systemone` and return it as omp judge models. A failed fetch degrades to the static baseline.

### `fetchKenariModels(signal?: AbortSignal): Promise<KenariApiModel[]>`

Fetch the raw model catalog from `GET /v1/models`.

### `fetchKenariModelsByModality(modality, signal?: AbortSignal): Promise<KenariApiModel[]>`

Fetch models filtered by modality — `embedding`, `rerank`, `moderation` or `systemone` (`KenariModality`). Any other value returns 400. The call is public (no key needed) and returns `modality` and `pricing_lines` on each entry. These models are never part of the bare `/v1/models` chat catalog, so they do not appear in omp's `/models` list; use this to discover them programmatically.

### `generateImages(options: KenariImageGenerateOptions): Promise<KenariImageResponse>`

Generate images via `POST /v1/images/generations`.

Images come back base64-encoded in `data[]`, as `b64_json` or as a `data:` URI in `url`. kenari reports failures as `{ error: { message } }`, so the thrown error carries that message rather than the raw body.

### `generateImageBytes(options: KenariImageGenerateOptions): Promise<KenariImageAsset[]>`

The same call, decoded: returns `{ bytes, mimeType, revisedPrompt? }` per image, preferring `b64_json` and falling back to a `data:` URI. `decodeImage(data)` is exported for when you already have the response.

```ts
const [image] = await generateImageBytes({
  apiKey,
  model: "gpt-image-2",
  prompt: "a red panda writing code",
  n: 1,
  size: "1024x1024",
});
await writeFile("image.png", image.bytes);
```

### `createEmbeddings(options: KenariEmbeddingOptions): Promise<KenariEmbeddingResponse>`

Create embeddings via `POST /v1/embeddings`.

### `rerankDocuments(options: KenariRerankOptions): Promise<KenariRerankResponse>`

Rank documents by relevance via `POST /v1/rerank`.

### `moderateContent(options: KenariModerationOptions): Promise<KenariModerationResponse>`

Moderate content via `POST /v1/moderations`.

### System One judge models

`getKenariSystemOneBaselineModels()` returns the six questions-capable System One models, and `fetchKenariSystemOneDynamicModels(apiKey)` fetches them live from `GET /v1/models?modality=systemone`. `toProviderJudgeConfigs()` turns either list into the `api: "typesafe"`, `kind: "judge"` entries the provider registers, so they are selectable through omp's `judge` role and never appear in `/model`.

Every judge entry carries the origin base URL (`https://kenari.id`, no `/v1`) because omp's `typesafe` wire appends `/v1/systemone` itself. `clairic:free` is filtered out: it answers `fields` extraction and rejects `questions`, which the `typesafe` wire only ever sends.

Costs come from kenari's catalog input rate, converted to USD per 1M tokens; a judge bills input tokens only.

### `generateImageTool` / `generate_image`

Draws through `POST /v1/images/generations` and does the two things the tool is
there for: it returns the bytes as image content blocks, so the picture renders
in the conversation, and it writes them into the working directory so later
steps can reference a path. Files are written with the `wx` flag and a numeric
suffix on collision, so nothing is ever overwritten; `output` names the first
file and extra images from `n > 1` get `-2`, `-3`.

It defaults to the free `agnes-image-2-5-flash:free`. `generateImageBytes()` and
`decodeImage()` stay exported for code that wants the bytes without the file
write.

### `webSearch(options: KenariWebSearchOptions): Promise<KenariWebSearchResponse>`

Search the web via `POST /v1/web/search` — `{ query, max_results? }`, with kenari defaulting `max_results` to 5. Returns `results[]` of `{ title, url, content }` alongside kenari's `id` and `cost_micro_idr`.

```ts
const { results } = await webSearch({
  apiKey,
  query: "latest stable Rust release",
  max_results: 5,
});
```

### `webFetch(options: KenariWebFetchOptions): Promise<KenariWebFetchResponse>`

Read one page via `POST /v1/web/fetch` — `{ url }` in, `{ title, content, links }` out, with the content already extracted from the HTML.

### `xSearch(options: KenariXSearchOptions): Promise<KenariXSearchResponse>`

Answer a question from X posts via `POST /v1/x/search` — `{ query, x_search_filter? }` in, `{ answer, citations }` out. The filter narrows the corpus with `from_date` / `to_date` and `allowed_x_handles` / `excluded_x_handles`:

```ts
const { answer, citations } = await xSearch({
  apiKey,
  query: "reactions to the latest Rust release",
  x_search_filter: { from_date: "2026-01-01", allowed_x_handles: ["rustlang"] },
});
```

The web and X endpoints are kenari's own, not [OI] shapes, and none of them need a model id — so they never show up in `GET /v1/models`.

## Development

```bash
npm install
npm run build     # esbuild bundle + tsc declarations
npm run check     # typecheck
npm run lint      # biome
npm test          # vitest
```

## License

MIT

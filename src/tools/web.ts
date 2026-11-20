/**
 * `kenari_web_search` tool: ranked web results from kenari's own
 * `POST /v1/web/search`.
 *
 * Named `kenari_web_search` rather than `web_search` on purpose — pi ships a
 * built-in `web_search`, and registering a second tool under that name either
 * collides at load or shadows the built-in one. The prefix also makes it
 * obvious in a transcript which search backend produced the result.
 *
 * Credentials come from the model registry, exactly like `generate_image`: the
 * key stored by `/login kenari` is the same one the chat models use, so there
 * is no separate secret to configure.
 */
import type { ToolDefinition } from "@oh-my-pi/pi-coding-agent";
import { Type } from "@oh-my-pi/omptype/typebox";
import { withDeadline } from "../api/http.js";
import { webSearch } from "../api/web.js";
import { PROVIDER_KENARI } from "../constants.js";
import type { KenariWebSearchResult } from "../types.js";

/** Search is a single HTTP round trip; a long tail is a hung request. */
const SEARCH_TIMEOUT_MS = 30_000;

const kenariWebSearchParams = Type.Object({
  query: Type.String({
    description:
      "The search query. State the subject and any constraints (place, date, version) explicitly; the search engine does not see the conversation.",
  }),
  max_results: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 10,
      description: "How many results to return. Defaults to 5.",
    }),
  ),
});

export interface KenariWebSearchDetails {
  query: string;
  results: KenariWebSearchResult[];
  /** What kenari billed for the search, when it reports it. */
  costMicroIdr?: number;
  requestId?: string;
}


/** One numbered block per result: title, url, then the snippet. */
function renderResults(results: KenariWebSearchResult[]): string {
  return results
    .map((result, index) => {
      const lines = [`${index + 1}. ${result.title || "(untitled)"}`];
      lines.push(`   ${result.url}`);
      const snippet = result.content.trim();
      if (snippet !== "") {
        lines.push(
          ...snippet
            .split("\n")
            .map((line) => `   ${line}`)
            .slice(0, 20),
        );
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

export const kenariWebSearchTool: ToolDefinition<
  typeof kenariWebSearchParams,
  KenariWebSearchDetails
> = {
  name: "kenari_web_search",
  label: "Kenari Web Search",

  // omp defaults a non-builtin tool name to "discoverable", which hides it from
  // the top-level tool list. "essential" keeps it advertised every session so
  // the model reaches for it without having to discover it first.
  loadMode: "essential",

  description:
    "Search the live web through kenari's web search endpoint and return ranked results with titles, URLs and snippets. " +
    "Use it when the answer depends on current information the model cannot know: news, prices, weather, releases, documentation that may have changed. " +
    "It returns snippets, not full pages — search first, then fetch a promising URL when the snippet is not enough. " +
    "Pass the query the way a search engine wants it: concrete terms (place names, dates, versions), not a sentence explaining what you want. " +
    "Do not repeat the same query hoping for a different answer; refine the terms instead. " +
    "Cite the URLs you actually used, and say which claims came from the search rather than from the model's own knowledge.",

  parameters: kenariWebSearchParams,

  async execute(_toolCallId, params, signal, _onUpdate, ctx) {
    const query = params.query.trim();
    if (query === "") {
      throw new Error(
        'kenari_web_search: "query" is required and cannot be empty.',
      );
    }

    const apiKey =
      await ctx.modelRegistry.getApiKeyForProvider(PROVIDER_KENARI);
    if (!apiKey) {
      throw new Error(
        'kenari_web_search: no kenari credentials. Run "/login kenari" or set KENARI_API_KEY.',
      );
    }

    const response = await webSearch({
      query,
      apiKey,
      signal: withDeadline(signal, SEARCH_TIMEOUT_MS),
      ...(params.max_results !== undefined
        ? { max_results: params.max_results }
        : {}),
    });

    const results = response.results ?? [];
    if (results.length === 0) {
      return {
        content: [{ type: "text", text: `No results for "${query}".` }],
        details: {
          query,
          results: [],
          ...(response.cost_micro_idr !== undefined
            ? { costMicroIdr: response.cost_micro_idr }
            : {}),
          ...(response.id !== undefined ? { requestId: response.id } : {}),
        },
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `${results.length} result${
            results.length === 1 ? "" : "s"
          } for "${query}":\n\n${renderResults(results)}`,
        },
      ],
      details: {
        query,
        results,
        ...(response.cost_micro_idr !== undefined
          ? { costMicroIdr: response.cost_micro_idr }
          : {}),
        ...(response.id !== undefined ? { requestId: response.id } : {}),
      },
    };
  },
};

# System One contract reference

`POST https://kenari.id/v1/systemone` — kenari's own decision and extraction
contract. The `system_one` tool wraps it, resolves credentials, and prices the
call. Read this when you need exact shapes rather than the everyday patterns in
`SKILL.md`.

## Limits

| Thing | Limit |
| --- | --- |
| `questions` | 128 per call |
| `assets` | 16 images per call |
| Image formats | PNG, JPEG (`png`, `jpg`, `jpeg`) |
| Audio | up to 4 clips, 8 MiB each |
| Video | up to 2 files, 16 MiB each |

`state` is required: everything the judge may look at has to be in `state` or
in an image asset.

## Question types

### `noul` — yes/no

```json
{ "type": "noul", "instructions": "Does this diff change the public API?" }
```

Answer: `{ "type": "noul", "noul": 0.87 }` — `noul` is the probability that the
answer is yes, and it is the only uncertainty signal: a `noul` answer carries no
`confidence` field. `criteria` is usually omitted; when you do send it, make it
an object naming both outcomes, e.g. `{ "true": "changes the public API",
"false": "internal only" }`.

### `choice` — one of several unordered options

```json
{
  "type": "choice",
  "instructions": "Which component owns this failure?",
  "criteria": { "gateway": "request routing and auth", "worker": "job execution", "db": "storage layer" }
}
```

Answer: `{ "type": "choice", "choice": "worker", "probabilities": { "worker": 0.72, "gateway": 0.2, "db": 0.08 } }`.

Option keys are what come back in `choice`. Use an object when each option needs
a description, an array when the names speak for themselves.

### `score` — ordered scale or rubric

```json
{
  "type": "score",
  "instructions": "How risky is this migration?",
  "criteria": ["safe", "reversible", "needs a backfill", "data loss possible"]
}
```

Answer: `{ "type": "score", "score": 1.67, "legend": { "0": "safe", "1": "reversible", "2": "needs a backfill", "3": "data loss possible" }, "probabilities": { ... } }`.

`score` is a position in the ordered `criteria` and it is **fractional** — 1.67
sits two thirds of the way from `reversible` to `needs a backfill`. Read `legend` to turn the
number back into a label, and never report the bare number to the user.

### `box` — locate something in an image

```json
{ "type": "box", "instructions": "Locate the signature line in image receipt." }
```

Takes no `criteria`; the image must be in `assets` and cited in `instructions`.

Answer: `{ "type": "box", "box": { "top": 0.71, "bottom": 0.78, "left": 0.12, "right": 0.63 } }`
— every edge is a fraction of image width/height, 0–1, not pixels.


Answer: `{ "type": "field", "value": 42000, "guess": 42000, "p_null": 0.02, "confidence": 0.95, "span": [12, 24] }`.

- `value` is `null` when the input does not determine the field; `guess` holds
  the best candidate anyway.
- `p_null` is the probability that the field genuinely is not there.
- `span` (text) / `spans` (list) index into `state`, so you can quote the source.
- `options.include_quantiles` adds 99 percentiles to estimates;
  `options.return_state_text` returns the text the spans refer to.

## Models

| Id | Accepts | Pricing |
| --- | --- | --- |
| `clef:free` | text, image | free |
| `clef-flash:free` | text, image | free |
| `clef-omni:free` | text, image, audio, video | free |
| `clef` | text | paid, per input token |
| `jev-1-13` | text | paid, per input token |
| `jev-1-14` | text, image | paid, per input token |

`clef` and `jev-1-13` are **text-only**: they cannot read `assets`. The tool
rejects an image sent to either before the request leaves.

`system_one` with `{"action": "models"}` prints this list with live prices and
the default model; prefer it over this table, which can go stale.

The live list is `GET https://kenari.id/v1/models?modality=systemone`; the
provider also registers every questions-capable model as an omp judge model
(`api: "typesafe"`, `kind: "judge"`), so the same endpoint answers everything
omp routes through its `judge` role once one is selected.

## Errors

The endpoint answers non-2xx with a JSON `error` message; the tool rethrows it as
`kenari systemone failed (<status>): <message>`. Common causes:

- `401` — missing or wrong key. Run `/login kenari` or set `KENARI_API_KEY`.
- `400` unknown question type — check the type names above.
- `400` oversized asset — compress or downscale the image before sending.

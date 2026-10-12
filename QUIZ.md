# Quiz (/quiz/)

Page: `quiz/index.html` + `quiz/app.js` (vanilla JS) + `quiz/quiz.css`. `noindex`, not linked from the site.
`quiz/mockup.html` is the approved design reference; it is listed in `.assetsignore` and not served.
Worker/server files are listed in `.assetsignore` too, so only the page assets are published.

## Flow

hero → Q1 industry ("אחר" opens a required text field) → Q2 size → Q3 channels (max 2) → Q4 acquisition →
Q5 time sink + hours (one screen) → Q6 free text (280 chars, "דלג" allowed) → contact → analysis → result.
Answers, contact fields and the result persist in `localStorage` (key `ensemble-quiz-v1`). `/quiz/?reset` clears them.

## Endpoints (worker/index.js)

- `POST /api/analyze` — `{ stage: "partial"|"complete", session_id: uuid, answers, contact?, utm, device, website: "" }`
  - `website` is the honeypot: if filled, responds `{ok:true}` and stores nothing.
  - `partial` (sent from Q3 on): anonymous row, `status=partial`, no outreach. Limit 60/hour/IP. A lead's status only moves
    forward (partial → complete → booked-click): an autosave on a complete or booked-click lead writes nothing, and a
    re-submit keeps `booked-click`.
  - `complete`: validates (Israeli mobile required), saves the lead to Notion **before** the LLM call, calls the model
    (30s timeout per attempt; one retry after a timeout, API error or invalid output, so at most ~60s), returns `{ ok, source, result }`, then writes the analysis back and emails.
    Limit **5 per hour per IP**, counted only for well-formed requests.
  - LLM failure or timeout: the user still gets a result, a template built from the shortlist (`source: "template"`,
    recorded in Notion and the lead email). The template drops the quote of the owner's own words if that quote would fail
    validation (e.g. English text). Only if the template cannot be built either: lead is saved and emailed (marked
    "analysis failed"), response is `502 analysis_failed`, and the page shows "משהו נתקע בדרך".
    `QUIZ_TEMPLATE_FALLBACK=0` turns the template off, so every LLM failure shows the error state.
  - Other responses: `400 {error, field}`, `403` foreign Origin, `405`, `429 {retry_after}` → "יש כרגע עומס".
- `POST /api/analyze/click` — `{ session_id }`: sets `booking_clicked`, `status=booked-click`, short email. 30/hour/IP.

Rate limits live in a SQLite-backed Durable Object (`RateLimiter`, see `wrangler.toml`): the built-in rate-limit
binding only supports 10s/60s windows.

## Result shape

Ensemble sells implementation, so every result ends with a named product Asaf builds for the client, not with advice:
`{ what_i_saw, biggest_leak, estimate_note, product: { solution_id, name, does, days, week1 } }`. The first three are the
diagnosis. `product` is the last block on the page ("מה הייתי בונה לכם"): the product name, what it does for the pain, build
time in days, and what they see in week one. `days` always comes from `catalog.js`, never from the model. The model's
`product` must come from the shortlist, may not give advice (no "כדאי", "מומלץ"), and may not use em-dashes or superlatives
(`check.js`). The template fallback builds the same block from the catalog (`productFor`), filled with the industry's wording
and the owner's own channel.

## Analysis engine

`catalog.js` (S1-S9) → `shortlist.js` (deterministic rules table, 1-2 candidates) → `prompt.js` (system prompt, JSON schema
with `solution_id` restricted to the shortlist) → `check.js` (schema, Hebrew ratio, ≤120 words per block, banned words,
gendered forms, solution in shortlist) → `analysis.js` (falls back to `template.js`). Model: `claude-sonnet-4-6` (override with `ANTHROPIC_MODEL`).
`npm run personas` prints 12 persona outputs (live if `ANTHROPIC_API_KEY` is set, template otherwise).

## Secrets (`wrangler secret put <NAME>`; local: copy `.dev.vars.example` to `.dev.vars`)

| Name | Needed for |
|---|---|
| `ANTHROPIC_API_KEY` | the live analysis (without it every result is the template fallback) |
| `NOTION_TOKEN`, `NOTION_QUIZ_DB_ID` | lead storage (skipped with a log warning if missing) |
| `RESEND_API_KEY`, `LEAD_EMAIL_FROM` (verified domain), `LEAD_EMAIL_TO` | lead emails (skipped with a log warning if missing) |

## Notion leads database: required properties (exact names)

| Property | Type |
|---|---|
| `name` | Title |
| `created` | Date |
| `session_id` | Text |
| `whatsapp` | Phone |
| `email` | Email |
| `consent` | Checkbox |
| `industry`, `size`, `acquisition`, `sink`, `hours` | Select (option ids, auto-created) |
| `channels` | Multi-select |
| `pain` | Text |
| `recommended_solution` | Select |
| `analysis` | Text |
| `analysis_source` | Select (`llm` / `template` / `failed`) |
| `booking_clicked` | Checkbox |
| `utm_source`, `utm_medium`, `utm_campaign` | Text |
| `device` | Select |
| `status` | Select (`partial` / `complete` / `booked-click`) |

Share the database with the integration (••• → Connections).

## Commands

```
npm install
npm run check        # tsc --checkJs on the Worker
npm run check:page   # tsc --checkJs on the page script
npm run build        # wrangler deploy --dry-run
npm run dev          # wrangler dev on :8787 (state kept outside the repo)
npm run personas
node scripts/fake-notion.mjs & node scripts/quiz-status-test.mjs   # status regression test (see the script header)
bash scripts/quiz-curl-tests.sh http://localhost:8787
```

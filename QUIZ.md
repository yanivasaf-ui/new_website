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
  - `partial` (sent from Q3 on): anonymous row, `status=partial`, no outreach. Limit 60/hour/IP.
  - `complete`: validates (Israeli mobile required), saves the lead to Notion **before** the LLM call, calls the model
    (12s budget, one retry on invalid output), returns `{ ok, source, result }`, then writes the analysis back and emails.
    Limit **5 per hour per IP**, counted only for well-formed requests.
  - LLM failure or timeout: lead is still saved and emailed (marked "analysis failed"), response is `502 analysis_failed`,
    and the page shows "משהו נתקע בדרך". Set `QUIZ_TEMPLATE_FALLBACK=1` to return a template result instead.
  - Other responses: `400 {error, field}`, `403` foreign Origin, `405`, `429 {retry_after}` → "יש כרגע עומס".
- `POST /api/analyze/click` — `{ session_id }`: sets `booking_clicked`, `status=booked-click`, short email. 30/hour/IP.

Rate limits live in a SQLite-backed Durable Object (`RateLimiter`, see `wrangler.toml`): the built-in rate-limit
binding only supports 10s/60s windows.

## Analysis engine

`catalog.js` (S1-S9) → `shortlist.js` (deterministic rules table, 1-2 candidates) → `prompt.js` (system prompt, JSON schema
with `solution_id` restricted to the shortlist) → `check.js` (schema, Hebrew ratio, ≤120 words per block, banned words,
gendered forms, solution in shortlist) → `analysis.js`. Model: `claude-sonnet-4-6` (override with `ANTHROPIC_MODEL`).
`npm run personas` prints 12 persona outputs (live if `ANTHROPIC_API_KEY` is set, template otherwise).

## Secrets (`wrangler secret put <NAME>`; local: copy `.dev.vars.example` to `.dev.vars`)

| Name | Needed for |
|---|---|
| `ANTHROPIC_API_KEY` | the analysis (without it every submission ends in the error state) |
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
bash scripts/quiz-curl-tests.sh http://localhost:8787
```

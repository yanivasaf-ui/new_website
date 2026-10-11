# Quiz (/quiz/) — backend notes

Not served (listed in `.assetsignore`). Page: `/quiz/` (noindex, not linked from the site).

## Endpoints (worker/index.js)

- `POST /api/quiz` — `{ stage: "partial"|"complete", session_id: uuid, answers, contact?, utm, device, website: "" }`
  - `website` is the honeypot: if filled, responds `{ok:true}` and stores nothing.
  - `partial` (sent from Q3 on): upserts an anonymous row, `status=partial`. No outreach on these rows.
  - `complete`: validates contact (Israeli mobile required), upserts the lead **before** the LLM call,
    returns `{ ok, source: "llm"|"template", result }`, then writes the analysis back and emails the lead.
- `POST /api/quiz/click` — `{ session_id }`: sets `booking_clicked`, `status=booked-click`, sends a short email.
- Errors: `400 {error, field}` (validation), `403` (foreign Origin), `405`, `429` (rate limit, 20/min/IP).

## Secrets (`wrangler secret put <NAME>`; local: copy `.dev.vars.example` to `.dev.vars`)

| Name | Needed for |
|---|---|
| `ANTHROPIC_API_KEY` | live analysis (otherwise template fallback) |
| `NOTION_TOKEN`, `NOTION_LEADS_DB_ID` | lead storage |
| `RESEND_API_KEY`, `LEAD_EMAIL_FROM` (verified domain), `LEAD_EMAIL_TO` | lead emails |

Every integration degrades gracefully when its secrets are missing: the user still gets a result.

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
| `analysis_source` | Select (`llm` / `template`) |
| `booking_clicked` | Checkbox |
| `utm_source`, `utm_medium`, `utm_campaign` | Text |
| `device` | Select |
| `status` | Select (`partial` / `complete` / `booked-click`) |

Share the database with the integration (••• → Connections).

## Commands

```
npm install
npm run check      # tsc --checkJs
npm run build      # wrangler deploy --dry-run
npm run dev        # wrangler dev on :8787
npm run personas   # prints the 12 persona analyses
bash scripts/quiz-curl-tests.sh http://localhost:8787
```

# Research Model 2 – Red / Green / Black scorecard

Separate app from the Midcap Research Desk (`tejas14193/midcap-research-desk`). Nothing here touches that app.

It copies the method in uncle's Excel ("stock analysis using screener", tab **Nifty 50 analysis**):

1. For each company, 52 numbers from Screener.in (Excel columns X to BW).
2. Each number is coloured green, black or red by the rule for its column (`rules.json`).
3. Count the colours. **INVEST** when Red < 10, Green > 20 and Black > 15; **WATCH** when two of the three hold; otherwise **AVOID**.

Live page: https://tejas14193.github.io/research_model_2/

## Files

| File | What it is |
| --- | --- |
| `rules.json` | The 52 colour rules + the decision rule. Edit here to change the default for everyone. Users can also change rules on the page (saved in their browser). |
| `engine.js` | Colouring and counting (shared by page and Node). |
| `index.html` | The page. |
| `tools/screener.js` | Screener reader: logged-in index page (exact numbers) or public company pages (no login). |
| `tools/update.js` | Daily updater. Writes `data/latest.json` and `data/history/<date>.json`. |
| `tools/test.js` | Tests (rules reproduce uncle's colours on ≥ 99% of his cells, SBI page parser). |
| `tools/timer/` | Cloudflare Worker `rm2-daily-timer` that starts the daily run at 18:20 IST, Mon–Fri. |
| `extra.json` | Optional: companies to add on top of Nifty 50, e.g. `[{"symbol":"TANLA","name":"Tanla Platforms"}]`. |
| `data/excel_2026-10-28.json` | Uncle's sheet (values, colours, his counts) for comparison. |

## Secrets

GitHub repository secrets (Settings → Secrets and variables → Actions):

| Secret | Needed for |
| --- | --- |
| `SCREENER_EMAIL`, `SCREENER_PASSWORD` | Optional but recommended. A Screener.in login whose **Nifty 50 page shows the 52 columns** (Edit columns). Gives Screener's exact figures, incl. Piotroski, G Factor, Exports %, ROE 5-yr growth and free cash flow. Without it, the public pages are used. |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Deploying the timer Worker (same values as the midcap repo can be reused). |

Cloudflare Worker secret (Workers → rm2-daily-timer → Settings → Variables → add **Secret**): `GH_TOKEN` = fine-grained GitHub token, repository `research_model_2` only, permission **Actions: Read and write**. Test: open `<worker address>/check`.

GitHub Pages: Settings → Pages → Source: **GitHub Actions**.

## Run by hand

Actions → Daily update → Run workflow. Locally: `node tools/update.js SBIN` (prints, does not save).

Rule output, not investment advice.

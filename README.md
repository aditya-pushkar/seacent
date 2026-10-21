# Invoice Extraction AI

## What it does
- Extracts invoice headers, line items, charges, tax from PDF/PNG/JPG
- Checks line arithmetic (`quantity × unit_price = line total`) and invoice total reconciliation
- Per-currency tolerance: 1 (JPY), 0.01 (USD/EUR), 0.001 (KWD), 0.0001 (CLF)
- Strict charge inclusion: only when document shows charge before grand total and not excluded
- Grounds every value to source page location; confidence scores + validation issues
- Review UI with side-by-side source viewer and result JSON

## Document Intelligence Flow

```
Upload → Doc Service (CPU) → Page PNG + words + boxes → LLM (GPU) → JSON → TypeScript normalization
```

| Step | Service | Purpose |
|------|---------|---------|
| 1. Page perception | **Modal doc-service** (CPU) | Extracts text layer or runs docTR OCR; returns PNG, words with normalized boxes, confidences, source kind (`text_layer`/`ocr`) |
| 2. Structure extraction | **Modal invoice-vlm** (GPU, Qwen2.5-VL-7B) | Receives PNG + untrusted text hint; returns copied strings, line items, charge booleans, evidence snippets |
| 3. Truth decision | **TypeScript (`lib/utils.ts`)** | Parses decimals, grounds each value against doc-service words, reconciles totals, computes confidence, decides review |

**Why two services?** OCR gives exact word positions and confidence but no semantic mapping. VLM gives semantic mapping (invoice number, line items, charges) but no reliable boxes. TypeScript uses both: doc-service words as independent evidence to ground VLM strings, check arithmetic, and score confidence.

## Confidence Scoring

Each extracted field gets a confidence score (0–1) from three factors:

| Factor | Weight | Description |
|--------|--------|-------------|
| **Grounding** | 0.5 | Exact match in doc-service words (exact → 1.0, fuzzy → 0.7, ungrounded → 0.2) |
| **Parsing** | 0.2 | Number/date parsed without ambiguity (clean → 1.0, ambiguous → 0.6, failed → 0.1) |
| **Arithmetic** | 0.3 | Line math and total reconciliation pass (valid → 1.0, mismatch → 0.3, incomplete → 0.5) |

**Final score** = product of three factors. Thresholds for UI:

| Score | Label | Tone |
|-------|-------|------|
| ≥ 0.90 | Very High | high |
| ≥ 0.75 | High | high |
| ≥ 0.50 | Medium | medium |
| ≥ 0.25 | Low | low |
| < 0.25 | Very Low | low |

Fields below `REVIEW_THRESHOLD` (default 0.80) generate `W_LOW_CONFIDENCE` issues and trigger review.

## Quick start (Docker)

```bash
docker compose up --build
```

Then open **http://localhost:3000**

### Compose services
- `db` — Postgres 16 (persistent volume)
- `app` — Next.js app, runs migrations on start
- `verify` — runs 5 sample invoices, writes `results/*.json`

### Environment (set in `.env`)
```
DOC_SERVICE_URL=...       # document service /analyze
DOC_SERVICE_TOKEN=...     # bearer token
LLM_BASE_URL=...          # LLM /v1 base URL (ends with /v1)
LLM_API_KEY=...           # bearer token (same as VLLM_API_KEY)
LLM_MODEL=invoice-vlm
REVIEW_THRESHOLD=0.80
DATABASE_URL=...          # local dev only; compose overrides
```

## Upload & Review
1. Click **Upload Invoice**, choose PDF/PNG/JPG
2. Wait for **Processing** → **Succeeded** or **Needs review**
3. Click card to review: header, lines, confidence, issues, source highlights
4. **Copy result JSON** for the final output

## Stop
```bash
docker compose down          # keep data
docker compose down -v       # delete all data
```

## Project structure
```
app/              Next.js routes & UI
components/       React components
lib/utils.ts      Parsing, grounding, reconciliation, confidence
lib/server/       Processing pipeline, DB access
src/db/           Drizzle schema & migrations
modal-deployments/  Document service & VLM (Modal GPU)
```

## Key design rule
The VLM only copies strings. TypeScript parses, grounds, reconciles, and decides truth.

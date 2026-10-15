# Ithika Gold House — Gold, Loan & Pledge Management System

A complete management system for a gold-pledge lender, built from the written quotation and requirements
specification. It covers every module in that document: the live dashboard, customers, gold items and the
vault, loans and pledges, interest and payments, four kinds of receipt, role-based access, audit history,
backup and recovery, and a full Bangla / English interface with correct Bangla fonts in receipts and reports.

The interface is built around immersive motion: page transitions, a pinned scroll story on the dashboard,
scroll-scrubbed counters and charts (GSAP ScrollTrigger), and inertial smooth scrolling (Lenis).

> **This is a working front-end build with browser-local storage.** It runs entirely in the browser so it can be
> reviewed without a server. A live installation needs a server database, server-side sign-in and scheduled
> backups. See `docs/HANDOVER.md` for exactly what changes.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # type-check and build to dist/
npm run preview      # serve the production build
```

### Without installing anything

`standalone/ithika-gold-house.html` is a prebuilt, self-contained copy of the whole system (script, styles and fonts
inline). Open it in a current desktop browser; no server or internet connection is needed. It was tested in Chromium.
Records stay in that browser only.

To rebuild it after changing the source:

```bash
npm run build:single    # writes two files to dist-artifact/
```

- `ithika-gold-house-standalone.html` is a complete page that opens straight from disk (the copy in `standalone/`).
- `ithika-gold-house.html` is a fragment for hosts that wrap a single file in their own page. In such a host the
  page cannot print, so downloads go through the host instead (the interface detects this).

### Demo sign-ins

| Role    | Username  | Password     | Can do                                                                 |
|---------|-----------|--------------|------------------------------------------------------------------------|
| Owner   | `owner`   | `owner123`   | Everything: all accounts, reports, receipts, settings, users, backups  |
| Manager | `manager` | `manager123` | Daily work, renewals, releases, interest checks and overrides, reports |
| Cashier | `cashier` | `cashier123` | Customers, new loans, collecting payments, viewing receipts            |
| Auditor | `auditor` | `auditor123` | Read-only: records, receipts, reports and the audit log               |

Sample records are flagged with a **Sample data** chip. *Settings → Data and demo* removes them, reloads them, or
resets the demo.

## What is in it

| Area | Route | What it does |
|------|-------|--------------|
| Dashboard | `/` | The six required figures, overdue and maturing lists, money-in/out chart and a pinned scroll story of the portfolio |
| Customers | `/customers`, `/customers/:id` | Unique customer ID, name, mobile, address; many loans per customer; full history; search by name, mobile or ID |
| Loans and pledges | `/loans`, `/loans/new`, `/loans/:id` | Four-step issue wizard, loan page with the month-by-month interest breakdown, renew, release, hand-check, adjust interest |
| Gold items | `/vault` | Categories, carat, weight (grams, vori/ana/roti/point), photograph, valuation, location, gallery and vault map |
| Payments | `/payments` | Every payment with date, amount, method and the interest / principal split; collect a payment from anywhere |
| Receipts | `/receipts`, `/receipts/:id` | New loan, interest collection, principal repayment and pledge release receipts. Each is exactly one A4 page: print it, save it as a PDF (about 200 KB) or download it as an image; find by number |
| Reports | `/reports` | Nine reports, on screen or as a paper copy, in English or Bangla, as PDF, CSV or print |
| Interest rules | `/interest` | The written 30-day rules, rate plans, live "watch the months being counted" scene, a try-a-loan calculator and the agreed test cases |
| Users and roles | `/users` | People, roles and an 18-permission matrix |
| Audit log | `/audit` | Who did what and when, with before / after values; filters; CSV export |
| Backup and restore | `/backup` | Manual and automatic backups, password protection, restore tests, restore with a safety copy |
| Settings | `/settings` | Language (per user, plus owner default), your account, business details, gold rates, appearance and motion, data and demo |

## How it is built

- **Vite + React 19 + TypeScript (strict)**, `react-router-dom` (hash routing), `zustand` + `immer` for state.
- **Motion:** GSAP 3 with ScrollTrigger, SplitText, Flip and a custom ease; `@gsap/react`; Lenis for smooth scrolling,
  driven from GSAP's ticker so ScrollTrigger and the eye always agree. Reduced-motion and a "Calm" setting are respected.
- **Charts** are hand-written SVG (one scale for marks, ticks and labels). No charting library.
- **Fonts** are bundled, not fetched: Newsreader, Instrument Sans, IBM Plex Mono and Noto Sans / Serif Bengali.
- **Storage:** IndexedDB with a `localStorage` fallback (and in-memory as the last resort). Preferences are per device.
- **PDF / image export:** `html-to-image` + `jsPDF`, loaded on demand. Pages are rendered as images so Bangla conjuncts
  shape correctly; the PDFs are therefore not text-searchable. A receipt is one A4 portrait page (210 x 297 mm, JPEG at
  about 190 dpi, around 200 KB). A receipt with a lot on it is scaled down just enough to stay on that one page.

```
src/
  lib/          domain rules, interest engine, selectors, store, backup, seed data, i18n (1,804 strings, en + bn)
  motion/       GSAP + Lenis setup, page transitions, reveal system (data-fx attributes), counters
  components/   controls, cards, tables, charts, overlays, pickers, receipt sheet
  shell/        sidebar, top bar, command palette (Ctrl/Cmd + K), splash
  pages/        one folder per module
  styles/       design tokens (light + dark) and one stylesheet per area
scripts/        build-single.mjs, make-artifact.mjs (single-file build)
standalone/     the prebuilt single-file copy
docs/           REQUIREMENTS-TRACEABILITY.md, HANDOVER.md
```

## Interest engine

`src/lib/interest.ts` is a set of pure functions, so every figure can be re-run by hand. The rules from section 4:
interest runs from the disbursement date; every month is 30 days; any part of a month is a full month; after a full
month 1–3 extra days are free; the fourth extra day adds a month. The **Interest rules** screen runs the quotation's
own examples (BDT 60,000 at 5%; 1 Jan → 4 Feb = 1 month; 1 Jan → 5 Feb = 2 months) against the engine and shows
pass / fail. Staff can check any loan by hand (*Check by hand*) and correct it (*Adjust interest*), which writes the
user, time, reason and before / after values to the audit log.

## Quality checks run on this build

- `tsc --noEmit` is clean (strict mode).
- Every screen was crawled with real wheel scrolling at 1440 px and 390 px, in English and Bangla, light and dark,
  and as each role, checking for console errors, horizontal overflow, clipped text and content stuck invisible.
- The loan wizard, receipts (print / PDF / image), reports (all nine, both languages), interest rules, vault, users,
  audit, backup (including password-protected files and restore tests) and settings were each driven end to end.
- Every receipt type, in English and Bangla, was downloaded through the real *Download PDF* button and checked with
  `pdfinfo`: one page, A4 (595 x 842 pt). The browser's own print path was checked the same way.
- Page transitions, the pinned dashboard story and scroll-triggered reveals were sampled frame by frame.
- The single-file build was run inside a frame that mimics a sandboxed host (no `window.print`, downloads through the
  host) and, separately, opened straight from disk, in both cases with no external network requests and no console
  errors.
- Scrollable strips (wide tables, tab bars) fade at the edge that has more to scroll, using scroll-driven CSS. Browsers
  without that feature show the plain strip.

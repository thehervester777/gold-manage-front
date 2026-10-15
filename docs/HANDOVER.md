# Handover notes

What needs a decision from Ithika Gold House, what this build is and is not, and what changes to go live.

## 1. Decisions the quotation leaves open (Stage 1 sign-off)

These are built and working, but they are **interpretations**. Each should be confirmed in writing before real money
is calculated with it. All of them can be changed in *Interest rules* without code (the change reaches new loans only;
every loan keeps the rules it was issued under).

| # | Decision | What the system does today | Why it needs approval |
|---|----------|----------------------------|-----------------------|
| 1 | How calendar dates become 30-day months | Months are counted between calendar dates (1 Jan → 1 Feb is one month) and each month is worth 30 days. So a pledge paid out on the 10th completes its first month on the 10th of the next month | The quotation says "every month is 30 days" but not whether a calendar month or 30 elapsed days ends the month. The two differ for 31-day months |
| 2 | Interest after a partial principal repayment | Months **not yet charged** use the **remaining** principal; months already charged never change. Switchable to *original principal* | The quotation requires the rule to be specified and approved |
| 3 | Minimum months charged | 1 month (the quotation's "even one day = one full month"). Selectable up to 3 | Policy choice |
| 4 | Grace days | 3 (the 4th extra day adds a month). Selectable 1–3 | The quotation allows 1–3 |
| 5 | Loan limit against appraised value | Staff must confirm before lending above 75% of the valuation | Not in the quotation; a sensible control to confirm or remove |
| 6 | Default term | 6 months, editable per loan | Not in the quotation |
| 7 | Rate plans | Standard 5%, Regular customer 4%, Large loan 3.5%, Short term 6% per month | Illustrative only. The real plans, and applicable law on rates, are the business's to set |
| 8 | Interest method | Simple interest, as in the quotation's example | The production method "must be approved by Ithika Gold House and configured in line with applicable law" |

Approval is recorded in the system: *Interest rules* shows who approved the rules and when.

## 2. What this build is

A complete front-end implementation that runs in the browser so it can be reviewed without any server.

| Area | In this build | For a live installation |
|------|---------------|--------------------------|
| Records | IndexedDB in the browser (falls back to `localStorage`, then memory). Shown honestly in *Settings → Data and demo* | A server database (for example PostgreSQL) behind an API. The data model in `src/lib/types.ts` maps one-to-one to tables |
| Sign-in | Accounts live in the browser; passwords are salted and hashed with SHA-256 | Server-side sessions, a slow password hash (Argon2 / bcrypt), lock-out and optional two-factor sign-in |
| Permissions | Checked in the interface **and** inside every store action | Must also be enforced on the server for every API call. The interface checks are a convenience, not security |
| Audit log | Append-only in the interface | Append-only table; writes only from the server |
| Backups | Manual and automatic daily snapshots kept in the browser; downloadable files with a checksum; optional AES-256-GCM password protection; restore tests; restore creates a safety copy first | Scheduled server-side database backups to encrypted off-site storage, plus the same restore-test routine on a schedule with a report |
| Password-protected backup files | Needs a secure (https) page because it uses the browser's WebCrypto | Server-managed keys |
| Photographs | Resized in the browser and stored with the record | Object storage (files) with the database holding only the reference |
| Gold rate | Entered by hand in *Settings → Gold rates* | Same, or a licensed rate feed if wanted |
| Sample data | Marked with a **Sample data** chip; can be removed in one step | None. The live system must show only real records |

## 3. Behaviour to know about

- **PDFs are images of the page.** This is deliberate so Bangla conjunct letters shape correctly in every viewer. The
  trade-off is that PDF text cannot be searched or copied. If searchable PDFs are needed, generate them on the server
  with an embedded Bangla font and a shaping engine, and test against the Bangla receipts.
- **A receipt is one A4 page.** In print, as a PDF (about 200 KB) and as an image it is always a single A4 portrait
  page. A receipt with very many gold items lists them one per line and is scaled down just enough to stay on that
  page, so its type gets smaller (about 8.9 pt at ten items, about 7.8 pt at sixteen).
- **Printing** uses the browser's print dialog with a paper stylesheet. Inside a sandboxed preview frame printing is
  blocked by the host; downloads work instead.
- **Dates and time stamps.** Loan, payment and receipt dates are plain calendar dates with no time zone, so interest
  never shifts by a day. Audit and creation time stamps are stored in UTC and shown in the viewer's local time.
- **Language** is a display setting. Stored names, addresses, descriptions and every amount are kept as entered and
  never translated.
- **Receipts are frozen.** A receipt keeps a snapshot of the figures at the time it was issued.
- **Smooth scrolling and page transitions** can be switched off per device in *Settings → Appearance and motion*, and
  they switch off automatically for people who ask their device for reduced motion.

## 4. Going live (Stages 6–7)

1. Confirm the decisions in section 1 and record the approval in the system.
2. Build the server and database; move the store actions in `src/lib/domain.ts` behind API endpoints, keeping the
   interest engine (`src/lib/interest.ts`) as the single source of calculation, shared by server and browser.
3. Replace browser sign-in with server sessions; enforce permissions on the server.
4. Migrate approved real customers, loans, gold items and payments; run the *Reconciliation* report and compare with
   the paper ledger; keep both until they match.
5. Schedule encrypted backups; run a restore test and keep the report.
6. Run the acceptance checklist in `REQUIREMENTS-TRACEABILITY.md` (section 7) with the owner, a cashier and an auditor.
7. Remove the demo accounts and the demo tools.

## 5. Known limits

- Single device: records in the browser are not shared between computers.
- The vault map shows the layout described by each item's vault / shelf / box; it is not a floor plan editor.
- Hosting, domain, third-party costs, warranty and the commercial terms in section 8 of the quotation are outside this
  build.

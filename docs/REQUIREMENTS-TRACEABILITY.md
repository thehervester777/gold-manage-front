# Requirements traceability

Every requirement in the *Ithika Gold House — Software System Quotation & Requirements Specification*, with the
screen or file that satisfies it and how to see it working. Section numbers follow the quotation.
"Demo" means the browser-local build; anything that changes for a live installation is called out in `HANDOVER.md`.

Status key: **Built** = working in this build · **Built, needs approval** = working, but the business must confirm the
rule in writing (the quotation leaves it open) · **Demo-grade** = works in the browser, needs a server for production.

## 1. Main Dashboard (`/`)

| Required | Status | Where | How to check |
|----------|--------|-------|--------------|
| Total Customers | Built | Dashboard tile · `pages/dashboard/Metrics.tsx` | Same figure as *Customers → Customers* tile |
| Active Loans | Built | Dashboard tile | Same figure as *Loans → Active loans* tile and the *Active* tab |
| Total Loan Disbursement | Built | Dashboard tile | Equals the total in *Reports → Loans disbursed → All time* |
| Interest Collected (current month) | Built | Dashboard tile | Equals *Payments → Interest this month* and *Reports → Interest collected → This month* |
| Outstanding Interest (approved rules) | Built | Dashboard tile | Equals *Loans → Interest outstanding* and *Reports → Outstanding interest* |
| Overdue Loans / Pledges (a list) | Built | *Overdue loans and pledges* card, with *Collect* shortcuts | Same set as *Loans → Overdue* tab and *Reports → Overdue loans* |
| Figures come from the database, none hard-coded | Built | `lib/selectors.ts` computes every figure from the records at render time | Add a payment: the tiles, lists and charts change. *Settings → Data and demo → Remove sample records* leaves every figure at 0 |

## 2A. Customer management (`/customers`)

| Required | Status | Where |
|----------|--------|-------|
| Unique customer ID | Built | Generated `CUS-00018` style IDs from a counter (`lib/domain.ts`) |
| Name, mobile number, address | Built | *Add customer* form, validated (required fields, mobile format, warning when the mobile number already belongs to another customer) |
| Many loans per customer | Built | *Customer profile → Loans and pledges*; the loan wizard accepts an existing customer |
| Historical loan, repayment and pledge records | Built | Customer profile: loans, payment history, receipts, record history |
| Search by name, mobile or customer ID | Built | Customers list search; the global command palette (Ctrl/Cmd + K) |

## 2B. Gold item and pledge management (`/vault`, loan wizard)

| Required | Status | Where |
|----------|--------|-------|
| Categories: chains, rings, necklaces, bangles, earrings | Built | Categories chain, ring, necklace, bangle, earring, other |
| Weight, description, photograph | Built | Wizard step 2 (photograph upload with preview); item drawer |
| Purity / carat, weight, valuation | Built | 18 / 21 / 22 / 24 carat; grams with vori-ana-roti-point conversion; valuation from the day's gold rate |
| Pledge date, principal, interest rules, term, status | Built | Wizard step 3; *Loan terms* card on the loan page |
| Easy to locate and review | Built | Gallery and **vault map** (vault / shelf / box), search, filters; tag `T-000076` and reference `GI-000076` |

## 2C. Interest and payment management

| Required | Status | Where |
|----------|--------|-------|
| Configurable monthly and other approved rates | Built | *Interest rules → Rate plans* (add, edit, switch off) and a custom rate on any single loan |
| Months accrued and outstanding amount | Built | *Loan page → How the interest is worked out* with a month-by-month table and the month ladder |
| Partial payments and full settlement | Built | *Collect payment*: interest only, part principal, or *settle in full* (also releases the pledge) |
| Payment date, amount, method | Built | Cash, bKash, Nagad, bank transfer, cheque; *Payments* list and export |
| Principal and interest shown separately | Built | Separate columns on *Payments*, on every receipt, and on reports |
| Traceable change history for corrections | Built | *Record history* on each loan; *Audit log* with before / after values; *Adjust interest* requires a reason |

## 2D. Digital and printable receipts (`/receipts`)

| Required | Status | Where |
|----------|--------|-------|
| Separate receipts: new loan, interest collection, principal repayment, pledge release | Built | Types **NL, IC, PR, PL**; issued automatically by the matching action |
| Unique number, date, customer details, amount | Built | e.g. `IC-2026-000225`: type code, year of the receipt, then one running number that is never reused |
| Print and save as PDF | Built | Every receipt is exactly one A4 portrait page (210 × 297 mm) when printed, saved as a PDF (about 200 KB) or downloaded as an image. *Print* (browsers), *Download PDF*, *Download image*. Inside a sandboxed demo frame printing is unavailable and downloads go through the host |
| Retrieve old receipts by number | Built | *Receipts* search (number, customer, mobile, loan) and the command palette |
| A receipt never changes | Built | Each receipt stores a frozen snapshot; reprints show the same figures even if rates or rules change |

## 2E. Owner and staff access control

| Required | Status | Where |
|----------|--------|-------|
| Owner has access to everything | Built | Owner role is locked to all 18 permissions |
| Role-based limited permissions | Built | *Users and roles*: Manager, Cashier, Auditor roles plus your own; 18 tickable permissions in 7 groups; menus, pages and buttons follow them and every store action re-checks the permission |
| Record who created or changed a record, and when | Built | Audit log; "Issued by" on loans and receipts; *Record history* panels |
| Regular backup and recovery | Built, demo-grade | *Backup and restore*; see section 5 below |

## 3. Language and localisation

| Required | Status | Where |
|----------|--------|-------|
| Entire system in Bangla and English | Built | 1,804 interface strings, every one translated; typed so a missing translation fails the build (`lib/i18n/`) |
| Switch from Settings, no reinstall | Built | *Settings → Language*; also a quick toggle in the top bar and on the sign-in screen |
| Dashboards, menus, buttons, forms, labels, validation messages, notifications, reports, receipts | Built | All use the same translation layer, including error toasts and confirmation dialogs |
| Saved data never altered by language | Built | Language is a view setting only; names, addresses, descriptions and amounts are stored once, as entered, and shown as-is |
| Receipts and reports print in Bangla and English, with proper Bangla fonts | Built | Per-document language choice; bundled Noto Sans / Serif Bengali; PDF pages are rendered as images so conjuncts shape correctly |
| Consistent dates, numbers, currency | Built | Bangla digits, lakh/crore grouping (`৳ ১,২৩,৪৫৬`), localised month names; stored values stay numeric |
| Saved per user; owner sets the default | Built | *Language* card (your language) and *Default for new accounts* (owner) |

## 4. Interest calculation rules (`lib/interest.ts`, `/interest`)

| Rule | Status | Where / test |
|------|--------|--------------|
| Interest runs from the disbursement date | Built | `countMonths` starts at `loan.disbursedOn` |
| Principal × configured rate, simple interest | Built | `monthlyInterest`; the BDT 60,000 at 5% example (3,000 / 63,000 / 6,000 / 66,000) is an agreed test case |
| Every month is 30 days | Built, needs approval | See *Assumptions* in `HANDOVER.md` for how calendar dates map to 30-day months |
| Any part of a month is a full month | Built | Minimum 1 month (configurable 1–3) |
| 1–3 extra days after a full month: no extra month | Built | Grace days setting (1–3, default 3) |
| 4th extra day: add a full month | Built | Test cases: 1 Jan → 4 Feb = 1 month; 1 Jan → 5 Feb = 2 months |
| Partial payments: original or remaining principal | Built, needs approval | Setting on *Interest rules*; default **remaining principal**, months already charged never change |
| Renewals and month transitions reconcile | Built | *Renew* records a snapshot of the principal, interest accrued, paid and outstanding and the months charged at that moment, can collect the outstanding interest (with its receipt), extends the maturity date and writes the audit entry. Interest keeps counting from the original disbursement date |
| Show range, principal, rate, months, payments, total outstanding | Built | *How the interest is worked out* on every loan; *Try a loan* calculator on *Interest rules* |
| Automatic and manual checks; overrides logged | Built | *Check by hand* compares a person's figure with the engine and logs the check; *Adjust interest* logs user, time, reason and before / after |
| Rules written down and approvable | Built | *Interest rules* shows the rules in force with who approved them and when; changing a rule asks for fresh approval |

## 5. Database records, security and backup

| Data area | Status | Type (`lib/types.ts`) |
|-----------|--------|-----------------------|
| Customers | Built | `Customer` |
| Loans: number, principal, date, interest rules, status | Built | `Loan` (stores the policy it was issued under) |
| Pledged gold items | Built | `GoldItem` |
| Payments with interest / principal allocation | Built | `Payment` |
| Receipts | Built | `Receipt` |
| Users and permissions | Built | `User`, `Role` |
| Audit history | Built | `AuditEntry` (who, when, entity, changes, reason) |
| Backups | Built | `BackupRecord` (time, size, checksum, counts, balances) |

| Security / backup requirement | Status | Where |
|-------------------------------|--------|-------|
| Authenticated login | Demo-grade | Sign-in screen; disabled accounts cannot sign in. Production: server-side sessions and slow password hashing |
| Permissions restrict information and actions | Built | Navigation, pages, buttons and store actions; a staff member without a permission sees a "no access" screen |
| Regular backups | Demo-grade | Manual backups, optional automatic daily backup with a keep-N rule |
| Backup files protected from unauthorised access | Built | Optional **AES-256-GCM** password protection (PBKDF2-SHA-256, 250,000 rounds); only the *backup.manage* permission can reach the page |
| Periodically test restore | Built | *Run a restore test*: reads the stored copy, checks its checksum, counts every record and re-computes the outstanding balances; the result is shown and logged |
| Audit logs retained | Built | Append-only: no screen can edit or delete an entry. (Only the demo's own *Remove sample records* / *Reset the demo* tools clear it; a live installation would not offer them) |

## 6. Implementation stages

All stages 2–6 are represented in this build. Stage 1 (sign-off of scope, rules and formats) and Stage 7 (data
migration, deployment, final acceptance) remain for Ithika Gold House — see `HANDOVER.md`.

## 7. Acceptance criteria

| Criterion | How to verify in this build |
|-----------|-----------------------------|
| Dashboard figures reflect records and reconcile with reports | Compare each dashboard tile with the *Reports* totals (table in section 1). *Reports → Reconciliation* recomputes each dashboard figure independently from the raw records and cross-checks the ledger (loans against new-loan receipts, interest against interest receipts, principal repaid against principal receipts, custody against active loans), marking each line *Matches* or *Differs* |
| Records can be searched and reviewed | Search on Customers, Loans, Gold items, Payments, Receipts, Audit log and the command palette |
| 30-day rule, 1–3 day grace and 4-day threshold pass the agreed cases | *Interest rules → Agreed test cases* runs them live; the *Watch the months being counted* scene shows the rule day by day |
| Manual vs automatic comparison; overrides logged | *Loan page → Check by hand* and *Adjust interest*; then *Audit log → Interest adjusted by hand* |
| Switch language from Settings; applies everywhere | *Settings → Language*, then walk the menu |
| Receipts and reports render in both languages including PDF / print | Open any receipt or report, choose *বাংলা*, *Download PDF* |
| Roles, audit, backup and restore tested | Sign in as Cashier and Auditor and compare menus; *Audit log*; *Backup and restore → Run a restore test* |

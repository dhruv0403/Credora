# Credora — Product Requirements Document (v2)

**Stack:** FastAPI (Python) backend · React (web, mobile-first responsive) frontend · MySQL database
**Status:** Pre-build planning spec for AI-assisted development
**Note on this revision:** This version replaces the single-owner model from v1 with a multi-tenant **Spaces** architecture, and substantially expands loan configurability (interest, disbursement, repayment, penalties, restructuring). The data model, API spec, screens, and roadmap files from the previous pass are now stale and will need a full rework against this PRD before development starts — that rework isn't included here per your request; this pass is PRD-only.

---

## 1. What Credora Is

Credora is a personal/business **loan ledger and lending portfolio tracker** for individuals and small lending operations who lend to, or borrow from, other people or institutions. It records, calculates, and reports on loans that exist in the real world — it never moves money itself.

**Credora is:** a personal loan ledger, a debt tracker, a lending CRM, and — for business use — a lightweight partnership/profit-share tracker for informal lending businesses.
**Credora is not:** a payments app, a lending marketplace, a bank-grade loan origination system, a collections platform, or an accounting ERP. No money moves through the app; collection method fields (Cash/UPI/Bank Transfer/Cheque/Auto-debit) are descriptive metadata only, never live payment processing.

---

## 2. User & Space Model (replaces v1's single-owner model)

This is the core structural change in this revision.

### 2.1 Users
A **User** is an authenticated account (login required — email + password at minimum). A user doesn't directly own loans/contacts/transactions; they own and/or belong to one or more **Spaces**, and all financial data lives inside a Space.

### 2.2 Spaces
A **Space** is an isolated financial workspace containing its own Contacts, Loans, Transactions, Expenses, Documents, Reports, and Settings. Spaces are fully isolated from one another — **there is no global dashboard or calculation that aggregates data across a user's spaces.** A user with three spaces sees three independent portfolios, not one combined number, by design.

A user can:
- **Own** any number of spaces (creator = automatic Owner).
- **Be a member** of spaces owned by other users (added via invite, with a role).

Users switch between spaces via a space switcher in the nav; the app remembers the last-active space per session.

### 2.3 Two independent dimensions per Space
Your source notes used "Personal," "Business," "Private," and "Shared" somewhat interchangeably. To keep this buildable, I've normalized it into **two independent attributes**, set once at space creation:

| Attribute | Values | What it controls |
|---|---|---|
| **Space Type** | `PERSONAL` / `BUSINESS` | Whether the Partnership Model (§5) is available at all |
| **Space Visibility** | `PRIVATE` / `SHARED` | Whether the space has one owner only, or multiple members with roles |

This gives four real combinations:
- **Personal + Private** — the default, single-person loan tracker (most users start here).
- **Personal + Shared** — e.g. a couple jointly tracking informal family lending; multiple members, but no profit-share math.
- **Business + Private** — a solo informal lending operation; structured like a business but no partners yet.
- **Business + Shared** — full partnership model active: contributions, profit share, partner dashboard (§5).

A space's Type and Visibility can be set at creation; changing Visibility from Private→Shared later (to add members) is allowed, but changing Type from Personal→Business after data already exists should require explicit confirmation since it exposes the Partnership Model.

### 2.4 Members & Roles (Shared spaces only)
Every Shared space has at least one member: the Owner. Additional members are added by invite (email-based invite, pending until accepted).

**Roles:** `OWNER`, `ADMIN`, `VIEWER`, `FIELDMAN`

**Visibility & permission matrix:**

| Feature | Owner | Admin | Viewer | FieldMan |
|---|---|---|---|---|
| Dashboard | YES | YES | YES | NO |
| Portfolio Analytics | YES | YES | YES | NO |
| Reports | YES | YES | YES | NO |
| Loans | YES | YES | YES | View only |
| Contacts | YES | YES | YES | View only |
| Transactions | YES | YES | YES | View only |
| Add Payment | YES | YES | NO | YES |
| Add Notes | YES | YES | NO | YES |
| Manage Members | YES | NO | NO | NO |
| Delete Space | YES | NO | NO | NO |
| Settings | YES | NO | NO | NO |
| Export Data | YES | YES | NO | NO |

A Viewer can see everything financial but can't write anything. A FieldMan is the inverse in a specific way: blind to portfolio-level numbers (no dashboard, no totals, no analytics) but able to do the one thing they're there for — record collections and field activity against the specific loans/contacts they're working with.

**FieldMan role detail** — designed for collection agents, recovery staff, or field reps who interact with borrowers in person but shouldn't see the business's overall financial picture:

*Can:* view contacts, loans, and repayment schedules; record payments/collections; add notes, visit status, collection remarks, and payment promises; view activity history for the records they touch.
*Cannot:* see the dashboard, portfolio analytics, total receivables/payables, total interest earned/paid, org-level reports, export data, manage members, change settings, or delete loans/transactions.

**Confirmed:** FieldMen see all loans/contacts in the space — just not the aggregate/portfolio-level numbers (dashboard, analytics, totals). There is no per-FieldMan assignment scoping in v1.

### 2.5 Space-scoped data (clarification)
"Platform data is space-specific" is taken literally: **Contacts are not shared across a user's spaces.** If the same person ("Rahul") is relevant to both a user's Personal space and their Business space, they're recorded as two separate contact records, one per space. There's no cross-space contact linking in v1.

### 2.6 Settings move from per-user to per-space
v1 had global per-user settings (default interest rate, repayment model, grace period, penalty rule, currency, advance payment mode, expense-deduction toggle). Since each Space is an isolated workspace that can have its own currency and its own defaults (e.g. a Business space might default to monthly reducing-balance loans while a Personal space defaults to no-interest), **these defaults now live on the Space, not the User.** True user-level settings are limited to profile (name, email, password) and account-wide preferences like notification settings.

---

## 3. Loan Lifecycle & States

State machine (unchanged in shape, with one explicit resolution below):

| State | Meaning | Set by |
|---|---|---|
| `DRAFT` | Created but not yet activated | User |
| `ACTIVE` | Loan is live, payments expected | User (on activation) |
| `OVERDUE` | **Computed**: ACTIVE + at least one schedule line past due and unpaid | System |
| `CLOSED` | Loan has ended | User, with a `closure_reason` |

**Resolved ambiguity — WRITTEN_OFF:** your notes list `WRITTEN_OFF` as a peer lifecycle state alongside Draft/Active/Overdue/Closed. Functionally, a written-off loan behaves exactly like a closed one (it stops being active, stops counting toward outstanding receivables) — so it's modeled as `closure_reason = WRITTEN_OFF` under `CLOSED`, not a fifth top-level state. To still give it the visibility your notes imply, the Loans list gets a dedicated **"Written Off"** filter tab, which is just `CLOSED` loans filtered by that reason — same backend state, no schema complexity added. `closure_reason` options: `FULLY_PAID`, `SETTLED`, `WRITTEN_OFF`, `MANUALLY_CLOSED`.

### 3.1 Settlement vs. Write-Off (closure mechanics)

These two closure reasons look similar (both mean "didn't recover the full amount") but represent different real-world events and need different handling:

**`SETTLED`** — the user and the counterparty negotiate and the counterparty actually pays *something* to close the loan out, just less than the full outstanding amount. This is logged via a dedicated **Settlement transaction**:
- `settlement_amount` — what was actually received/paid (can be 0, but is typically > 0).
- `outstanding_balance_at_settlement` — a snapshot of the outstanding balance immediately before settlement (so the record is self-explanatory later, independent of subsequent recalculation).
- `forgiven_amount` (derived) = `outstanding_balance_at_settlement − settlement_amount`.
- `settlement_date`, optional `note`.
- Logging this transaction immediately closes the loan with `closure_reason = SETTLED`; any remaining unpaid schedule lines stop mattering for outstanding-balance purposes (they're not deleted, just superseded by the closure).
- This is a whole-loan action in v1 — there's no "partially settle this loan and keep the rest active" — if only part of a multi-disbursement loan needs settling, that's a future enhancement, not in scope here.

**`WRITTEN_OFF`** — the user unilaterally declares the remaining amount unrecoverable, with **no** payment received and **no** negotiation implied. Mechanically: no Settlement transaction is logged; the loan is closed directly with `closure_reason = WRITTEN_OFF`, and the entire outstanding balance at the time of closure becomes the loss amount (equivalent to a settlement with `settlement_amount = 0`, but recorded under the more accurate label since no payment occurred).

**`MANUALLY_CLOSED`** — neither of the above; used for any other reason the user wants to close a loan (e.g. recorded in error, duplicate entry, the parties separately settled outside the app). Requires `closure_note` (free text) since there's no structured data to fall back on.

**Effect on Partner Allocation (§5.2):** the period profit/loss calculation currently only nets interest earned/paid and forgiven penalties — it's now extended to also subtract each period's `forgiven_amount` (from settlements) and written-off principal as a loss component, so a settled/written-off loan correctly reduces partner profit allocation rather than disappearing from the math silently.

---

## 4. Loan Building Blocks (the "feature rich" configurability)

Your notes correctly identify that almost every real-world loan is a combination of independent switches. Each is specified below as its own dimension so the AI assistant can implement them as orthogonal, composable fields rather than one tangled mega-enum.

### 4.1 Disbursement Structure
- **Single disbursement** — the default; one principal amount at `start_date`.
- **Multiple disbursements** — a loan can receive more than one disbursement event over its life. Each disbursement event has its own amount and date; the loan's outstanding principal is the running sum.
- **Top-up loan** — a new disbursement added to an *existing active loan* rather than creating a new loan record. Uses the parent loan's existing interest configuration; the new tranche's interest accrual starts from its own disbursement date.
- **Additional borrowing on existing loan** — treated identically to a top-up (same mechanism); kept as a separate label in the UI only if you want the activity log to phrase it differently (e.g. "Top-up" for planned tranches vs. "Additional borrowing" for ad hoc ones), otherwise they're the same feature.

### 4.2 Interest Type
- **None** — principal only.
- **Fixed amount** — an absolute rupee amount, not rate-based: either a one-time total (e.g. ₹500 flat for the whole loan) or a recurring fixed charge per period (e.g. ₹500/month, ₹500/week, ₹500/quarter), charged regardless of balance, until closure.
- **Percentage** — a rate-based amount. Rather than treating "per day/week/month/year" as separate interest *types*, they're the **rate period** of a single `rate_value` + `rate_period` field used by Flat, Reducing Balance, and Compound below (e.g. "5% per month" vs "12% per year" — same mechanism, different period). This avoids exploding the interest-type enum for what's really one setting.
- **Flat** — interest computed once on the *original principal* for the full tenure, spread evenly across installments. `Total Interest = P × rate_value × tenure_in_rate_periods`.
- **Reducing balance** — interest computed each period on the *outstanding* principal only (standard amortizing EMI math).
- **Compound** — interest computed each compounding period on principal *plus* any unpaid accumulated interest: `balance(t) = balance(t-1) × (1 + periodic_rate)` between payments.
- **Custom** — user enters principal/interest manually per schedule line; system stores it as-is, no formula applied.

### 4.3 Interest Timing
Independent of interest *type* — when the interest is actually settled:
- **Collected upfront** — the full interest amount is logged as an `INTEREST_RECEIVED`/`INTEREST_PAID` transaction at disbursement time; the borrower still owes full principal on the schedule (interest is already settled separately).
- **Deducted from disbursement** — the cash actually handed over is `principal − interest` (a `net_disbursed_amount`), but the borrower's repayment obligation is still the full principal (they "pay" the interest by receiving less upfront, not via a separate transaction).
- **Payable at end** — interest accrues over the tenure and is due as a lump sum alongside the final principal repayment.
- **Payable periodically** — interest is split across the repayment schedule per period (the default/standard behavior for ordinary EMI loans).

### 4.4 Interest Rate Behavior
- **Fixed** — one rate for the life of the loan (default).
- **Variable** — the rate can change mid-loan. Modeled as a rate history (effective-from date + rate), with the remaining schedule recalculated from the change date forward — the same recalculation mechanism as Advance Payment Mode's `RECALCULATE_SCHEDULE` (§6).
- **Promotional (0% for X days)** — a special case of Variable: `promo_rate` (default 0%) applies for the first `promo_period_days` from `start_date`, after which the loan's normal rate takes over automatically. Implemented as a scheduled rate change rather than a separate mechanism.

### 4.5 Repayment Type
- **One-time** — single bullet repayment of principal + interest at maturity.
- **EMI** — equal periodic installments (principal + interest blended per the chosen interest type).
- **Interest-only** — periodic payments cover interest only; full principal is due as a bullet at the end.
- **Principal-only** — periodic payments reduce principal only; interest is handled separately (e.g. already collected upfront, or waived).
- **Flexible** — no fixed schedule at all; the borrower pays whatever, whenever. The system tracks running balance and continuously accrued interest, but there's no "due date" and therefore no overdue concept for this loan — it pairs with Anytime payment timing (§4.7).
- **Custom installments** — user manually defines each installment's due date and amount.
- **Bullet** — alias/equivalent of One-time.
- **Balloon** — Interest-only payments throughout the tenure, with one large final payment covering the remaining principal. Modeled as a named combination of Interest-only + a final bullet principal line, not a new primitive.

### 4.6 Payment Frequency (for EMI/Interest-only/Principal-only models)
Daily, Weekly, Bi-weekly, Monthly, Quarterly. ("Daily collections" from your notes maps directly to Daily frequency.)

### 4.7 Payment Timing Rule
- **Scheduled** — the default; installments have fixed due dates (or a fixed recurring interval) and overdue tracking applies.
- **Anytime** — no enforced due dates; pairs with Flexible repayment type. There's no overdue state for these loans by definition — only an outstanding balance and accrued interest.
- *(Advance payment allowed is not a separate timing rule — it's governed by Advance Payment Mode, §6, which already exists from v1.)*

### 4.8 Payment Collection Method
A descriptive field on each Transaction, not a payment integration: `CASH`, `UPI`, `BANK_TRANSFER`, `CHEQUE`, `AUTO_DEBIT`, `OTHER`. Purely for the user's own record-keeping (e.g. "how did I actually receive this money").

### 4.9 Early Payment (Prepayment Rule)
- **Allowed** (default) — early/advance payments accepted; see Advance Payment Mode (§6) for how the excess is handled.
- **Full closure** — a dedicated "Close Loan Early" action: outstanding principal is repaid in full and the loan closes immediately (`closure_reason = FULLY_PAID`). Default behavior: interest stops accruing as of the closure date; already-collected upfront interest (§4.3) is not refunded. If the amount paid is *less* than the outstanding balance and the parties have agreed to that, use the Settlement flow (§3.1) instead, not Full Closure.
- **Partial closure** — a large extra payment that reduces principal substantially but doesn't fully close the loan; handled the same way as any advance payment via §6.

### 4.10 Late Payment / Penalty Rule
- **No penalty** (default).
- **Fixed penalty** — flat amount per overdue installment/period.
- **Percentage penalty** — % of the overdue installment amount.
- **Daily late fee** — a fixed or percentage charge accruing per day overdue (rather than a one-time penalty).
- **Monthly late fee** — same idea, accruing per month overdue.
- **Extra interest** — the penalty manifests as an additional interest rate applied to the overdue amount, rather than a separate fee line.
- **Grace period** — number of days after due date before any of the above kicks in.

Whichever combination is configured, principal / interest / penalty are always shown to the user as separate line items — never silently merged.

---

## 5. Business Space Partnership Model

Applicable only when **Space Type = BUSINESS** and **Space Visibility = SHARED**.

### 5.1 Partner Contribution
Any member of a Business+Shared space can be designated a **Partner** with:
- A **Contribution Amount** (e.g. ₹5,00,000), and/or
- A **Profit Share %** (e.g. 50%)

Both fields are optional/nullable — a partner can exist with a share but no recorded contribution, or vice versa. Example:

| Partner | Contribution | Share |
|---|---|---|
| Dhruv | ₹5,00,000 | 50% |
| Partner A | ₹3,00,000 | 30% |
| Partner B | ₹2,00,000 | 20% |

**Confirmed:** partnership status is not tied to role. Any member of a Business+Shared space — Owner, Admin, Viewer, or FieldMan — can be designated a Partner with a contribution and/or share. Owner/Admin simply hold the *permission* to set or edit those figures for any member; it doesn't restrict who can be a partner.

### 5.2 Partner Dashboard
A dedicated view (placed under **Reports**, not the main Dashboard, per your note) showing per partner:
- Their Contribution
- Their Share %
- Profit Allocated (for a selected period)
- Loss Allocated (for a selected period)
- Current Net Position

**Calculation basis:** period profit/loss = interest earned (optionally net of linked expenses, per the existing Expense Deduction Toggle, §7) minus interest paid minus penalties forgiven minus settlement/write-off forgiven amounts (see §3.1), for the space, over the selected date range. Each partner's allocated profit/loss = period profit/loss × their Share %.

**Visibility:** Owner/Admin see the full partner table (everyone's rows). A member who is themselves a listed partner, but holds a lesser role (e.g. Viewer), sees only their own row.

### 5.3 Partner Capital Transactions
Contributions and shares change over time — partners add capital, withdraw profit, or pull out part of their stake. This is tracked as its own append-only ledger, separate from the loan transaction ledger:

- **Capital contribution** — a partner adds money to the space's capital pool. Increases their running contribution balance.
- **Capital withdrawal** — a partner takes money out (e.g. drawing down allocated profit, or reducing their stake). Decreases their running contribution balance; cannot exceed their current net position.
- Each entry records: partner (member), type (contribution/withdrawal), amount, date, optional note.

**Current Net Position** is now computed as a running balance, not a static figure:
```
Net Position = Initial Contribution
              + SUM(capital contributions)
              − SUM(capital withdrawals)
              + cumulative allocated profit
              − cumulative allocated loss
```

The Partner Dashboard's Contribution figure shown is this running total (not just the original amount), and the partner capital ledger is visible alongside the profit/loss breakdown so a partner can see exactly how their position got to its current number. Adding/recording a capital contribution or withdrawal is restricted to Owner/Admin (same permission as setting contribution/share in §5.1), same as any other write action that affects another member's figures.

---

## 6. Advance Payment Mode (carried over from v1, unchanged)

Per loan, with a space-wide default:
- **`CARRY_FORWARD_CREDIT`** (simpler, default) — excess payment becomes an advance credit balance on the loan, auto-applied to future installments as they come due. Original schedule untouched.
- **`RECALCULATE_SCHEDULE`** — excess is applied to outstanding principal immediately; all remaining unpaid installments are regenerated from the new balance. Default: tenure shortens, installment amount stays the same. Superseded schedule rows are kept in history, not deleted.

---

## 7. Expense Deduction Toggle (carried over from v1, unchanged)

`deduct_expenses_from_reports` (default off), space-wide default + inline "Include expenses" switch on Dashboard, Interest report, Cash Flow report, and Analytics profitability views (and now also feeds the Partner Dashboard's profit/loss calculation, §5.2). Only affects reporting presentation — never the underlying ledger.

---

## 8. Restructuring

Restructuring actions are logged as explicit events (visible in the Activity Timeline) and restricted to Owner/Admin roles in Shared spaces:

- **Change interest rate** — recorded as a rate-history entry (same mechanism as Variable Interest Rate, §4.4); remaining schedule recalculated from the effective date.
- **Extend tenure** — adds installments and regenerates the remaining schedule.
- **Pause payments (moratorium)** — marks a date range where no installment is due; schedule shifts forward by the pause length. **Default:** interest continues accruing during the pause (a true interest-free moratorium is a configurable flag on the pause event, not the default).
- **Waive interest** — zeroes out remaining unpaid interest on the schedule; requires a reason note.
- **Waive penalties** — zeroes out accrued penalties; requires a reason note.

Every restructuring action must record who performed it and why (free-text reason), since it directly affects what a borrower/lender is told they owe.

---

## 9. Modules

| Module | Responsibility |
|---|---|
| **Spaces** | Create/switch/manage spaces; invite & manage members and roles |
| **Dashboard** | Per-space snapshot: total lent/borrowed, outstanding receivable/payable, interest earned/paid, active & overdue counts, upcoming payments, recent activity |
| **Loans** | Create/edit/close loans across all the configurable dimensions in §4; schedules, balances, interest breakdown; filters including the "Written Off" tab |
| **Contacts** | Space-scoped person/institution records, full loan history per contact |
| **Transactions** | Append-only ledger: payments, interest/penalty postings, manual adjustments, collection method metadata |
| **Expenses** | Loan-management costs, optionally linked to a loan, feeding the Expense Deduction Toggle |
| **Reports** | Receivable, Payable, Interest, Overdue/Aging, Cash Flow, and (Business+Shared spaces) Partner Allocation |
| **Analytics** | Net lending position, collection forecast, top borrowers/lenders, most profitable/overdue loans, monthly trends — all space-scoped |
| **Settings** | Now per-space: default interest/repayment/penalty/advance-payment/expense-deduction settings, currency, backup/export/import |
| **Documents** | Attachments on loans/contacts |
| **Activity Timeline** | Immutable audit log, including restructuring events |

---

## 10. Non-Functional Requirements

- **Authentication required** — every user logs in; no anonymous/contact-facing access (contacts still never log in, per v1).
- **Data isolation is per-Space**, not just per-user — every query scoped by `space_id`, with role-based access enforced on top for Shared spaces.
- **No cross-space aggregation** anywhere in the product, including in any future "all my spaces" landing view — at most, a landing hub may show each space's own already-computed numbers side by side, never a sum across them.
- **RBAC enforced server-side**, matching the matrix in §2.4 exactly — UI hiding alone is not sufficient.
- **Auditability** — transactions and activity log remain append-only; corrections are new adjustment rows.
- **Determinism** — all financial calculations reproducible from stored inputs.
- **Mobile-first responsive web UI.**
- **Data portability** — export/import/backup operate at the Space level (since data is space-specific), not account-wide.

---

## 11. Explicit Out of Scope (v1)

- Native mobile app.
- Real money movement / payment gateway integration.
- Cross-space contact sharing or any cross-space aggregation/dashboard.
- Notifications/reminders to contacts (or, for now, to FieldMen — push notifications are a later enhancement).
- Collateral tracking — not part of v1 at all (removed from scope entirely).

---

## 12. Success Metrics (for the build)

- A user can create a Space, invite a member with a specific role, and have that role's permissions enforced exactly per the matrix in §2.4 — both in the UI and at the API layer.
- Any combination of the loan building blocks in §4 (disbursement structure × interest type × timing × repayment type × frequency) produces a correct, inspectable schedule.
- A Business+Shared space correctly allocates profit/loss to partners proportional to their share %, and a non-Owner partner sees only their own row.
- Dashboard and report numbers for one space never include data from any other space, even when the same user owns both.

---

## 13. Edge Cases & Special Conditions (Scenario → System Behaviour)

### 13.1 Spaces, Membership & Roles

| # | Scenario | System Behaviour |
|---|---|---|
| 1 | Sole Owner tries to leave or be removed from a Shared space | Blocked: "A space must have an Owner — transfer ownership first." |
| 2 | Invite sent to an email with no existing Credora account | Invite held pending; auto-accepted into the space once that email registers |
| 3 | Admin attempts to change Space Settings via direct API call | Blocked (403) — Settings is Owner-only per the role matrix, enforced server-side |
| 4 | Viewer attempts to log a payment via direct API call | Blocked (403) — write actions disabled for Viewer regardless of endpoint |
| 5 | Space Type changed Personal → Business with existing data | Confirmation modal required; data preserved; Partnership Model becomes available with zero auto-generated partner records |
| 6 | Space Visibility changed Shared → Private with >1 member | Blocked: "Remove other members before making this space Private." |
| 7 | Space Type changed Business → Personal while partner records exist | Blocked: "Remove all partner contribution/share records first." |
| 8 | Owner deletes a Space | Requires typed confirmation; soft-deleted with a retention window (e.g. 30 days) for export, not an instant hard delete |

### 13.2 Loans — Interest & Terms

| # | Scenario | System Behaviour |
|---|---|---|
| 9 | Interest rate edited directly on an ACTIVE loan | Blocked once ACTIVE, regardless of transactions — direct field edit is for DRAFT loans only. On a DRAFT loan with no transactions: Warning ("Regenerating schedule will void current schedule — confirm.") and proceeds. |
| 10 | Interest rate change needed on an ACTIVE loan with transactions | Must go through Restructuring → Change Interest Rate (§8) instead of direct edit — always available to Owner/Admin, recalculates from the effective date, audit-logged |
| 11 | Repayment model changed on an ACTIVE loan with paid installments | Blocked: repayment model is locked at activation — close and create a new loan instead |
| 12 | Compound interest selected together with Custom repayment | Blocked: Custom repayment bypasses all interest formulas by definition; selecting Custom disables interest-type formula fields |
| 13 | Promotional `promo_period_days` longer than total `tenure_periods` | Validation error: promo period can't exceed total tenure |
| 14 | Variable-rate change scheduled for a past effective date | Blocked: effective date must be today or later |
| 15 | `DEDUCTED_FROM_DISBURSEMENT` with `net_disbursed_amount` ≥ principal | Validation error: net disbursed amount must be less than principal |
| 16 | Disbursement date is in the future                          | Allowed while DRAFT. On activation, warning: "Disbursement date is in the future — confirm."                                        |
| 17 | First due date is before disbursement date                  | Validation error: "First due date cannot be before disbursement date."                                                              |
| 18 | Principal amount = 0                                        | Validation error: "Principal amount must be greater than zero."                                                                     |
| 19 | Interest rate = 0% with Flat/Reducing interest              | Warning only: "0% rate is equivalent to a no-interest loan." User may proceed.                                                      |
| 20 | EMI repayment selected with only 1 installment              | Allowed. Treated as a single-installment EMI schedule.                                                                              |
| 21 | Custom schedule principal total differs from loan principal | Warning only: "Schedule principal total does not match loan principal." User may proceed because Custom schedules are user-defined. |
| 22 | Custom loan activated with zero schedule rows               | Blocked: "At least one schedule row is required before activation."                                                                 |

### 13.3 Disbursement

| # | Scenario | System Behaviour |
|---|---|---|
| 23 | Top-up disbursement attempted on a CLOSED loan | Blocked: top-ups only allowed on ACTIVE loans |
| 24 | Multiple disbursements logged on the same date | Allowed — separate disbursement rows, summed into outstanding principal |

### 13.4 Repayment & Payments

| # | Scenario | System Behaviour |
|---|---|---|
| 25 | Payment logged on a CLOSED loan | Blocked: "Loan is closed — reopen it first, or log a Manual Adjustment with a reason." |
| 26 | Payment amount exceeds total outstanding balance | Excess routed per Advance Payment Mode (§6); if balance hits ₹0, prompts "Close as Fully Paid?" |
| 27 | Payment logged with a future-dated transaction date | Warning, not a hard block: "This date is in the future — confirm?" |
| 28 | Payment logged against a Flexible/Anytime loan | Always allowed — no due date to violate, just reduces outstanding balance |
| 29 | A logged transaction is "deleted" | Never a hard delete — auto-creates a reversing `MANUAL_ADJUSTMENT`; original stays visible, marked "Reversed" |
| 30 | Payment date is before loan disbursement date   | Validation error: "Payment date cannot be before disbursement date." |
| 31 | Manual Adjustment logged with a negative amount | Allowed. Requires adjustment reason and audit log entry.             |

### 13.5 Advance Payment Mode

| # | Scenario | System Behaviour |
|---|---|---|
| 32 | Mode switched CARRY_FORWARD_CREDIT → RECALCULATE_SCHEDULE with existing credit balance | Existing credit is applied immediately as if it were a fresh advance payment under the new mode, then zeroed |
| 33 | RECALCULATE_SCHEDULE recalculation leaves zero remaining installments | Loan auto-closes as `FULLY_PAID` instead of producing an empty schedule |

### 13.6 Penalties & Late Payment

| # | Scenario | System Behaviour |
|---|---|---|
| 34 | Grace period changed after penalties already accrued | New value applies only to future overdue calculations — already-accrued penalties aren't retroactively recalculated; Owner/Admin can waive manually via Restructuring if needed |
| 35 | "Extra interest" penalty type combined with `interest_type = COMPOUND` | Blocked: stacking both creates ambiguous double-compounding — pick one mechanism per loan |

### 13.7 Settlement, Write-off & Closure

| # | Scenario | System Behaviour |
|---|---|---|
| 36 | Settlement `settlement_amount` greater than `outstanding_balance_at_settlement` | Blocked: "A settlement can't exceed what's owed — log a normal payment instead." |
| 37 | Write-off attempted on a loan with a positive advance credit balance | Credit balance is forfeited/zeroed as part of the write-off; shown in the confirmation dialog |
| 38 | Owner/Admin reopens a CLOSED loan | Allowed, requires a reason note; status reverts to ACTIVE, closure fields cleared, action logged |
| 39 | Restructuring action attempted by a Viewer or FieldMan | Blocked (403) — Owner/Admin only, per §8 |
| 40 | Moratorium (pause) requested over a period with already-paid installments | Blocked: pause can only cover installments that are still UNPAID and in the future |

### 13.8 Partner Model

| # | Scenario | System Behaviour |
|---|---|---|
| 41 | Sum of all partners' Profit Share % ≠ 100% | **Open decision** — current default: Warning only ("Total share is 92% — the remainder is unallocated"), not a hard block, since partial/placeholder setups are common early on |
| 42 | Partner removed from the space with a non-zero Net Position | Blocked: "This partner has an outstanding net position of ₹X — record a final withdrawal/settlement first." |
| 43 | Capital withdrawal exceeds partner's current Net Position | Blocked: "Withdrawal exceeds current net position." |

### 13.9 Contacts & Data

| # | Scenario | System Behaviour |
|---|---|---|
| 44 | Contact deleted while linked loans exist | Blocked: "This contact has N loan(s) — close or reassign them first." |
| 45 | Same person exists as a Contact in two of the user's spaces | Allowed but unrelated records — no cross-space contact linking (§2.5) |
| 46 | Import attempted into a Space that already has data | **Open decision** — current default: Blocked, import only supported into an empty new Space in v1; merge-import is a later enhancement |
| 47 | Contact already has active loans of the same direction | Informational notice only. User may continue creating the loan.                              |
| 48 | Same contact has both GIVEN and TAKEN loans            | Allowed. Loans remain independent. Contact Detail shows net position across both directions. |
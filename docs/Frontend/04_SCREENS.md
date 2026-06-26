# Credora — Screens & Information Architecture (v2)

**Stack:** React (mobile-first responsive web) · consumes `03_API_SPEC.md`
**Status:** Rebuilt against `02_DATA_MODEL.md` and `03_API_SPEC.md` (Spaces architecture). Every screen below maps its data needs to a specific endpoint from that file; no screen invents a field or action that doesn't already exist there.
**Companion doc:** `05_ROADMAP.md` (next — phased build order against this file's screen list).

---

## 0. How to Read This Document

Each screen entry follows the same shape:

- **Purpose** — one line.
- **Route** — the URL pattern (space-first, mirroring the API's resource hierarchy per `03_API_SPEC.md` §0.1).
- **Data needs** — which endpoints populate the screen, called out by method + path.
- **Primary actions** — which endpoints a user action on this screen calls.
- **Role visibility** — who can see / who can act, stated as a delta from the PRD §2.4 matrix, not re-deriving it.
- **Mobile behavior** — anything that changes shape below the desktop breakpoint, since this is mobile-first per the PRD's NFR.
- **States** — empty / loading / error specifics worth calling out (only where they're non-generic).

Two cross-cutting rules, stated once instead of per-screen:

1. **403 vs. hidden.** Nav items and action buttons are hidden client-side for roles that can never reach them (e.g. a FieldMan never sees a "Dashboard" tab at all). This is cosmetic only — `03_API_SPEC.md` §0.3 already enforces the real boundary server-side, and every screen below assumes the server will 403/404 correctly even if a client bug shows something it shouldn't.
2. **Warning vs. block, rendered consistently.** Any endpoint that returns `201`/`200` with a `warnings` array (PRD §13's "warning, not a block" rows) renders as a non-blocking inline banner or toast that lets the user proceed; anything that returns `400`/`409` renders as a blocking inline error or disabled action with the server's `error.message`. No screen below re-implements this distinction differently — it's one shared UI pattern (`<ServerMessage />`), referenced by name in the tables rather than redrawn each time.

---

## 1. Information Architecture (Sitemap)

```
/login, /register                                  (no space context)
/spaces                                             (space picker / landing hub)
/spaces/new                                         (create space wizard)

/spaces/:spaceId/
├── dashboard                                       (Owner/Admin/Viewer)
├── loans/
│   ├── (list, tabbed: All/Given/Taken/Active/Overdue/Closed/Written Off)
│   ├── new                                         (create wizard, CanWrite)
│   └── :loanId/
│       ├── (detail — overview tab)
│       ├── schedule                                (tab)
│       ├── transactions                            (tab)
│       ├── disbursements                           (tab)
│       ├── restructuring                           (tab, Owner/Admin)
│       ├── documents                               (tab)
│       └── activity                                (tab)
├── contacts/
│   ├── (list)
│   ├── new                                         (CanWrite)
│   └── :contactId                                  (detail — both-direction loan history)
├── transactions                                    (space-wide ledger, Owner/Admin/Viewer)
├── expenses/
│   ├── (list)
│   └── new
├── reports/
│   ├── receivable
│   ├── payable
│   ├── interest
│   ├── overdue
│   ├── cash-flow
│   └── partner-allocation                          (Business+Shared only)
├── analytics/
│   ├── net-position
│   ├── top-contacts
│   ├── loan-rankings
│   └── trends
├── partners/                                       (Business+Shared only)
│   ├── (table — Owner/Admin)
│   └── :partnerId/capital-ledger
├── activity                                        (space-wide timeline, Owner/Admin/Viewer)
├── members/                                        (Owner)
└── settings/                                       (Owner)
    ├── general
    ├── defaults
    └── space-type-visibility

/account/                                           (user-level, not space-scoped)
├── profile
├── security
└── notifications
```

**Resolution — why "Reports" carries Partner Allocation and "Partners" also gets its own top-level section.** `03_API_SPEC.md` §13 deliberately exposes `partner-allocation` under both `/reports/...` and `/partners/dashboard/` and explicitly punts the canonical nav placement to this document. Calling it here: **Partners gets its own top-level nav item** (it's a distinct mental model — "who owns what" — not a report you'd browse alongside Receivable/Payable), and it **also appears as a line item inside Reports** for users who think of it that way. Both routes hit the same payload; this is a navigation decision, not a data decision, and costs nothing extra to support since the API already serves both.

---

## 2. Navigation & Shell

### 2.1 Space Switcher

Persistent in the top app bar (desktop) / accessible via a header tap target (mobile). Lists every space from `GET /api/spaces/` — each row already carries that space's own snapshot numbers (total lent/borrowed) per the API's no-cross-space-aggregation rule, so the switcher itself doubles as a lightweight multi-space glance view without ever summing across them.

Switching spaces calls `PATCH /api/users/me/ {"last_active_space_id": ...}` and routes to `/spaces/:spaceId/dashboard` (or `/spaces/:spaceId/loans` for a FieldMan, who has no dashboard — see §2.2). On login, the app reads `GET /api/users/me/` and opens directly to the last-active space rather than the picker, unless `last_active_space_id` is null (first login) or that space was soft-deleted, in which case it falls back to `/spaces`.

### 2.2 Primary Nav — varies by role

| Role | Nav items shown |
|---|---|
| Owner / Admin | Dashboard, Loans, Contacts, Transactions, Expenses, Reports, Analytics, Partners *(Business+Shared only)*, Activity, Members *(Owner only)*, Settings *(Owner only)* |
| Viewer | Dashboard, Loans, Contacts, Transactions, Expenses, Reports, Analytics, Partners *(if listed as a partner — own row only)*, Activity |
| FieldMan | Loans, Contacts *(both read-only-by-category, write narrowed to payments/notes)* — **no** Dashboard, Reports, Analytics, Activity, Partners, Members, Settings, Expenses, Transactions-as-its-own-page (FieldMan reaches transactions only via a loan's Transactions tab, since the space-wide ledger at `/transactions` is Owner/Admin/Viewer per API §7.1) |

**Mobile:** bottom tab bar holds at most 4–5 items; for Owner/Admin/Viewer this is Dashboard / Loans / Contacts / Reports / More (Activity, Analytics, Partners, Members, Settings collapse into "More"). For FieldMan the bottom bar is just Loans / Contacts — there's no "More" since nothing else is reachable.

### 2.3 Landing Hub (`/spaces`)

Shown after login when there's no remembered last-active space, or reached explicitly via the space switcher's "All Spaces" option. Cards, one per space the user belongs to, each showing that space's own already-computed numbers (per `GET /api/spaces/`) — **never a combined total row**, restating the NFR §10 rule visually so a future contributor doesn't "fix" this into a sum by accident. A "+ New Space" card opens the create-space wizard.

---

## 3. Auth Screens

| Screen | Route | Data needs | Primary actions | Notes |
|---|---|---|---|---|
| Login | `/login` | — | `POST /api/auth/login/` | On success, fetch `GET /api/users/me/`, route per §2.1 |
| Register | `/register` | — | `POST /api/auth/register/` | After register, if a pending invite exists for this email, it auto-resolves server-side (edge case #2) — the post-register redirect checks `GET /api/spaces/` and routes straight into that space if exactly one membership exists, else to `/spaces` |
| Forgot/Reset Password | `/forgot-password`, `/reset-password` | — | (not in `03_API_SPEC.md` §1 — **gap flagged**, see §19 below) | |
| Accept Invite | `/invites/:token` | — | `POST /api/invites/{token}/accept/` | Reachable while logged out; if not authenticated, redirects through login/register first and returns to this URL (token preserved in query/state) |

---

## 4. Spaces Module

### 4.1 Create Space Wizard (`/spaces/new`)

A short 2-step flow, not a single form, because Space Type and Visibility are described in the PRD (§2.3) as the two foundational, hard-to-walk-back decisions — worth a moment of explanation rather than two dropdowns buried in a longer form.

| Step | Content | Maps to |
|---|---|---|
| 1. Type & Visibility | Two binary choices, each with a one-line explanation (PRD §2.3's four-combination table rendered as plain language, not as a 2×2 grid the user has to interpret themselves); a live example sentence updates as they pick (e.g. "Business + Shared → full partnership tracking with profit share") | `space_type`, `space_visibility` fields |
| 2. Basics | Name, currency (`currency_code`, defaulted by locale guess but editable) | `name`, `currency_code` |

Submits `POST /api/spaces/`. Lands on the new space's Dashboard with a brief "Invite teammates?" prompt if Visibility = SHARED (optional, dismissible — routes to Members if accepted).

### 4.2 Space Settings (`/spaces/:spaceId/settings/...`, Owner only)

| Sub-screen | Data needs | Primary actions |
|---|---|---|
| **General** | `GET /api/spaces/{id}/` | `PATCH /api/spaces/{id}/` (name, currency); "Delete Space" danger-zone action requiring typed name confirmation per edge case #8 → `DELETE /api/spaces/{id}/` |
| **Defaults** | `GET /api/spaces/{id}/settings/` | `PATCH /api/spaces/{id}/settings/` — mirrors `space_settings` fields exactly (interest type/rate/period, repayment type, frequency, advance-payment mode, penalty type, grace period, expense-deduction toggle). Inline note: "Changing these affects new loans only — existing loans keep what they were created with," restating data model §2.5 so users don't expect retroactive effect |
| **Type & Visibility** | `GET /api/spaces/{id}/` | `POST /api/spaces/{id}/change-type/`, `POST /api/spaces/{id}/change-visibility/`. Personal→Business with existing loans shows the confirm dialog (edge case #5); Business→Personal with active partner rows shows the blocking message from edge case #7 instead of letting the action proceed; Shared→Private blocks per edge case #6 with the exact server message surfaced |
| **Ownership** | `GET /api/spaces/{id}/members/` | `POST /api/spaces/{id}/transfer-ownership/` — required before the current Owner can leave (edge case #1); the "Leave Space" action for an Owner is disabled with an inline explainer until ownership is transferred, rather than letting them attempt it and bounce off a 409 |

### 4.3 Members & Invites (`/spaces/:spaceId/members`, Owner only)

| Element | Data needs | Primary actions |
|---|---|---|
| Member list (table, role badges, status PENDING/ACTIVE) | `GET /api/spaces/{id}/members/` | — |
| Invite | — | `POST /api/spaces/{id}/members/invite/` (email + role picker, role descriptions inline per the PRD §2.4 matrix so an Owner picking FieldMan understands exactly what that grants) |
| Row actions | — | Change role → `PATCH .../members/{id}/`; Resend invite → `POST .../members/{id}/resend-invite/`; Remove → `DELETE .../members/{id}/` (blocked with server message if sole Owner or non-zero-Net-Position partner, edge cases #1/#42) |

**Mobile:** member list collapses to stacked cards (name, role badge, status, a "⋮" menu for row actions) instead of a table.

---

## 5. Dashboard (`/spaces/:spaceId/dashboard`)

**Role visibility:** Owner, Admin, Viewer. FieldMan has no route here at all (nav item absent, and a direct URL hit 403s per API §2).

**Data needs:** `GET /api/spaces/{id}/dashboard/` — single call, since the endpoint is already a purpose-built snapshot (total lent/borrowed, outstanding receivable/payable, interest earned/paid, active & overdue counts, upcoming payments next 7/30 days, recent activity).

**Layout (mobile-first, single column; desktop adds a 2-column grid):**

1. **Headline numbers** — Total Lent, Total Borrowed, Net Position (receivable − payable), as three stat cards stacked on mobile, in a row on desktop.
2. **Outstanding** — Receivable vs. Payable, with Active/Overdue counts as sub-stats.
3. **Interest** — Earned vs. Paid for a default trailing-90-day window, with a link into the Interest report for a custom range.
4. **Upcoming payments** — a compact list (next 7 days, expandable to 30) — each row links to the loan, showing contact name, amount due, due date.
5. **Recent activity** — last 10 `activity_log` rows, "View all" → Activity Timeline.

**Empty state:** a brand-new space with zero loans shows a single "Record your first loan" call-to-action instead of five empty stat cards — avoids a dashboard that looks broken on day one.

---

## 6. Loans Module

### 6.1 Loan List (`/spaces/:spaceId/loans`)

**Data needs:** `GET /api/spaces/{id}/loans/` with filters mapped to tabs.

**Tabs (mirroring the short-idea-doc's original categories, reconciled against the API's actual filter params):** All · Given · Taken · Active · Overdue · Closed · **Written Off** (the dedicated tab from PRD §3's resolution — `?closure_reason=WRITTEN_OFF`, same backend state as Closed, filtered).

| Column (desktop table) | Source |
|---|---|
| Contact | `contact_id` → name (list endpoint should embed contact name, not just id — flagged for `03_API_SPEC.md` if not already covered by serializer) |
| Direction | GIVEN/TAKEN badge |
| Principal | `principal_amount` |
| Outstanding | computed `outstanding_balance` |
| Status | DRAFT/ACTIVE/CLOSED + computed `is_overdue` rendered as an "Overdue" badge layered on top of ACTIVE |
| Next due | from current-version schedule, soonest unpaid line |

**Mobile:** rows become cards (contact name + direction badge as the card header, outstanding amount large and prominent, status badge, next-due as a small line) — a list of stat-dense cards rather than a horizontally-scrolling table.

**FieldMan view:** identical filter set and read access (PRD §2.4 — FieldMan is "View only" for Loans as a category, not blocked); the row/card simply has no "New Loan" button and tapping through leads to a Loan Detail that's missing the aggregate-sensitive panels (see §6.3).

### 6.2 Create Loan Wizard (`/spaces/:spaceId/loans/new`)

This is the single most complex screen in the product — PRD §4 specifies five-plus independent configuration dimensions. Rendered as a **multi-step wizard**, not a long single-page form, both for mobile usability and because several later steps are conditionally shaped by earlier answers (e.g. picking `CUSTOM_INSTALLMENTS` removes the standard interest-formula fields entirely rather than just disabling them).

| Step | Fields | Conditional logic |
|---|---|---|
| **1. Who & Direction** | Contact (search existing or "+ New Contact" inline), Direction (GIVEN/TAKEN) | If an existing contact already has an active loan in the same direction, show the informational notice from edge case #47 inline (non-blocking) |
| **2. Principal & Dates** | `principal_amount`, `start_date`, `first_due_date`, `tenure_periods` | `first_due_date` picker is disabled-before `start_date` client-side, mirroring edge case #17 so the 400 is rare rather than the normal path; "no due date" loans (Anytime, set in Step 4) skip `first_due_date` entirely |
| **3. Interest** | `interest_type` (None/Fixed/Flat/Reducing Balance/Compound/Custom) as a card-style picker, each revealing its own sub-fields: Fixed → amount + One-time/Recurring; Flat/Reducing/Compound → `rate_value` + `rate_period`; Custom → no further fields here (handled in Step 7's schedule step instead). Then `interest_timing` (Upfront/Deducted/At end/Periodic) and `interest_rate_behavior` (Fixed/Variable/Promotional → reveals `promo_rate`/`promo_period_days` if Promotional) | Selecting `CUSTOM` interest collapses this step to just the picker — no rate/timing fields shown, since none apply; inline copy explains "You'll enter amounts directly in the schedule step." `DEDUCTED_FROM_DISBURSEMENT` reveals `net_disbursed_amount` with live validation against principal (edge case #15) |
| **4. Repayment** | `repayment_type` (One-time/EMI/Interest-only [+ "balloon final payment" checkbox]/Principal-only/Flexible/Custom installments), `payment_frequency` (hidden/disabled for One-time and Flexible), `payment_timing_rule` (auto-set to ANYTIME and locked when Flexible is chosen, per §4.7's pairing) | Choosing Custom Installments shows a notice that a schedule must be entered before activation (edge case #22) and skips frequency entirely |
| **5. Advance Payment & Penalty** | `advance_payment_mode` (defaults to "Use space default," with an override option), `penalty_type` + conditional `penalty_value`, `grace_period_days` | `EXTRA_INTEREST` penalty is disabled (not just warned) in this UI when `interest_type=COMPOUND` is already selected, pre-empting edge case #35 rather than letting the user submit and bounce |
| **6. Review** | Read-only summary of every field across steps 1–5, grouped by section | "Save as Draft" → `POST /api/spaces/{id}/loans/` |
| **7. Custom Schedule** *(only if `repayment_type=CUSTOM_INSTALLMENTS` or `interest_type=CUSTOM`)* | A row-entry table: due date, principal due, interest due, "+ Add row" | `POST .../loans/{loan_id}/schedule/custom-lines/` after the loan is created from Step 6. Mismatch against principal shows the warning banner from edge case #21, non-blocking |

**Resolution carried over from `03_API_SPEC.md` §6.2** — the spec flags edge case #12's "Compound + Custom" wording conflict as needing explicit confirmation before this screen locks it in. This wizard implements the API's chosen reading (allowed, formula silently ignored when `CUSTOM_INSTALLMENTS` repayment is paired with a formula-based `interest_type`): Step 4 does **not** disable or grey out the Step 3 interest selection when Custom Installments is picked, and Step 3's selection has no effect on the schedule once Custom Installments is active. **This stays flagged as open** — same status as in the API doc — because a UI choice ("don't bother disabling it, it's just ignored") is a visible product decision a reviewer should explicitly sign off on, not something this doc should quietly finalize on its own.

After creation (status=DRAFT), the user lands on Loan Detail with a persistent "Activate Loan" banner until they do so — a DRAFT loan that never gets activated is a normal, expected state (someone drafting a few options before committing), not an error state to nag about beyond that one banner.

**Editing a DRAFT loan.** Loan Detail's Overview tab (§6.3) is read-only fields by default, but for a DRAFT loan a persistent "Edit" button sits next to the Activate banner. It re-opens the **same 6–7 step wizard**, pre-filled from `GET .../loans/{id}/`, landing on Step 1 with full forward/back navigation rather than a single jump-to-review screen — a DRAFT loan has no transactions yet, so there's nothing the edit could invalidate, and re-running the whole wizard keeps the conditional logic (Step 3's interest-type-driven field set, Step 7's custom-schedule step) consistent rather than maintaining a second "edit mode" set of rules. Submitting calls `PATCH .../loans/{id}/` with the full changed field set. Once a loan is ACTIVE, this Edit button disappears entirely — Overview reverts to pure read-only, and any further change to a financial field routes through Restructuring (§6.7) or is rejected per edge cases #9–#11, consistent with the rest of this doc.

**Mobile:** each wizard step is its own full screen with a progress indicator (e.g. "Step 3 of 6") and persistent Back/Next; no step crams more than ~5 fields on a single mobile screen, so Step 3's conditional sub-fields appear/disappear inline rather than the whole step becoming a scroll-fest — if a sub-section (e.g. Promotional rate fields) would push a step past a comfortable scroll, it's broken into a 3a/3b sub-step instead.

### 6.3 Loan Detail (`/spaces/:spaceId/loans/:loanId`)

Tabbed layout. Header (persistent across tabs) shows contact name + direction, status badge (+ Overdue overlay), principal, outstanding balance, and the primary lifecycle action button (contextual — see below).

| Tab | Data needs | Content | Role notes |
|---|---|---|---|
| **Overview** | `GET .../loans/{id}/` | Full config readback (all PRD §4 dimensions, grouped same as the wizard's steps, but as labeled read-only fields not form inputs), `outstanding_balance`, `is_overdue`, `accrued_penalty_to_date`, `advance_credit_balance` | FieldMan sees this tab but **without** any space-aggregate figures — there are none on this tab anyway (everything here is loan-scoped), so no extra hiding needed beyond the tab list itself |
| **Schedule** | `GET .../loans/{id}/schedule/` | Table of installments: due date, principal/interest due, status (Paid/Pending, with Overdue computed client-side from Pending+past-due), running outstanding. Toggle "Show superseded versions" → `?include_superseded=true`, rendering older `schedule_version`s collapsed by default with a "superseded by [reason]" tag | ANYTIME loans show "No fixed schedule — flexible repayment" in place of a table |
| **Transactions** | `GET .../loans/{id}/transactions/` | Ledger rows: type, amount, date, collection method, allocation breakdown (principal/interest/penalty), reversed-state styling (strikethrough/greyed + "Reversed" tag) for `is_reversed=true` rows | "+ Record Payment" button → §6.4. FieldMan can read this tab (their own collections show here) and can record payments, but cannot reverse a transaction unless they created it — **gap flagged**, see §19, since `03_API_SPEC.md` grants FieldMan the same reverse permission as create without scoping it to "their own" records |
| **Disbursements** | `GET .../loans/{id}/disbursements/` | List ordered by `sequence_no`, label badge (Original/Top-up/Additional borrowing), running sum = outstanding principal | "+ Record Disbursement" — disabled with inline reason if loan isn't ACTIVE (edge case #23). Opens a modal: `amount`, `disbursement_date`, and a **label choice** (Top-up / Additional Borrowing, presented as two radio options with the one-line distinction from PRD §4.1 — "Top-up: a planned tranche under the existing terms" vs. "Additional Borrowing: an ad hoc extra amount" — display-only, both post identically to `label` on `POST .../disbursements/`). `sequence_no` is never shown as an input — server-assigned. |
| **Restructuring** | `GET .../loans/{id}/restructure/history/` | Unified chronological feed (rate changes, tenure extensions, moratoriums, waivers) each showing who/when/why | Tab itself hidden for Viewer/FieldMan (matches API's Owner/Admin-only on the write actions, but the *history* read is reasonable for Viewer too — **resolved here**: Viewer can view this tab read-only since they can see everything financial per the PRD's role description; only the action buttons are Owner/Admin-gated) |
| **Documents** | `GET .../documents/?entity_type=LOAN&entity_id={id}` | Thumbnail/file list by `document_type` | Upload/delete = CanWrite |
| **Activity** | `GET .../activity/?entity_type=LOAN&entity_id={id}` | Loan-scoped slice of the timeline | Read per matrix; FieldMan sees this since it's the loan-scoped equivalent of "their action confirmations," not a portfolio view |

**Header lifecycle button, contextual by status:**

| Status | Button | Action |
|---|---|---|
| DRAFT | "Activate" | `POST .../activate/` — surfaces warnings (future disbursement date, edge case #16) inline before confirming |
| ACTIVE | "Record Payment" (primary) + overflow menu: Close Loan ▾ (Full Closure / Settle / Write Off / Manually Close), Restructure ▾, Switch Advance Mode | Routes to the respective modal/flow (§6.4–§6.7) |
| CLOSED | "Reopen" (Owner/Admin only) | `POST .../reopen/` modal requiring `reason` |

FieldMan's header never shows the overflow menu — only "Record Payment" and the field-note action, matching their narrow write scope.

### 6.4 Record Payment (modal, from any loan screen with that action)

**Data needs:** none beyond what's already loaded for the loan (schedule, for the allocation picker).

**Fields:** `type` (defaults to PAYMENT_RECEIVED/PAYMENT_MADE based on loan direction, but all transaction types are selectable for flexibility — e.g. logging a `PENALTY_RECEIVED` separately), `amount`, `transaction_date` (date picker; a "more precise time" toggle reveals full datetime input for same-day ordering per the API's tiebreaker note), `collection_method`, `note`, and an **allocation section**: "Auto-allocate (recommended)" toggle on by default — when off, reveals the schedule lines as checkboxes/amount-split inputs for manual `allocations[]`.

**Inline behavior:**
- Future-dated transaction → non-blocking confirm ("This date is in the future — confirm?", edge case #27).
- Amount exceeding outstanding → after submit, if response includes `prompt: "Close as Fully Paid?"`, show a follow-up confirm that triggers the appropriate closure action (edge case #26) — the modal itself never auto-closes the loan.
- CLOSED loan → the "Record Payment" entry point isn't shown at all (button absent on a CLOSED loan's header, per §6.3's contextual button table) rather than letting a user open the modal and hit a 409.

### 6.5 Closure Flows

Four distinct entry points under the "Close Loan" overflow menu, since the PRD treats them as genuinely different events, not variants of one form:

| Flow | Modal fields | Endpoint | Special handling |
|---|---|---|---|
| **Full Closure** (Close Early) | `closure_date` (optional, defaults today) | `POST .../close-early/` | Confirmation copy explains interest stops accruing and upfront interest isn't refunded |
| **Settle** | `settlement_amount`, `settlement_date`, `note` — modal shows the current `outstanding_balance_at_settlement` (read-only, server-computed) so the user sees the cap before typing an amount | `POST .../settle/` | Live client-side validation disables Submit if `settlement_amount > outstanding_balance_at_settlement`, pre-empting edge case #36's 400 |
| **Write Off** | `reason`, `confirm` checkbox | `POST .../write-off/` | If `advance_credit_balance > 0`, the modal shows the forfeiture warning from edge case #37 *before* the confirm checkbox is enabled — the user has to see the number being forfeited, not just check a generic box |
| **Manually Close** | `closure_note` (required) | `POST .../close/` `{closure_reason: MANUALLY_CLOSED}` | |
| **Fully Paid (system-suggested)** | — | `POST .../close/` `{closure_reason: FULLY_PAID}` | Only reachable via the §6.4 prompt path, not a standalone menu item — there's no scenario where a user manually declares "fully paid" outside that flow, since the balance check itself is what makes it valid |

### 6.6 Switch Advance Payment Mode (modal, from the loan's overflow menu)

Given its own subsection rather than a one-line overflow item, since edge case #32 has real consequences — applied credit, schedule regeneration, possible auto-closure — that deserve the same up-front preview treatment as the closure flows in §6.5, not a bare confirm dialog.

**Data needs:** the loan's current `advance_payment_mode` and `advance_credit_balance`, already loaded on Loan Detail.

**Flow:**
1. Modal opens showing current mode and the other mode as the target, with a one-line description of each (mirroring the language in PRD §6).
2. **If switching `CARRY_FORWARD_CREDIT → RECALCULATE_SCHEDULE` and `advance_credit_balance > 0`:** before the confirm button is enabled, the modal shows a preview line — "₹X in credit will be applied to outstanding principal and your schedule will be regenerated." This is a client-side preview computed from the already-loaded balance, not a separate API call; the server remains the source of truth for the actual amounts applied.
3. **If that application would zero out all remaining installments:** an additional warning line — "This may close the loan as Fully Paid." — appears in the same preview, so the auto-closure from edge case #33's mechanic is never a surprise after the fact.
4. **Switching the other direction** (`RECALCULATE_SCHEDULE → CARRY_FORWARD_CREDIT`): no preview needed — modal is a plain confirm, since the API confirms there's no balance side-effect.
5. Confirm → `POST .../loans/{id}/change-advance-mode/`. Response's `credit_applied` and `schedule_version` (and updated `loans.status` if auto-closed) drive a success toast and refresh the Schedule tab if open.

Disabled with an inline reason (not submitted-then-error) if the requested mode already equals the current mode, pre-empting the API's 400 for that case.

### 6.7 Restructuring Flows (Owner/Admin only — tab and menu items absent for other roles)

Four modals, each mapping 1:1 to an API §8 endpoint: **Change Rate** (`effective_from` date-picker floors at today, per edge case #14), **Extend Tenure** (`added_periods`), **Pause Payments** — date range picker that visually greys out any already-PAID schedule lines to make edge case #40's restriction self-evident before submit, not just after a 400, **plus an `interest_free` checkbox** (default unchecked, matching PRD §8's default that interest continues accruing during the pause — checking it is the explicit opt-out into a true interest-free moratorium) — and **Waive Interest** / **Waive Penalty** (amount + required `reason`). All four share a footer note: "This action is logged and visible in the loan's history."

---

## 7. Contacts Module

### 7.1 Contact List (`/spaces/:spaceId/contacts`)

**Data needs:** `GET /api/spaces/{id}/contacts/?relationship_tag=&search=`.
**Layout:** searchable list/table — Name, Relationship tag badge, Phone, a computed-at-render "# active loans" chip (derived client-side from a lightweight count, or embedded by the list serializer — flagged for API review if not already present). Mobile: cards.
**Actions:** "+ New Contact" (CanWrite) → inline modal (name, relationship tag, phone, email, address, notes) rather than a full page, since the form is short.

### 7.2 Contact Detail (`/spaces/:spaceId/contacts/:contactId`)

**Data needs:** `GET .../contacts/{id}/`, `GET .../contacts/{id}/loans/`.
**Content:** Contact info card (edit inline, CanWrite) + a computed **Net Position** banner (receivable minus payable across this contact's GIVEN/TAKEN loans, edge case #48) + a tabbed-or-sectioned loan list split by direction (Given / Taken), each row linking to Loan Detail.
**Delete:** "Delete Contact" disabled with inline tooltip ("Has N active loan(s)") whenever the loan list is non-empty, rather than enabled-then-409 (edge case #44).

---

## 8. Transactions (Space-Wide Ledger)

**Route:** `/spaces/:spaceId/transactions` — Owner/Admin/Viewer only (FieldMan reaches transactions exclusively through a loan's Transactions tab, per §2.2).

**Data needs:** `GET /api/spaces/{id}/transactions/?loan_id=&type=&date_from=&date_to=`.

**Layout:** filterable ledger table (date, loan/contact link, type badge, amount, collection method, reversed-state styling matching §6.3's pattern). This is a read surface only — there's no "Record Payment" button here, since every transaction is created from its loan's context (the API itself only exposes creation under `/loans/{loan_id}/transactions/`, never space-wide), so this screen exists purely for "show me everything that happened across the whole space," not as an alternate entry point for logging one.

---

## 9. Expenses (`/spaces/:spaceId/expenses`)

**Data needs:** `GET /api/spaces/{id}/expenses/`.
**List:** date, category badge, amount, optional linked-loan chip, note.
**Create/Edit:** modal — category (enum picker), amount, date, note, optional loan link (search-select, same pattern as Contact picker in the loan wizard).
**Delete:** real hard delete (no reversal pattern needed, since expenses aren't ledger rows) — still asks for a confirm, just a plain "Delete this expense?" not a typed-confirmation dialog.

---

## 10. Reports (`/spaces/:spaceId/reports/...`)

Owner/Admin/Viewer only. Shared chrome across all six report pages: a date range picker (`?date_from=&date_to=`) and a "Deduct expenses" toggle (`?deduct_expenses=`) defaulting to the space's `deduct_expenses_from_reports` setting but overridable per-view, per API §13.

| Report | Primary visualization | Notes |
|---|---|---|
| Receivable | Table, sorted by outstanding desc, grouped by contact | |
| Payable | Same shape, TAKEN direction | |
| Interest | Earned vs. Paid, side-by-side stat + trend line over the selected range | |
| Overdue / Aging | Table with aging buckets (0–30/31–60/61–90/90+ days overdue) as columns, loan rows | |
| Cash Flow | Stacked bar: historical inflow/outflow (solid) + projected future inflow/outflow (hatched/lighter), split visually at "today" | Projection portion sourced from current-version schedule lines, not transactions — labeled "Projected" so it's never confused with actuals |
| Partner Allocation | Same payload/component as the Partners Dashboard (§11.2) | Only rendered as a reachable nav item when `space_type=BUSINESS AND space_visibility=SHARED`; otherwise this report entry doesn't appear in the Reports nav at all (rather than appearing and 400ing) |

**Mobile:** tables that don't fit collapse to a primary metric + "tap to expand" row detail, consistent with the Loan List card pattern.

---

## 11. Analytics (`/spaces/:spaceId/analytics/...`)

Same permission tier as Reports (Owner/Admin/Viewer).

| Page | Content | Endpoint |
|---|---|---|
| Net Position | Net lending position headline + collection forecast + future liabilities/receivables chart | `.../analytics/net-position/` |
| Top Contacts | Ranked list, toggle Borrower/Lender | `.../analytics/top-contacts/?role=` |
| Loan Rankings | Toggle Most Profitable / Most Overdue | `.../analytics/loan-rankings/?by=` |
| Trends | Line chart, metric (Lending/Borrowing/Interest) × granularity (month, expandable later) selectors | `.../analytics/trends/` |

---

## 11.1 Partners Module (`/spaces/:spaceId/partners`, Business+Shared only)

**Nav visibility:** appears only when the active space has `space_type=BUSINESS` and `space_visibility=SHARED`; absent for every other combination, never a disabled/greyed item.

### 11.2 Partner Table / Dashboard

**Data needs:** `GET /api/spaces/{id}/partners/dashboard/?period_start=&period_end=`.

**Owner/Admin view:** full table — Partner (member name), Contribution (running), Share %, Profit/Loss Allocated (selected period), Net Position. A "Total Share %" footer row highlights in amber (not red — it's a warning, not a block) when the sum ≠ 100%, directly surfacing the open decision from PRD edge case #41 rather than hiding it.

**Partner-but-lesser-role view (e.g. a Viewer who's also a listed partner):** identical layout, just a single row (their own) — API §10 already filters this server-side; the screen doesn't need its own logic beyond rendering whatever rows came back.

**Actions (Owner/Admin only):** "+ Add Partner" → modal (member picker restricted to existing space members, `initial_contribution_amount`, `profit_share_percent`, both explicitly optional per PRD §5.1) → `POST /api/spaces/{id}/partners/`. Row "Edit" → `PATCH`. Row "Remove" → `DELETE`, disabled with inline tooltip when Net Position ≠ 0 (edge case #42), same disabled-not-409 pattern as Contact deletion.

### 11.3 Partner Capital Ledger (`/spaces/:spaceId/partners/:partnerId/capital-ledger`)

**Data needs:** `GET .../partners/{id}/capital-transactions/`.
**Content:** append-only list — date, type (Contribution/Withdrawal badge), amount, note, running balance column computed client-side as a display convenience (not trusted as a source of truth — always reconcilable against the dashboard's server-computed Net Position).
**Add entry (Owner/Admin):** modal — type, amount, date, note → `POST .../capital-transactions/`. Withdrawal amount field shows the current Net Position as a live cap hint; submit disabled client-side if amount exceeds it, pre-empting edge case #43's 400.
**Visibility:** reachable by Owner/Admin for any partner, or by the partner themself for their own ledger only (matches API §10's `GET` permission note).

---

## 12. Documents

No dedicated top-level nav item — documents are always viewed/managed in context, attached to the entity they belong to:
- **Loan Detail → Documents tab** (§6.3)
- **Contact Detail** — a "Documents" section below the loan list, same component reused with `entity_type=CONTACT`

Both instances of the component: thumbnail grid (images) / file-icon list (other types), grouped by `document_type`, with upload (multipart, CanWrite) and delete (CanWrite). No standalone `/documents` route exists, since the API itself has no concept of "all documents across the space" as a useful view — every document belongs to exactly one loan or contact, and that's always how a user will think to look for it.

---

## 13. Activity Timeline (`/spaces/:spaceId/activity`)

Owner/Admin/Viewer (403 FieldMan, matches API §12).

**Data needs:** `GET /api/spaces/{id}/activity/?date_from=&date_to=&entity_type=&entity_id=`.

**Layout:** reverse-chronological feed, each row showing the precomputed human-readable `description`, actor (member name or "System"), timestamp, and an entity-type icon that links back to the source record (loan/contact/transaction/etc.). Filters: entity type chips, date range. This is a read-only feed by definition — no compose/create affordance exists anywhere on this screen, matching the API's explicit "no POST" note.

A **loan-scoped slice** of this same component appears as the Activity tab on Loan Detail (§6.3) and is the one place FieldMan can see activity — scoped to records they themselves touched, not the space-wide feed.

---

## 14. Settings — User-Level (`/account/...`, not space-scoped)

| Screen | Data needs | Primary actions |
|---|---|---|
| Profile | `GET /api/users/me/` | `PATCH /api/users/me/` (display_name) |
| Security | — | `POST /api/users/me/change-password/` |
| Notifications | `GET /api/users/me/` (`notification_prefs`) | `PATCH /api/users/me/` |

Kept entirely separate from Space Settings (§4.2) in the nav — these are account-wide per PRD §2.6's "true user-level settings are limited to profile... and account-wide preferences," and mixing them into the space settings nav would misrepresent that boundary to the user.

---

## 15. Role × Screen Visibility — Consolidated Matrix

A single reference table, cross-checked against PRD §2.4 and `03_API_SPEC.md` §15, so QA can validate nav visibility in one pass instead of hunting through every section above:

| Screen | Owner | Admin | Viewer | FieldMan |
|---|---|---|---|---|
| Dashboard | ✅ | ✅ | ✅ | — |
| Loans (list/detail, read) | ✅ | ✅ | ✅ | ✅ (view only) |
| Loans (create/edit/lifecycle) | ✅ | ✅ | — | — |
| Record Payment | ✅ | ✅ | — | ✅ |
| Add Field Note | ✅ | ✅ | — | ✅ |
| Restructuring (act) | ✅ | ✅ | — | — |
| Restructuring (view history) | ✅ | ✅ | ✅ | — |
| Contacts (read) | ✅ | ✅ | ✅ | ✅ |
| Contacts (write) | ✅ | ✅ | — | — |
| Transactions (space-wide ledger) | ✅ | ✅ | ✅ | — |
| Expenses | ✅ | ✅ | ✅ (read) | — |
| Reports | ✅ | ✅ | ✅ | — |
| Analytics | ✅ | ✅ | ✅ | — |
| Partners table/dashboard | ✅ (all rows) | ✅ (all rows) | own row if partner | own row if partner |
| Activity Timeline (space-wide) | ✅ | ✅ | ✅ | — (loan-scoped tab only) |
| Members | ✅ | — | — | — |
| Space Settings | ✅ | — | — | — |
| Export Data | ✅ | ✅ | — | — |

---

## 16. Shared UI Patterns

- **`<ServerMessage />`** — renders `warnings[]` as dismissible amber banners and `error.message` (with `error.code`/`edge_case_ref` available in a dev-mode tooltip, never shown to end users) as red inline errors. Used everywhere a PRD edge case has a stated warning/block behavior, so that behavior is implemented once.
- **Disabled-with-reason over enabled-then-error.** Wherever an edge case is *deterministically* knowable client-side before submission (sole Owner leaving, deleting a contact with loans, removing a partner with non-zero position, withdrawing more than Net Position), the action is disabled with an inline tooltip instead of being submitted and bounced. Wherever it depends on server-computed values not yet fetched at the moment of the click (e.g. exact settlement cap), it's submit-then-handle via `<ServerMessage />`.
- **Typed confirmation** — reserved for genuinely destructive, hard-to-reverse actions: Space deletion (type the space name) only. Restructuring/settlement/write-off use a standard "are you sure" confirm with the consequence spelled out in copy, not a typed-name gate — typed confirmation is the exception, not the default, or every modal in the app would demand one.
- **Append-only visual language** — reversed transactions, superseded schedule versions, and removed members are never visually removed from a list; they're greyed/struck-through with a status tag, consistent with the data model's append-only principle being visible in the UI, not just the database.

---

## 17. Open Items / Gaps Flagged for Resolution

Items 4–7 from the prior review pass (DRAFT-loan editing, Switch Advance Mode's consequence preview, the moratorium's `interest_free` checkbox, and the disbursement label choice) are now resolved inline above (§6.2, §6.6, §6.7, §6.3 respectively) — removed from this list. What remains needs an API addition, not just a screen-spec fix, confirmed against the actual urlpatterns dump:

1. **Password reset flow** — confirmed absent from the real contract (no `forgot-password`/`reset-password` routes). §3's Auth screens assume these exist. Needs adding to `03_API_SPEC.md` and the backend before Auth screens can be fully built.
2. **`reports/partner-allocation/`** — confirmed absent from the real contract; only `receivable/payable/interest/overdue/cash-flow` exist under Reports. Either add the route, or drop the Reports-nav duplicate from §1/§10 and let Partner Allocation live solely under `/partners/dashboard/` (§11.2). Needs a decision before `05_ROADMAP.md` locks the Reports nav.
3. **Backup / Restore / Import / Export — none of these exist in the real contract**, and (correcting the prior pass, which only flagged Export) this doc has no screen for any of the four, not just Export. PRD §9 assigns all four to Settings; edge case #46 (import into a non-empty space) implies Import needs its own UI moment (e.g., the action disabled with an inline reason when the target space already has data, same disabled-not-409 pattern used elsewhere in this doc). Needs its own pass: likely a "Data" sub-screen under Space Settings, with the four actions and their formats (CSV per table vs. bundled archive — undecided) — before `05_ROADMAP.md` schedules it.
4. **FieldMan reversing transactions they didn't create** — `03_API_SPEC.md` §7.1 grants FieldMan the same `reverse` permission as `create` without scoping to "their own" records; §6.3 of this doc flags this as a likely-unintended gap rather than deciding it unilaterally.
5. **Loan list embedding contact name** — assumed for the list screen (§6.1) to avoid an N+1 lookup per row; confirm the list serializer actually embeds it or this needs a small API addition.
6. **The unnamed empty `URLResolver` entry** in the urlpatterns dump (between the members and contacts patterns) — unclear what it resolves to. Worth confirming directly with the coding assistant rather than assuming; it may simply be a router artifact, but it sits suspiciously close to where space-level routes would live.

---

*Next: `05_ROADMAP.md` — phased build order. Every phase's screen list should trace back to a section above; every section above should land in exactly one phase.*
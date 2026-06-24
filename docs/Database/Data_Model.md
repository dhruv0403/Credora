# Credora — Data Model (v2)

**Database:** PostgreSQL (switched from MySQL after the backend moved to Django — see note below)
**Status:** Rebuilt from scratch against `01_PRD.md` (v2 — Spaces architecture). The v1 data model is fully superseded; nothing below assumes a single-owner schema.
**Companion docs:** `03_API_SPEC.md`, `04_SCREENS.md`, `05_ROADMAP.md` (to be reworked against this file next).

**Note on the MySQL → PostgreSQL switch:** this file was originally written against MySQL 8.x; the engine changed after the backend stack moved to Django, for ecosystem/deploy reasons (managed Postgres hosting, pgbouncer pairing, mature `CHECK` constraint support) rather than because any table below needed a Postgres-specific feature. The switch is reflected in the two spots that were genuinely engine-specific (the `space_members` partial-uniqueness note in §2.3, and the `ENUM`/`GENERATED` column language throughout, which now reads as "DB-native enum" generically — Postgres implements this via `CREATE TYPE ... AS ENUM` rather than MySQL's inline `ENUM(...)` syntax, though per the earlier decision to defer Django-idiom translation, the actual `models.py` will likely use `CharField(choices=...)` on top of either engine anyway, making the distinction mostly moot in practice). No table, column, or constraint in this document was redesigned for the switch — the schema is identical on both engines.

---

## 0. Design Principles (read this before the tables)

A few cross-cutting decisions shape every table below. They're called out once here instead of repeated 20 times.

1. **Typed columns over JSON for anything that feeds a calculation.** The PRD's NFR is explicit: *"all financial calculations reproducible from stored inputs"* and *"users should always understand how values were derived."* A JSON `config` blob on `loans` would satisfy "flexible," not "deterministic and inspectable." Every loan-configuration dimension in PRD §4 gets its own typed column or its own table. JSON is used in exactly one place — `activity_log.metadata` — for human-readable audit display, never as a source of truth for money math.

2. **Every table that holds financial or contact data carries `space_id` directly**, even where it could be inferred through a join (e.g. `repayment_schedule_lines.space_id`, derivable via `loan_id → loans.space_id`). This is deliberate, not denormalization sloppiness: PRD §10 requires *"every query scoped by `space_id`"* and *"RBAC enforced server-side... UI hiding alone is not sufficient."* A direct `space_id` column on every table lets every single query — no matter how deep the join — filter on one column with one index, and makes a missing-`WHERE space_id=?` bug structurally harder to write. Foreign keys to `loans`/`contacts` still exist for integrity; `space_id` is the safety net.

3. **Append-only ledgers stay append-only at the schema level, not just by convention.** `transactions` and `activity_log` have no `updated_at` column and the API layer (per `03_API_SPEC.md`) will not expose `PATCH`/`DELETE` on them. Corrections are new rows (`reverses_transaction_id`), per PRD edge case #29.

4. **Computed values are not stored unless they need to survive a recalculation.** `OVERDUE` is the canonical example the PRD already settles — it's derived at query time, never a column. The same logic extends to: outstanding balance, net position (contact-level and partner-level), and day-to-day penalty accrual (recomputed from `loans` config + `repayment_schedule_lines` + `loan_waivers`, not pre-materialized). Anything the PRD explicitly says must survive a later recalculation (e.g. `outstanding_balance_at_settlement`, waived amounts) **is** stored, as a snapshot, at the moment it's created — never reverse-engineered later.

5. **Soft delete is used exactly where the PRD asks for it, and nowhere else.** Only `spaces` has a `deleted_at` (PRD edge case #8 — 30-day retention window). Contacts and loans are protected from deletion by *blocking* it while dependent records exist (edge case #44), not by soft-deleting — so there's no `deleted_at` on `contacts` or `loans`.

6. **One wide `loans` table, not subtype tables per repayment/interest type.** PRD §4 frames every dimension (interest type, timing, rate behavior, repayment type, frequency, timing rule, penalty rule) as an *independent, composable switch* — explicitly warning against "one tangled mega-enum." The relational equivalent of that instruction is one table with nullable columns gated by sibling enum values (e.g. `promo_rate` is only meaningful when `interest_rate_behavior = PROMOTIONAL`), rather than `flat_interest_loans`, `compound_interest_loans`, etc. Validation of "which columns are required given which enum values" is an application-layer concern, documented inline below and enforced in `03_API_SPEC.md`.

7. **Disbursement "structure" is derived, not stored.** PRD §4.1 lists Single / Multiple / Top-up / Additional-borrowing as if they were a field, but per its own description they're really just *however many rows exist in `disbursements`, and when*. There is no `disbursement_structure` column anywhere — a loan with one `disbursements` row is "single," more than one is "multiple," and any row after the loan's first `ACTIVE` activation is a "top-up" by definition of its timing, not a separate flag.

---

## 1. Entity Map

```
users ──< space_members >── spaces ──< space_settings (1:1)
                │                 │
                │                 ├──< contacts
                │                 ├──< space_partners ──< partner_capital_transactions
                │                 ├──< space_invites
                │                 └──< documents, activity_log (polymorphic)
                │
        space_members ──< (FieldMan / Partner / actor on) ...
                │
                └──< loans ──< disbursements
                          ├──< loan_rate_history
                          ├──< loan_tenure_extensions
                          ├──< loan_moratoriums
                          ├──< loan_waivers
                          ├──< repayment_schedule_lines ──< transaction_allocations
                          ├──< transactions ──< transaction_allocations
                          │                └── settlements (1:1, optional)
                          └──< expenses (optional link)
```

Every box under `spaces` carries `space_id`. Every box under `loans` carries both `loan_id` and `space_id` (Principle 2).

---

## 2. Identity & Space Tables

### 2.1 `users`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | BIGINT UNSIGNED | PK, AUTO_INCREMENT | |
| email | VARCHAR(255) | UNIQUE, NOT NULL | login identifier |
| password_hash | VARCHAR(255) | NOT NULL | bcrypt/argon2 |
| display_name | VARCHAR(120) | NOT NULL | |
| notification_prefs | JSON | NULL | account-wide, non-financial — fine per Principle 1's exception scope (display/UX prefs, not money math) |
| last_active_space_id | BIGINT UNSIGNED | NULL, FK → spaces.id | drives "remember last-active space per session," PRD §2.2 |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | NOT NULL ON UPDATE CURRENT_TIMESTAMP | |

No `deleted_at` — account deletion/closure isn't in scope for this pass; flag for `05_ROADMAP.md` if needed later.

### 2.2 `spaces`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | BIGINT UNSIGNED | PK, AUTO_INCREMENT | |
| owner_user_id | BIGINT UNSIGNED | NOT NULL, FK → users.id | creator = automatic Owner, PRD §2.2; transferable (edge case #1) |
| name | VARCHAR(120) | NOT NULL | |
| space_type | ENUM('PERSONAL','BUSINESS') | NOT NULL DEFAULT 'PERSONAL' | gates Partnership Model, §5 |
| space_visibility | ENUM('PRIVATE','SHARED') | NOT NULL DEFAULT 'PRIVATE' | gates membership/roles, §2.4 |
| currency_code | VARCHAR(3) | NOT NULL DEFAULT 'INR' | ISO 4217; space-level per §2.6 |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | NOT NULL ON UPDATE CURRENT_TIMESTAMP | |
| deleted_at | DATETIME | NULL | soft delete, edge case #8 (30-day retention) |

**Type/visibility change guards** (edge cases #5, #6, #7) are application-layer checks, not DB constraints — they depend on *existence* of related rows (`space_partners`, `space_members` count) at the moment of the change, which a CHECK constraint can't express across tables.

### 2.3 `space_members`

The membership + role table. A row exists for every user who can access a space, including the Owner (so permission checks are a single uniform lookup, never "is this the owner, else check membership").

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | BIGINT UNSIGNED | PK, AUTO_INCREMENT | |
| space_id | BIGINT UNSIGNED | NOT NULL, FK → spaces.id | |
| user_id | BIGINT UNSIGNED | NULL, FK → users.id | NULL while invite is pending and the email hasn't registered yet (edge case #2) |
| invited_email | VARCHAR(255) | NULL | populated until `user_id` resolves |
| role | ENUM('OWNER','ADMIN','VIEWER','FIELDMAN') | NOT NULL | enforced server-side per the matrix in PRD §2.4 |
| status | ENUM('PENDING','ACTIVE','REMOVED') | NOT NULL DEFAULT 'ACTIVE' | PENDING = invited, not yet accepted |
| invited_by_member_id | BIGINT UNSIGNED | NULL, FK → space_members.id | audit trail for invites |
| joined_at | DATETIME | NULL | set on acceptance |
| removed_at | DATETIME | NULL | kept, not deleted — historical partner/activity rows reference this id |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | |

**Constraints (app-layer, documented for `03_API_SPEC.md`):**
- Exactly one `ACTIVE` row with `role='OWNER'` per space at all times (edge case #1: blocked removal/departure of sole Owner).
- `UNIQUE(space_id, user_id)` where `user_id IS NOT NULL AND status != 'REMOVED'` — a user can't hold two simultaneous active memberships in the same space. Postgres supports this directly as a **partial unique index** (`CREATE UNIQUE INDEX ... WHERE user_id IS NOT NULL AND status != 'REMOVED'`) — no workaround needed. (Flagging this because it's the one spot where the MySQL→Postgres switch actually simplified something: MySQL can't express a partial unique constraint natively and would have needed a generated/stored column or an application-layer check instead.)

This table is *also* the foreign key target for "who did this" everywhere else in the schema (`performed_by_member_id`, `created_by_member_id`, etc.) instead of pointing at `users` directly — because the relevant identity for permissions and the Partner Dashboard is "this user, in this space, with this role," not the bare user account.

### 2.4 `space_invites`

Kept separate from `space_members` even though a `space_members` row with `status='PENDING'` already represents "invited" — because an invite has its own lifecycle metadata (token, expiry, resend count) that has no business living on the membership row once accepted.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | BIGINT UNSIGNED | PK, AUTO_INCREMENT | |
| space_member_id | BIGINT UNSIGNED | NOT NULL, FK → space_members.id | the PENDING membership this invite resolves |
| token | VARCHAR(64) | UNIQUE, NOT NULL | invite link |
| expires_at | DATETIME | NOT NULL | |
| accepted_at | DATETIME | NULL | |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | |

### 2.5 `space_settings`

One row per space (1:1), replacing v1's per-user settings (PRD §2.6).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| space_id | BIGINT UNSIGNED | PK, FK → spaces.id | |
| default_interest_type | ENUM('NONE','FIXED','FLAT','REDUCING_BALANCE','COMPOUND','CUSTOM') | NOT NULL DEFAULT 'NONE' | seeds new loan forms |
| default_rate_value | DECIMAL(10,4) | NULL | |
| default_rate_period | ENUM('DAY','WEEK','MONTH','YEAR') | NULL | |
| default_repayment_type | ENUM('ONE_TIME','EMI','INTEREST_ONLY','PRINCIPAL_ONLY','FLEXIBLE','CUSTOM_INSTALLMENTS') | NOT NULL DEFAULT 'EMI' | |
| default_payment_frequency | ENUM('DAILY','WEEKLY','BI_WEEKLY','MONTHLY','QUARTERLY') | NULL | |
| default_advance_payment_mode | ENUM('CARRY_FORWARD_CREDIT','RECALCULATE_SCHEDULE') | NOT NULL DEFAULT 'CARRY_FORWARD_CREDIT' | §6 |
| default_penalty_type | ENUM('NONE','FIXED','PERCENTAGE','DAILY_LATE_FEE','MONTHLY_LATE_FEE','EXTRA_INTEREST') | NOT NULL DEFAULT 'NONE' | |
| default_grace_period_days | SMALLINT UNSIGNED | NOT NULL DEFAULT 0 | |
| deduct_expenses_from_reports | BOOLEAN | NOT NULL DEFAULT FALSE | §7 — space-wide default; per-view inline switch is UI state, not stored |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | NOT NULL ON UPDATE CURRENT_TIMESTAMP | |

These are **defaults copied onto a loan at creation time**, not live-referenced thereafter — a loan's actual `interest_type`, `advance_payment_mode`, etc. live on the `loans` row itself. Changing a space's defaults must never silently change existing loans' behavior; this matches the determinism NFR.

---

## 3. Contacts

### 3.1 `contacts`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | BIGINT UNSIGNED | PK, AUTO_INCREMENT | |
| space_id | BIGINT UNSIGNED | NOT NULL, FK → spaces.id | space-scoped, no cross-space linking (§2.5, edge case #45) |
| name | VARCHAR(160) | NOT NULL | |
| relationship_tag | ENUM('FRIEND','RELATIVE','COLLEAGUE','CUSTOMER','VENDOR','BANK','NBFC','OTHER') | NOT NULL DEFAULT 'OTHER' | descriptive only |
| phone | VARCHAR(20) | NULL | |
| email | VARCHAR(255) | NULL | not a login — contacts never authenticate (§2.1) |
| address | TEXT | NULL | |
| notes | TEXT | NULL | |
| created_by_member_id | BIGINT UNSIGNED | NOT NULL, FK → space_members.id | |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | NOT NULL ON UPDATE CURRENT_TIMESTAMP | |

**Deletion is blocked, not soft**, while `loans.contact_id` references this row (edge case #44) — enforced via `ON DELETE RESTRICT` on that FK, which conveniently makes the PRD's required behavior the database's default behavior rather than something the application has to remember to check.

A contact's "net position across both directions" (edge case #48) is computed across that contact's GIVEN and TAKEN loans at read time — not stored.

---

## 4. Loans — Core Table

### 4.1 `loans`

The widest table in the schema, by design (Principle 6). Grouped by PRD subsection for readability — it's one table.

**Identity, direction, lifecycle**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | BIGINT UNSIGNED | PK, AUTO_INCREMENT | |
| space_id | BIGINT UNSIGNED | NOT NULL, FK → spaces.id | |
| contact_id | BIGINT UNSIGNED | NOT NULL, FK → contacts.id ON DELETE RESTRICT | the counterparty, regardless of direction |
| direction | ENUM('GIVEN','TAKEN') | NOT NULL | |
| status | ENUM('DRAFT','ACTIVE','CLOSED') | NOT NULL DEFAULT 'DRAFT' | **`OVERDUE` is never stored here** — computed (§4.5 below) |
| closure_reason | ENUM('FULLY_PAID','SETTLED','WRITTEN_OFF','MANUALLY_CLOSED') | NULL | NOT NULL once `status='CLOSED'` (app-enforced) |
| closure_note | TEXT | NULL | required when `closure_reason='MANUALLY_CLOSED'` |
| closed_at | DATETIME | NULL | |
| closed_by_member_id | BIGINT UNSIGNED | NULL, FK → space_members.id | |
| written_off_amount | DECIMAL(14,2) | NULL | populated only when `closure_reason='WRITTEN_OFF'`; equals outstanding balance at closure (§3.1) — snapshotted, never recomputed |
| reopened_at | DATETIME | NULL | most recent reopen, if any (edge case #38) |
| created_by_member_id | BIGINT UNSIGNED | NOT NULL, FK → space_members.id | |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | NOT NULL ON UPDATE CURRENT_TIMESTAMP | |

**Principal, dates**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| principal_amount | DECIMAL(14,2) | NOT NULL, CHECK (principal_amount > 0) | edge case #18 |
| start_date | DATETIME | NOT NULL | first disbursement date |
| first_due_date | DATE | NULL | required unless `payment_timing_rule='ANYTIME'`; must be ≥ `start_date` (edge case #17) |
| tenure_periods | SMALLINT UNSIGNED | NULL | count of installment periods; period unit = `payment_frequency` |

**Interest configuration (§4.2–4.4)**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| interest_type | ENUM('NONE','FIXED','FLAT','REDUCING_BALANCE','COMPOUND','CUSTOM') | NOT NULL | **Resolution:** the PRD's §4.2 bullets read as a flat list, but "Percentage" is describing the *rate mechanism* shared by Flat/Reducing/Compound, not a sixth sibling type. Modeled here as a 6-value enum: `NONE`, `FIXED` (rupee-amount based), `FLAT`/`REDUCING_BALANCE`/`COMPOUND` (all percentage/rate-based, sharing `rate_value`+`rate_period` below), and `CUSTOM` (the loan's interest itself bypasses formulas entirely — user enters amounts manually per schedule line; this is a different dimension from `repayment_type='CUSTOM_INSTALLMENTS'` below, see edge case #12 discussion in `03_API_SPEC.md` §6.2). |
| rate_value | DECIMAL(10,4) | NULL | required when `interest_type IN ('FLAT','REDUCING_BALANCE','COMPOUND')`; 0 allowed (edge case #19, warning-only) |
| rate_period | ENUM('DAY','WEEK','MONTH','YEAR') | NULL | the single mechanism behind "5% per month" vs "12% per year" — no separate per-period interest types |
| fixed_interest_amount | DECIMAL(14,2) | NULL | required when `interest_type='FIXED'` |
| fixed_interest_frequency | ENUM('ONE_TIME','RECURRING') | NULL | required when `interest_type='FIXED'` |
| interest_timing | ENUM('COLLECTED_UPFRONT','DEDUCTED_FROM_DISBURSEMENT','PAYABLE_AT_END','PAYABLE_PERIODICALLY') | NOT NULL DEFAULT 'PAYABLE_PERIODICALLY' | independent of `interest_type`, §4.3 |
| net_disbursed_amount | DECIMAL(14,2) | NULL | only when `interest_timing='DEDUCTED_FROM_DISBURSEMENT'`; CHECK (`net_disbursed_amount < principal_amount`) (edge case #15) |
| interest_rate_behavior | ENUM('FIXED','VARIABLE','PROMOTIONAL') | NOT NULL DEFAULT 'FIXED' | §4.4 |
| promo_rate | DECIMAL(10,4) | NULL | only when `interest_rate_behavior='PROMOTIONAL'`; default 0 |
| promo_period_days | SMALLINT UNSIGNED | NULL | only when `interest_rate_behavior='PROMOTIONAL'`; CHECK against `tenure_periods` is app-layer (needs period-unit conversion, edge case #13) |

**Repayment configuration (§4.5–4.7)**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| repayment_type | ENUM('ONE_TIME','EMI','INTEREST_ONLY','PRINCIPAL_ONLY','FLEXIBLE','CUSTOM_INSTALLMENTS') | NOT NULL | **Resolution:** "Bullet" is a UI label/alias for `ONE_TIME`, not a separate value. "Balloon" is `INTEREST_ONLY` + `has_balloon_final_payment=TRUE` below, not a separate value — both per the PRD's own framing as named combinations rather than new primitives. Locked after activation (edge case #11). |
| has_balloon_final_payment | BOOLEAN | NOT NULL DEFAULT FALSE | only meaningful when `repayment_type='INTEREST_ONLY'`; schedule generator appends one principal-only final line |
| payment_frequency | ENUM('DAILY','WEEKLY','BI_WEEKLY','MONTHLY','QUARTERLY') | NULL | required for EMI / INTEREST_ONLY / PRINCIPAL_ONLY; "Daily collections" = `DAILY` |
| payment_timing_rule | ENUM('SCHEDULED','ANYTIME') | NOT NULL DEFAULT 'SCHEDULED' | `ANYTIME` pairs with `repayment_type='FLEXIBLE'`; no overdue concept applies to these loans by definition |

**Advance payment, penalty (§6, §4.10)**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| advance_payment_mode | ENUM('CARRY_FORWARD_CREDIT','RECALCULATE_SCHEDULE') | NOT NULL | copied from `space_settings.default_advance_payment_mode` at creation; per-loan override thereafter |
| advance_credit_balance | DECIMAL(14,2) | NOT NULL DEFAULT 0 | running credit balance under `CARRY_FORWARD_CREDIT`; zeroed on mode switch (edge case #32) or write-off (edge case #37) |
| penalty_type | ENUM('NONE','FIXED','PERCENTAGE','DAILY_LATE_FEE','MONTHLY_LATE_FEE','EXTRA_INTEREST') | NOT NULL DEFAULT 'NONE' | |
| penalty_value | DECIMAL(10,4) | NULL | amount or percentage depending on `penalty_type` |
| grace_period_days | SMALLINT UNSIGNED | NOT NULL DEFAULT 0 | copied from space default at creation; later edits apply prospectively only (edge case #34) |

**App-layer validation flagged for `03_API_SPEC.md`:** `penalty_type='EXTRA_INTEREST'` combined with `interest_type='COMPOUND'` is blocked (edge case #35) — not expressible as a single-table CHECK constraint cleanly, so it's a request-validation rule.

### 4.2 `disbursements`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | BIGINT UNSIGNED | PK, AUTO_INCREMENT | |
| space_id | BIGINT UNSIGNED | NOT NULL, FK → spaces.id | |
| loan_id | BIGINT UNSIGNED | NOT NULL, FK → loans.id | |
| amount | DECIMAL(14,2) | NOT NULL | |
| disbursement_date | DATETIME | NOT NULL | future dates allowed while DRAFT (edge case #16) |
| sequence_no | SMALLINT UNSIGNED | NOT NULL | 1 = original; 2+ = top-up/additional borrowing, by definition (Principle 7) |
| label | ENUM('ORIGINAL','TOP_UP','ADDITIONAL_BORROWING') | NOT NULL DEFAULT 'ORIGINAL' | display-only distinction between top-up vs additional borrowing — same mechanism, per §4.1 |
| created_by_member_id | BIGINT UNSIGNED | NOT NULL, FK → space_members.id | |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | |

`loans.principal_amount` is the seed (first) disbursement's amount conceptually, but the **outstanding principal is always `SUM(disbursements.amount)` minus principal repaid** — not re-derived from the `loans.principal_amount` column alone once top-ups exist. (App layer: keep `loans.principal_amount` equal to the sequence-1 row's amount for query convenience; never write top-up amounts into it.)

### 4.3 `loan_rate_history`

Handles three PRD mechanisms with one table, exactly as instructed in §4.4: Variable rate changes, Promotional-rate expiry, and Restructuring → Change Interest Rate (§8) all "recalculate the remaining schedule from the effective date forward" — same shape, different trigger.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | BIGINT UNSIGNED | PK, AUTO_INCREMENT | |
| space_id | BIGINT UNSIGNED | NOT NULL, FK → spaces.id | |
| loan_id | BIGINT UNSIGNED | NOT NULL, FK → loans.id | |
| effective_from | DATE | NOT NULL, CHECK (effective_from >= CURRENT_DATE at insert time, app-enforced) | edge case #14 |
| rate_value | DECIMAL(10,4) | NOT NULL | |
| rate_period | ENUM('DAY','WEEK','MONTH','YEAR') | NOT NULL | |
| trigger | ENUM('INITIAL','VARIABLE_CHANGE','PROMO_EXPIRY','RESTRUCTURING') | NOT NULL | `INITIAL` row is written at loan creation so the full rate timeline is always queryable from one table |
| reason | TEXT | NULL | required (app-enforced) when `trigger='RESTRUCTURING'`, per §8 |
| created_by_member_id | BIGINT UNSIGNED | NOT NULL, FK → space_members.id | |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | |

### 4.4 `loan_tenure_extensions`, `loan_moratoriums`, `loan_waivers`

Three small, typed tables for the remaining Restructuring actions (§8) that aren't rate changes. Kept separate from each other (rather than one generic `restructuring_events` + JSON payload) because each has genuinely different required fields that drive different schedule-regeneration logic — collapsing them into JSON would violate Principle 1 for exactly the kind of data (tenure, dates, waived amounts) that determines money owed.

**`loan_tenure_extensions`**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | BIGINT UNSIGNED | PK, AUTO_INCREMENT | |
| space_id | BIGINT UNSIGNED | NOT NULL, FK → spaces.id | |
| loan_id | BIGINT UNSIGNED | NOT NULL, FK → loans.id | |
| added_periods | SMALLINT UNSIGNED | NOT NULL | |
| tenure_periods_before | SMALLINT UNSIGNED | NOT NULL | snapshot |
| tenure_periods_after | SMALLINT UNSIGNED | NOT NULL | snapshot; also written to `loans.tenure_periods` |
| reason | TEXT | NOT NULL | §8: every restructuring action requires a reason |
| performed_by_member_id | BIGINT UNSIGNED | NOT NULL, FK → space_members.id | |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | |

**`loan_moratoriums`**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | BIGINT UNSIGNED | PK, AUTO_INCREMENT | |
| space_id | BIGINT UNSIGNED | NOT NULL, FK → spaces.id | |
| loan_id | BIGINT UNSIGNED | NOT NULL, FK → loans.id | |
| pause_start_date | DATE | NOT NULL | must cover only UNPAID, future installments (edge case #40, app-enforced against `repayment_schedule_lines`) |
| pause_end_date | DATE | NOT NULL | |
| interest_free | BOOLEAN | NOT NULL DEFAULT FALSE | default is interest continues accruing during the pause (§8) — this flag is the explicit opt-out |
| reason | TEXT | NOT NULL | |
| performed_by_member_id | BIGINT UNSIGNED | NOT NULL, FK → space_members.id | |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | |

**`loan_waivers`**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | BIGINT UNSIGNED | PK, AUTO_INCREMENT | |
| space_id | BIGINT UNSIGNED | NOT NULL, FK → spaces.id | |
| loan_id | BIGINT UNSIGNED | NOT NULL, FK → loans.id | |
| waiver_type | ENUM('INTEREST','PENALTY') | NOT NULL | |
| waived_amount | DECIMAL(14,2) | NOT NULL | snapshot of what was zeroed out at the moment of waiver — feeds Partner Allocation loss math (§3.1/§5.2) without needing to be recomputed later |
| reason | TEXT | NOT NULL | |
| performed_by_member_id | BIGINT UNSIGNED | NOT NULL, FK → space_members.id | |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | |

All four of the tables above (`loan_rate_history` with `trigger='RESTRUCTURING'`, plus these three) are restricted to Owner/Admin at the API layer (edge case #39) — no schema-level role check, since role lookup requires joining `space_members`.

### 4.5 `repayment_schedule_lines`

Installments. Versioned in place rather than mutated, so recalculation (advance payments, restructuring, variable rate changes) never destroys history — PRD is explicit about this for `RECALCULATE_SCHEDULE` ("superseded schedule rows are kept in history, not deleted") and the same principle is applied uniformly to every other recalculation trigger.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | BIGINT UNSIGNED | PK, AUTO_INCREMENT | |
| space_id | BIGINT UNSIGNED | NOT NULL, FK → spaces.id | |
| loan_id | BIGINT UNSIGNED | NOT NULL, FK → loans.id | |
| schedule_version | SMALLINT UNSIGNED | NOT NULL DEFAULT 1 | increments on every regeneration |
| line_no | SMALLINT UNSIGNED | NOT NULL | order within a version |
| due_date | DATE | NOT NULL | |
| principal_due | DECIMAL(14,2) | NOT NULL | |
| interest_due | DECIMAL(14,2) | NOT NULL DEFAULT 0 | 0 for `repayment_type='PRINCIPAL_ONLY'` |
| status | ENUM('PENDING','PAID') | NOT NULL DEFAULT 'PENDING' | **no `OVERDUE` value** — overdue is `status='PENDING' AND due_date < CURRENT_DATE` evaluated at read time against the *current* version's lines only |
| is_current_version | BOOLEAN | NOT NULL DEFAULT TRUE | flips to FALSE when superseded; superseding event recorded via `superseded_by_*` below |
| superseded_by_type | ENUM('ADVANCE_PAYMENT','RESTRUCTURING','RATE_CHANGE','CUSTOM_EDIT') | NULL | which mechanism triggered regeneration |
| superseded_by_id | BIGINT UNSIGNED | NULL | polymorphic pointer (transaction id / restructuring-table id), resolved via `superseded_by_type` |
| is_custom_line | BOOLEAN | NOT NULL DEFAULT FALSE | TRUE for `repayment_type='CUSTOM_INSTALLMENTS'` or `interest_type='CUSTOM'` — system applies no formula, stores exactly what the user entered |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | |

**Penalty is intentionally not a column here.** Per Principle 4, penalty accrual on an overdue line is computed at read time from `loans.penalty_type` / `penalty_value` / `grace_period_days`, the line's `due_date`, today's date, and any offsetting `loan_waivers` rows — because (for `DAILY_LATE_FEE`/`MONTHLY_LATE_FEE`) the "correct" value changes every day the loan stays overdue, and persisting it would require a background job re-writing rows daily for no benefit over computing it on read.

A loan with `payment_timing_rule='FLEXIBLE'`/`'ANYTIME'` has **zero rows** in this table — it's tracked purely via the running balance of disbursements minus `transaction_allocations`, consistent with "no due date, therefore no overdue concept" (§4.5/§4.7).

A `CUSTOM_INSTALLMENTS`/`CUSTOM` interest loan still uses this table — it's populated by direct user entry instead of a formula (`is_custom_line=TRUE`), so the **inspectability** requirement (every loan's obligations live in one queryable table) holds even for the unstructured case. Edge case #21 (custom schedule total ≠ principal) and #22 (zero rows blocks activation) are validated against this table's contents.

---

## 5. Transactions & Ledger

### 5.1 `transactions`

The append-only ledger (§9, "Transactions" module). Every money-movement record, regardless of type, lives here — including disbursements (also separately tracked in `disbursements` for schedule-generation purposes, but the *ledger view* of "money that moved" includes them).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | BIGINT UNSIGNED | PK, AUTO_INCREMENT | |
| space_id | BIGINT UNSIGNED | NOT NULL, FK → spaces.id | |
| loan_id | BIGINT UNSIGNED | NOT NULL, FK → loans.id | |
| type | ENUM('PAYMENT_RECEIVED','PAYMENT_MADE','INTEREST_RECEIVED','INTEREST_PAID','PENALTY_RECEIVED','PENALTY_PAID','DISBURSEMENT','SETTLEMENT','MANUAL_ADJUSTMENT') | NOT NULL | |
| amount | DECIMAL(14,2) | NOT NULL | sign convention: always stored positive; `type` carries direction. `MANUAL_ADJUSTMENT` is the one exception allowed to be negative (edge case #31) |
| transaction_date | DATETIME | NOT NULL | future dates allowed with a warning, not a block (edge case #27); must not predate `loans.start_date` (edge case #30) |
| collection_method | ENUM('CASH','UPI','BANK_TRANSFER','CHEQUE','AUTO_DEBIT','OTHER') | NULL | descriptive metadata only (§4.8), not a payment integration |
| note | TEXT | NULL | |
| reverses_transaction_id | BIGINT UNSIGNED | NULL, FK → transactions.id | non-null on the reversing row created by a "delete" (edge case #29) |
| is_reversed | BOOLEAN | NOT NULL DEFAULT FALSE | flips to TRUE on the *original* row once a reversal exists; original stays visible, marked "Reversed" |
| adjustment_reason | TEXT | NULL | required when `type='MANUAL_ADJUSTMENT'` |
| created_by_member_id | BIGINT UNSIGNED | NOT NULL, FK → space_members.id | |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | no `updated_at` — append-only (Principle 3) |

A "deleted" transaction is never `DELETE`d or `UPDATE`d (edge case #29): the app inserts a new row with **`type='MANUAL_ADJUSTMENT'`** — not the original transaction's type — with `amount` equal to the original's amount but applied as a negation of its effect, `reverses_transaction_id` set, and `adjustment_reason` defaulted to `"Reversal of transaction #<id>"` plus any reason the caller supplies. The original row's `is_reversed` flips to `TRUE`; it stays visible, marked "Reversed."

**Resolution — this corrects an earlier draft of this table, which said the reversing row's type was "mirrored" (e.g. a reversed `PAYMENT_RECEIVED` would itself be `PAYMENT_RECEIVED`).** That contradicts the PRD's own edge case #29 wording ("auto-creates a reversing `MANUAL_ADJUSTMENT`") and would have broken the sign convention in §5.1 (amounts are always stored positive, with `type` carrying direction) — a mirrored-type reversal would need a *negative* `PAYMENT_RECEIVED`, which the sign convention explicitly reserves as a `MANUAL_ADJUSTMENT`-only exception. Routing every reversal through `MANUAL_ADJUSTMENT` is both what the PRD says and the only path that doesn't require bending the sign rule for every other transaction type.

### 5.2 `transaction_allocations`

A single payment transaction can satisfy parts of one or several `repayment_schedule_lines` (e.g. a partial payment, or a lump sum covering two overdue installments at once). This join table is what makes "outstanding balance per line" and "outstanding balance per loan" both derivable from the same source data without duplicating amounts.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | BIGINT UNSIGNED | PK, AUTO_INCREMENT | |
| space_id | BIGINT UNSIGNED | NOT NULL, FK → spaces.id | |
| transaction_id | BIGINT UNSIGNED | NOT NULL, FK → transactions.id | |
| schedule_line_id | BIGINT UNSIGNED | NULL, FK → repayment_schedule_lines.id | NULL for FLEXIBLE/ANYTIME loans (no lines to allocate against) and for advance-credit allocations not yet matched to a future line |
| principal_component | DECIMAL(14,2) | NOT NULL DEFAULT 0 | |
| interest_component | DECIMAL(14,2) | NOT NULL DEFAULT 0 | |
| penalty_component | DECIMAL(14,2) | NOT NULL DEFAULT 0 | |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | |

**Outstanding balance for a line** = `principal_due + interest_due − SUM(allocations.principal_component + allocations.interest_component for that line)`. A line's `status` flips to `PAID` when this hits zero (app logic on write, not a generated column, since penalty/interest accrual inputs change daily even when no new allocation is written).

**Excess payment routing (edge case #26):** when an allocation would overpay a line, the excess is *not* forced into `penalty_component`/etc. — it's left unallocated against any line (`schedule_line_id = NULL`) and either (a) added to `loans.advance_credit_balance` under `CARRY_FORWARD_CREDIT`, or (b) triggers schedule regeneration under `RECALCULATE_SCHEDULE`, per §6.

### 5.3 `settlements`

Extends a `transactions` row of `type='SETTLEMENT'` with the extra fields that type needs (§3.1) — modeled as a 1:1 extension table rather than nullable columns bolted onto `transactions`, since these fields are meaningless for every other transaction type.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| transaction_id | BIGINT UNSIGNED | PK, FK → transactions.id | 1:1 |
| space_id | BIGINT UNSIGNED | NOT NULL, FK → spaces.id | |
| loan_id | BIGINT UNSIGNED | NOT NULL, FK → loans.id | |
| settlement_amount | DECIMAL(14,2) | NOT NULL | can be 0 (§3.1) |
| outstanding_balance_at_settlement | DECIMAL(14,2) | NOT NULL | snapshot, immutable — CHECK (`settlement_amount <= outstanding_balance_at_settlement`) (edge case #36) |
| forgiven_amount | DECIMAL(14,2) | GENERATED ALWAYS AS (outstanding_balance_at_settlement - settlement_amount) STORED | derived, but stored as a generated column since it's used directly in Partner Allocation math (§5.2) and should never silently drift from its two inputs |
| settlement_date | DATE | NOT NULL | |
| note | TEXT | NULL | |

Logging this row is the action that closes the loan (`loans.status='CLOSED'`, `closure_reason='SETTLED'`) — handled transactionally in the API layer, not via a DB trigger, to keep the closure side-effects (zeroing `advance_credit_balance` if applicable, writing `activity_log`) in one auditable application transaction.

**Write-off has no row here**, by design (§3.1: "no Settlement transaction is logged"). It's `loans.closure_reason='WRITTEN_OFF'` + `loans.written_off_amount` directly, with no `transactions` row at all — there was no payment, so there's nothing to log in a payment ledger.

---

## 6. Expenses

### 6.1 `expenses`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | BIGINT UNSIGNED | PK, AUTO_INCREMENT | |
| space_id | BIGINT UNSIGNED | NOT NULL, FK → spaces.id | |
| loan_id | BIGINT UNSIGNED | NULL, FK → loans.id | optional link (§9) |
| category | ENUM('DOCUMENTATION','TRAVEL','LEGAL','COLLECTION','PROCESSING','MISCELLANEOUS') | NOT NULL | |
| amount | DECIMAL(14,2) | NOT NULL | |
| expense_date | DATE | NOT NULL | |
| note | TEXT | NULL | |
| created_by_member_id | BIGINT UNSIGNED | NOT NULL, FK → space_members.id | |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | |

Feeds the Expense Deduction Toggle (§7) and Partner Allocation (§5.2) purely as a reporting-time `SUM(...) WHERE expense_date BETWEEN ...` — never written back into `transactions` or any profitability column, per §7 ("only affects reporting presentation — never the underlying ledger").

---

## 7. Business Space Partnership Model

Tables in this section are only ever populated for `spaces.space_type='BUSINESS' AND spaces.space_visibility='SHARED'`, but there's no DB-level CHECK enforcing that — the API layer refuses to create `space_partners` rows otherwise, since a CHECK constraint would need to query a different table.

### 7.1 `space_partners`

Partnership status attaches to a **membership**, not a role (§5.1 — "any member... Owner, Admin, Viewer, or FieldMan — can be designated a Partner"), so this references `space_members.id`.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | BIGINT UNSIGNED | PK, AUTO_INCREMENT | |
| space_id | BIGINT UNSIGNED | NOT NULL, FK → spaces.id | |
| space_member_id | BIGINT UNSIGNED | NOT NULL, UNIQUE, FK → space_members.id | one partner record per membership |
| initial_contribution_amount | DECIMAL(14,2) | NULL | both this and `profit_share_percent` are independently nullable (§5.1) |
| profit_share_percent | DECIMAL(5,2) | NULL | e.g. 50.00; sum across partners ≠ 100% is a warning, not a block (edge case #41, **open decision per PRD** — flagged below) |
| created_by_member_id | BIGINT UNSIGNED | NOT NULL, FK → space_members.id | must hold Owner/Admin permission at write time (§5.1) — app-enforced |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | NOT NULL ON UPDATE CURRENT_TIMESTAMP | |

**Removal is blocked**, not deleted, while `Net Position != 0` (edge case #42) — computed from §7.2 below, so this is an application check at delete-time, not a FK constraint.

### 7.2 `partner_capital_transactions`

The append-only capital ledger (§5.3), separate from the loan `transactions` ledger by design — capital movements aren't loan-related money movement, they're ownership-stake movement.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | BIGINT UNSIGNED | PK, AUTO_INCREMENT | |
| space_id | BIGINT UNSIGNED | NOT NULL, FK → spaces.id | |
| space_partner_id | BIGINT UNSIGNED | NOT NULL, FK → space_partners.id | |
| type | ENUM('CONTRIBUTION','WITHDRAWAL') | NOT NULL | |
| amount | DECIMAL(14,2) | NOT NULL | always positive; `type` carries direction |
| transaction_date | DATE | NOT NULL | |
| note | TEXT | NULL | |
| created_by_member_id | BIGINT UNSIGNED | NOT NULL, FK → space_members.id | Owner/Admin only (§5.3) — app-enforced |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | |

**Net Position (computed, never stored — Principle 4):**

```
Net Position = space_partners.initial_contribution_amount
             + SUM(partner_capital_transactions WHERE type='CONTRIBUTION')
             − SUM(partner_capital_transactions WHERE type='WITHDRAWAL')
             + cumulative allocated profit over the partner's membership
             − cumulative allocated loss over the partner's membership
```

Allocated profit/loss per period (§5.2) is itself computed, not stored:

```
period P&L (space-level) = SUM(transactions.type='INTEREST_RECEIVED')
                          − SUM(transactions.type='INTEREST_PAID')
                          − SUM(loan_waivers.waiver_type='PENALTY')   -- penalties forgiven
                          − SUM(settlements.forgiven_amount)
                          − SUM(loans.written_off_amount for loans closed in period)
                          [− SUM(expenses) if space_settings.deduct_expenses_from_reports]
partner's allocated P&L = period P&L × space_partners.profit_share_percent
```

Withdrawal validation (edge case #43: can't exceed current Net Position) re-runs this formula at write time — there's no stored "current balance" column to go stale, which is the point of computing it (Principle 4).

---

## 8. Documents

### 8.1 `documents`

Polymorphic attachment table covering both attachment targets named in the PRD (§9: "Attachments on loans/contacts").

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | BIGINT UNSIGNED | PK, AUTO_INCREMENT | |
| space_id | BIGINT UNSIGNED | NOT NULL, FK → spaces.id | |
| entity_type | ENUM('LOAN','CONTACT') | NOT NULL | |
| entity_id | BIGINT UNSIGNED | NOT NULL | polymorphic — resolved against `loans.id` or `contacts.id` per `entity_type`; no DB-level FK possible across two target tables, validated at the API layer |
| document_type | ENUM('AGREEMENT','ID_PROOF','PROMISSORY_NOTE','RECEIPT','CHEQUE_IMAGE','OTHER') | NOT NULL DEFAULT 'OTHER' | |
| file_name | VARCHAR(255) | NOT NULL | |
| storage_path | VARCHAR(500) | NOT NULL | object storage key/URL |
| file_size_bytes | INT UNSIGNED | NULL | |
| uploaded_by_member_id | BIGINT UNSIGNED | NOT NULL, FK → space_members.id | |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | |

Documents "remain attached to historical records" (v1 carryover, §9) — there's no cascade delete; since both `loans` and `contacts` deletion is blocked while referenced data exists, this is naturally satisfied rather than separately enforced.

---

## 9. Activity Timeline

### 9.1 `activity_log`

The audit feed for the Activity Timeline (§9). Polymorphic and JSON-bearing by deliberate exception to Principle 1 — this table's job is *human-readable history*, not recomputation. Every event it describes has its true source-of-truth row in a typed table elsewhere (a `transactions` row, a `loan_rate_history` row, a `space_members` row, etc.); `activity_log` just indexes them for a unified, chronological, cross-entity feed so the Timeline screen doesn't have to UNION eight tables on every page load.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | BIGINT UNSIGNED | PK, AUTO_INCREMENT | |
| space_id | BIGINT UNSIGNED | NOT NULL, FK → spaces.id | |
| event_type | VARCHAR(60) | NOT NULL | e.g. `LOAN_CREATED`, `PAYMENT_RECEIVED`, `LOAN_CLOSED`, `RATE_CHANGED`, `MEMBER_INVITED`, `MORATORIUM_ADDED` — open string set, not an enum, since this list will grow without a migration |
| entity_type | ENUM('LOAN','CONTACT','TRANSACTION','SPACE_MEMBER','SPACE','EXPENSE','SPACE_PARTNER') | NOT NULL | |
| entity_id | BIGINT UNSIGNED | NOT NULL | polymorphic, resolved per `entity_type`, same caveat as `documents.entity_id` |
| actor_member_id | BIGINT UNSIGNED | NULL, FK → space_members.id | NULL for system-generated events (e.g. computed status changes, if ever logged) |
| description | VARCHAR(500) | NOT NULL | precomputed human-readable line, e.g. "Rahul's loan moved to OVERDUE" — generated at write time, not re-derived from `metadata` on every read |
| metadata | JSON | NULL | type-specific display details only (e.g. `{"old_rate": 2.0, "new_rate": 2.5}` for a rate-change event) — never the sole record of the change; the typed row always exists separately |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | append-only, no `updated_at` (Principle 3) |

No row is ever updated or deleted — corrections/reversals get their own new `activity_log` row pointing at the new `transactions`/etc. row, exactly mirroring how the underlying ledgers handle corrections.

---

## 10. Enum Reference (consolidated)

| Enum | Values | Used by |
|---|---|---|
| `space_type` | PERSONAL, BUSINESS | spaces |
| `space_visibility` | PRIVATE, SHARED | spaces |
| `member_role` | OWNER, ADMIN, VIEWER, FIELDMAN | space_members |
| `member_status` | PENDING, ACTIVE, REMOVED | space_members |
| `loan_direction` | GIVEN, TAKEN | loans |
| `loan_status` | DRAFT, ACTIVE, CLOSED | loans *(OVERDUE is computed — never a stored value)* |
| `closure_reason` | FULLY_PAID, SETTLED, WRITTEN_OFF, MANUALLY_CLOSED | loans |
| `interest_type` | NONE, FIXED, FLAT, REDUCING_BALANCE, COMPOUND, CUSTOM | loans |
| `fixed_interest_frequency` | ONE_TIME, RECURRING | loans |
| `rate_period` | DAY, WEEK, MONTH, YEAR | loans, loan_rate_history, space_settings |
| `interest_timing` | COLLECTED_UPFRONT, DEDUCTED_FROM_DISBURSEMENT, PAYABLE_AT_END, PAYABLE_PERIODICALLY | loans |
| `interest_rate_behavior` | FIXED, VARIABLE, PROMOTIONAL | loans |
| `repayment_type` | ONE_TIME, EMI, INTEREST_ONLY, PRINCIPAL_ONLY, FLEXIBLE, CUSTOM_INSTALLMENTS | loans, space_settings |
| `payment_frequency` | DAILY, WEEKLY, BI_WEEKLY, MONTHLY, QUARTERLY | loans, space_settings |
| `payment_timing_rule` | SCHEDULED, ANYTIME | loans |
| `advance_payment_mode` | CARRY_FORWARD_CREDIT, RECALCULATE_SCHEDULE | loans, space_settings |
| `penalty_type` | NONE, FIXED, PERCENTAGE, DAILY_LATE_FEE, MONTHLY_LATE_FEE, EXTRA_INTEREST | loans, space_settings |
| `collection_method` | CASH, UPI, BANK_TRANSFER, CHEQUE, AUTO_DEBIT, OTHER | transactions |
| `transaction_type` | PAYMENT_RECEIVED, PAYMENT_MADE, INTEREST_RECEIVED, INTEREST_PAID, PENALTY_RECEIVED, PENALTY_PAID, DISBURSEMENT, SETTLEMENT, MANUAL_ADJUSTMENT | transactions |
| `schedule_line_status` | PENDING, PAID | repayment_schedule_lines |
| `disbursement_label` | ORIGINAL, TOP_UP, ADDITIONAL_BORROWING | disbursements |
| `rate_history_trigger` | INITIAL, VARIABLE_CHANGE, PROMO_EXPIRY, RESTRUCTURING | loan_rate_history |
| `waiver_type` | INTEREST, PENALTY | loan_waivers |
| `capital_txn_type` | CONTRIBUTION, WITHDRAWAL | partner_capital_transactions |
| `document_type` | AGREEMENT, ID_PROOF, PROMISSORY_NOTE, RECEIPT, CHEQUE_IMAGE, OTHER | documents |
| `document_entity_type` | LOAN, CONTACT | documents |
| `activity_entity_type` | LOAN, CONTACT, TRANSACTION, SPACE_MEMBER, SPACE, EXPENSE, SPACE_PARTNER | activity_log |
| `relationship_tag` | FRIEND, RELATIVE, COLLEAGUE, CUSTOMER, VENDOR, BANK, NBFC, OTHER | contacts |
| `expense_category` | DOCUMENTATION, TRAVEL, LEGAL, COLLECTION, PROCESSING, MISCELLANEOUS | expenses |

---

## 11. Computed-Not-Stored Reference

A quick index of every value the product surfaces that does **not** have a backing column, per Principle 4 — so it's obvious during the build which numbers are "always recompute, never trust a cache":

| Value | Computed from |
|---|---|
| Loan is `OVERDUE` | `status='ACTIVE' AND payment_timing_rule='SCHEDULED' AND EXISTS (repayment_schedule_lines WHERE is_current_version AND status='PENDING' AND due_date < today)` |
| Outstanding balance (loan) | `SUM(disbursements.amount) − SUM(transaction_allocations.principal_component)` for current-version lines, plus unallocated interest/penalty due |
| Outstanding balance (schedule line) | `principal_due + interest_due − SUM(allocations for that line)` |
| Accrued penalty (a given moment) | `loans.penalty_type/value/grace_period_days` × days/periods overdue since `due_date`, minus any `loan_waivers WHERE waiver_type='PENALTY'` |
| Contact net position | `SUM(outstanding balance, loans WHERE direction='GIVEN') − SUM(outstanding balance, loans WHERE direction='TAKEN')`, per contact |
| Partner Net Position | formula in §7.2 |
| Space-level dashboard totals | aggregates over `loans`/`transactions` filtered to `space_id` — never aggregated across spaces (NFR, §10) |

---

## 12. Indexing Notes (for the build, not exhaustive DDL)

- Every table: index on `space_id` (the universal filter, Principle 2).
- `loans`: composite index on `(space_id, status)` and `(space_id, contact_id)` for dashboard/contact-detail queries; `(space_id, direction, status)` for the Loans list category filters.
- `repayment_schedule_lines`: composite `(loan_id, is_current_version, status, due_date)` — the single index that answers "is this loan overdue" and "what's due this week/month" efficiently.
- `transactions`: `(loan_id, transaction_date)` and `(space_id, transaction_date)` for ledger views and Cash Flow report.
- `activity_log`: `(space_id, created_at DESC)` for the Timeline feed; `(entity_type, entity_id)` for "history for this specific record."

---

## 13. Open Items Carried Over From the PRD

These are flagged in `01_PRD.md` as open decisions (not yet locked), so the schema above implements the PRD's *stated current default* but isn't claiming the question is closed:

1. **Partner share % summing to ≠ 100%** (edge case #41) — currently warning-only; no CHECK constraint enforces a 100% total across `space_partners` rows for a space. If this becomes a hard rule later, it'd need an application-level aggregate check at write time (still not a single-row CHECK).
2. **Import into a non-empty space** (edge case #46) — currently blocked; no schema impact either way, noted here only so the import tooling in a future roadmap phase doesn't need to design merge semantics yet.

---

*Next: `03_API_SPEC.md` gets reworked against this file's tables — every endpoint's request/response shape should trace back to a table or computed-value entry above.*
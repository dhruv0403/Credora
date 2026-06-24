# Credora — API Specification (v2)

**Stack:** Django + Django REST Framework (DRF) · React frontend · PostgreSQL
**Status:** Rebuilt against `02_DATA_MODEL.md` (Spaces architecture). Every endpoint below traces back to a table or computed-value entry in that file.
**Companion docs:** `04_SCREENS.md`, `05_ROADMAP.md` (next, in that order).

---

## 0. Conventions

**1. Resource hierarchy is space-first, structurally — not just by convention.** Almost every endpoint is nested under `/api/spaces/{space_id}/...`. This isn't REST purism for its own sake: PRD §10 requires every query scoped by `space_id` with RBAC enforced server-side, and the data model's Principle 2 puts `space_id` on every table for the same reason. Putting `space_id` in the URL path means the space-scoping check (does this user have *any* membership in this space at all) happens once, in shared middleware, before a single DRF view runs — rather than being something every view has to remember to do in its queryset.

**2. Auth: JWT, not session.** `djangorestframework-simplejwt`. Access token short-lived (~15 min), refresh token longer-lived, refresh rotation on use. Chosen over Django session auth because the frontend is a separate React SPA (and the PRD doesn't rule out a future mobile client) — a token-based API is the cleaner boundary, and it's what `recommend_claude_apps`-style separate-frontend setups expect.

**3. Authorization is two layers, both server-side:**
- **Layer 1 — Space membership.** Custom permission class `IsSpaceMember` resolves `request.user`'s `space_members` row for the `space_id` in the URL. No row, no access — 404, not 403 (don't leak the existence of spaces a user isn't in).
- **Layer 2 — Role check.** Per-endpoint permission classes (`IsOwner`, `IsOwnerOrAdmin`, `CanWrite` — i.e. not VIEWER, `CanRecordCollection` — i.e. OWNER/ADMIN/FIELDMAN) map directly to the matrix in PRD §2.4. These are declared per-viewset-action, not inferred — e.g. a `LoanViewSet` declares `IsOwnerOrAdmin` for `restructure_*` actions and `CanWrite` (excludes VIEWER) for `create`/`update`, matching the matrix's "Loans: Owner/Admin/Viewer = YES, FieldMan = View only" plus the narrower "Add Payment: Owner/Admin/FieldMan = YES, Viewer = NO" for the payment-recording action specifically.
- DRF's `permission_classes` is the enforcement point referenced throughout this doc; UI hiding in `04_SCREENS.md` is cosmetic only, per PRD §10.

**4. Computed values are response-only.** Anything listed in `02_DATA_MODEL.md` §11 (`is_overdue`, `outstanding_balance`, `net_position`, accrued penalty, etc.) appears in `GET` responses as a field, but is never accepted on `POST`/`PATCH` bodies — sending one is silently ignored, not validated, since accepting it would imply it could be set out of sync with its inputs.

**5. Ledger endpoints have no `PUT`/`PATCH`/`DELETE`.** `transactions` and `activity_log` are append-only at the schema level (data model Principle 3) and stay that way at the API level: only `POST` (create) and, for transactions, a dedicated `POST .../reverse/` action. There is structurally no way to call this API and mutate or delete a ledger row.

**6. Standard envelope.**

List responses (DRF `PageNumberPagination`):
```json
{ "count": 142, "next": "https://.../?page=3", "previous": "https://.../?page=1", "results": [ ... ] }
```

Error responses (every 4xx/5xx):
```json
{ "error": { "code": "LOAN_LOCKED_REPAYMENT_TYPE", "message": "Repayment model is locked at activation — close and create a new loan instead.", "edge_case_ref": 11 } }
```
`edge_case_ref` (nullable) cross-references the numbered table in PRD §13, purely for traceability between this spec, the PRD, and QA test cases written against it later.

**7. Filtering/search/pagination** use standard DRF query params (`?page=`, `?page_size=`, `?ordering=`, `?search=`) plus resource-specific filters noted per endpoint. Date range filters are always `?date_from=&date_to=` (inclusive, ISO 8601 dates).

**8. Idempotency on financial writes.** All `POST` endpoints under Transactions, Settlements, Restructuring, and Partner Capital accept an optional `Idempotency-Key` header; a repeated key within 24h returns the original response instead of creating a duplicate row. Flagged once here since it applies identically across ~15 endpoints below rather than being repeated each time.

---

## 1. Auth & Users

| Method | Path | Purpose | Permission |
|---|---|---|---|
| POST | `/api/auth/register/` | Create a `users` row | Public |
| POST | `/api/auth/login/` | Issue access+refresh token pair | Public |
| POST | `/api/auth/refresh/` | Rotate access token | Valid refresh token |
| POST | `/api/auth/logout/` | Blacklist refresh token | Authenticated |
| GET | `/api/users/me/` | Current user profile + `last_active_space_id` | Authenticated |
| PATCH | `/api/users/me/` | Update `display_name`, `notification_prefs` | Authenticated |
| POST | `/api/users/me/change-password/` | `old_password`, `new_password` | Authenticated |

`last_active_space_id` is written by the frontend on every space switch (`PATCH /api/users/me/ {"last_active_space_id": ...}`) — server doesn't infer it from request history.

---

## 2. Spaces

| Method | Path | Purpose | Permission | Notes |
|---|---|---|---|---|
| GET | `/api/spaces/` | List spaces the user is a member of | Authenticated | Each item carries its *own* already-computed snapshot numbers (total lent/borrowed) — never a cross-space sum, per NFR §10 |
| POST | `/api/spaces/` | Create a space | Authenticated | Body: `name, space_type, space_visibility, currency_code`. Creator becomes `OWNER` row in `space_members` atomically |
| GET | `/api/spaces/{space_id}/` | Space detail | Member | |
| PATCH | `/api/spaces/{space_id}/` | Update `name`, `currency_code` | Owner | `space_type`/`space_visibility` excluded here — see dedicated actions below |
| POST | `/api/spaces/{space_id}/change-type/` | Personal↔Business | Owner | Body: `target_type, confirm`. Personal→Business: requires `confirm=true` if any loans exist (edge case #5); Partnership Model becomes available with zero auto-generated partners. Business→Personal: **blocked (409)** if any `space_partners` rows exist (edge case #7) |
| POST | `/api/spaces/{space_id}/change-visibility/` | Private↔Shared | Owner | Shared→Private: **blocked (409)** if `space_members` count (status=ACTIVE) > 1 (edge case #6) |
| POST | `/api/spaces/{space_id}/transfer-ownership/` | Hand Owner role to another member | Owner | Body: `new_owner_member_id`. Required before the current Owner can leave/be removed (edge case #1) |
| DELETE | `/api/spaces/{space_id}/` | Soft-delete | Owner | Body requires `confirm_name` matching the space's exact name (typed confirmation, edge case #8). Sets `deleted_at`; 30-day retention window before any hard purge job runs |
| GET | `/api/spaces/{space_id}/dashboard/` | Dashboard module snapshot | Owner/Admin/Viewer | **403 for FieldMan** per matrix. Returns: total lent/borrowed, outstanding receivable/payable, interest earned/paid, active & overdue counts, upcoming payments (next 7/30 days), recent activity (last N `activity_log` rows) |

---

## 3. Space Members & Invites

| Method | Path | Purpose | Permission | Notes |
|---|---|---|---|---|
| GET | `/api/spaces/{space_id}/members/` | List members | Member | |
| POST | `/api/spaces/{space_id}/members/invite/` | Invite by email | Owner | Body: `email, role`. Creates `space_members` (status=PENDING, `invited_email` set) + `space_invites` row + sends email. If the email has no account yet, invite holds pending and auto-accepts on registration (edge case #2) |
| PATCH | `/api/spaces/{space_id}/members/{member_id}/` | Change role | Owner | Cannot demote the sole Owner without a prior `transfer-ownership` call |
| DELETE | `/api/spaces/{space_id}/members/{member_id}/` | Remove member | Owner | **Blocked (409)** if target is sole Owner (edge case #1) or is a `space_partners` row with non-zero Net Position (edge case #42) |
| POST | `/api/spaces/{space_id}/members/{member_id}/resend-invite/` | Re-send invite email | Owner | Regenerates `space_invites.token`/`expires_at` |
| POST | `/api/invites/{token}/accept/` | Accept a pending invite | Authenticated (matching email) | Top-level, not space-nested — a token is the access point before the user has any space context |

**RBAC at the wire, demonstrated:** `PATCH /members/{id}/` and the Settings endpoint below both reject a non-Owner caller with `403` regardless of what the UI shows — directly satisfying edge case #3 ("Admin attempts to change Space Settings via direct API call → Blocked").

---

## 4. Space Settings

| Method | Path | Purpose | Permission |
|---|---|---|---|
| GET | `/api/spaces/{space_id}/settings/` | Current defaults | Owner |
| PATCH | `/api/spaces/{space_id}/settings/` | Update defaults | Owner |

Fields mirror `space_settings` exactly (`default_interest_type`, `default_rate_value`, `default_rate_period`, `default_repayment_type`, `default_payment_frequency`, `default_advance_payment_mode`, `default_penalty_type`, `default_grace_period_days`, `deduct_expenses_from_reports`). Changing these **never** touches existing loans — they're copied at loan-creation time only (data model §2.5 note), so this endpoint has no cascading side effects to document.

---

## 5. Contacts

| Method | Path | Purpose | Permission | Notes |
|---|---|---|---|---|
| GET | `/api/spaces/{space_id}/contacts/` | List | Owner/Admin/Viewer (read) / FieldMan (read) | Filters: `?relationship_tag=`, `?search=` |
| POST | `/api/spaces/{space_id}/contacts/` | Create | Owner/Admin/FieldMan (CanWrite, excludes Viewer) | |
| GET | `/api/spaces/{space_id}/contacts/{contact_id}/` | Detail | All read roles | |
| PATCH | `/api/spaces/{space_id}/contacts/{contact_id}/` | Update | CanWrite | |
| DELETE | `/api/spaces/{space_id}/contacts/{contact_id}/` | Delete | CanWrite | **Blocked (409)** with `"This contact has N loan(s) — close or reassign them first."` if any `loans.contact_id` reference exists (edge case #44) |
| GET | `/api/spaces/{space_id}/contacts/{contact_id}/loans/` | Full loan history, both directions | All read roles | Includes a computed `net_position` field = receivable (GIVEN) minus payable (TAKEN) across this contact's loans (edge case #48) |

Note on FieldMan and Contacts: per the matrix, FieldMan is "View only" for Contacts as a category, but *can* add field notes — that's the `loans/{loan_id}/notes/` action under §6, not a Contacts write. A FieldMan calling `POST /contacts/` gets **403**.

---

## 6. Loans

### 6.1 List & detail

| Method | Path | Purpose | Permission | Notes |
|---|---|---|---|---|
| GET | `/api/spaces/{space_id}/loans/` | List | All read roles | Filters: `?direction=GIVEN\|TAKEN`, `?status=DRAFT\|ACTIVE\|CLOSED`, `?is_overdue=true` (computed filter — `status=ACTIVE AND payment_timing_rule=SCHEDULED AND EXISTS overdue current-version line`), `?closure_reason=WRITTEN_OFF` (the dedicated "Written Off" tab — same backend state as CLOSED, filtered, per PRD §3 resolution) |
| POST | `/api/spaces/{space_id}/loans/` | Create (DRAFT) | CanWrite | Full config body, §6.2 below |
| GET | `/api/spaces/{space_id}/loans/{loan_id}/` | Detail | All read roles (FieldMan limited to non-aggregate fields per loan, not blocked entirely — FieldMan needs to see this loan's own terms to collect against it) | Includes computed: `outstanding_balance`, `is_overdue`, `accrued_penalty_to_date`. Also returns the stored field `advance_credit_balance` (the running credit balance under `CARRY_FORWARD_CREDIT` mode; always 0 under `RECALCULATE_SCHEDULE`). Clients must read this before triggering a mode switch so they can surface the edge case #32 consequence to the user |
| PATCH | `/api/spaces/{space_id}/loans/{loan_id}/` | Edit | CanWrite | **DRAFT-only** for most fields. On an ACTIVE loan: only non-financial fields (e.g. `notes`) are editable; `interest_rate`-type fields return **409** directing to the restructuring endpoints (edge case #9, #10); `repayment_type` is rejected outright once any installment is paid (edge case #11) |

### 6.2 Create body (full shape — every PRD §4 dimension)

```json
{
  "contact_id": 41,
  "direction": "GIVEN",
  "principal_amount": "100000.00",
  "start_date": "2026-07-01",
  "first_due_date": "2026-08-01",
  "tenure_periods": 12,

  "interest_type": "REDUCING_BALANCE",
  "rate_value": "1.5",
  "rate_period": "MONTH",
  "fixed_interest_amount": null,
  "fixed_interest_frequency": null,
  "interest_timing": "PAYABLE_PERIODICALLY",
  "net_disbursed_amount": null,
  "interest_rate_behavior": "FIXED",
  "promo_rate": null,
  "promo_period_days": null,

  "repayment_type": "EMI",
  "has_balloon_final_payment": false,
  "payment_frequency": "MONTHLY",
  "payment_timing_rule": "SCHEDULED",

  "advance_payment_mode": null,
  "penalty_type": "PERCENTAGE",
  "penalty_value": "2.0",
  "grace_period_days": 3
}
```

`advance_payment_mode: null` means "inherit `space_settings.default_advance_payment_mode`" — resolved and **written concretely** onto the row at creation (data model: copied, not live-referenced). Same applies to `grace_period_days` if omitted.

**Server-side validation on this endpoint (each maps to a PRD edge case):**

| Check | Result | Edge case |
|---|---|---|
| `principal_amount <= 0` | 400 | #18 |
| `first_due_date < start_date` | 400 | #17 |
| `interest_type='FIXED'` and (`fixed_interest_amount` is null or `fixed_interest_frequency` is null) | 400 | data model §4.1 — both required when `interest_type='FIXED'`, same pattern as `net_disbursed_amount` below |
| `interest_timing='DEDUCTED_FROM_DISBURSEMENT'` and `net_disbursed_amount >= principal_amount` | 400 | #15 |
| `interest_rate_behavior='PROMOTIONAL'` and `promo_period_days > tenure_periods` (converted to same unit) | 400 | #13 |
| `repayment_type='CUSTOM_INSTALLMENTS'` with `interest_type` set to a formula type (`FLAT`/`REDUCING_BALANCE`/`COMPOUND`) | 201 — `interest_type`'s formula is **ignored**, not rejected; the schedule is taken exactly as submitted via `schedule/custom-lines/` (§6.5) | #12, see resolution below |
| `interest_type='CUSTOM'` | 201 — independent of `repayment_type`; this loan's interest amounts are entered manually per line, same mechanism as `CUSTOM_INSTALLMENTS` but on the interest axis instead of the repayment axis | — |
| `rate_value=0` with `interest_type IN (FLAT, REDUCING_BALANCE)` | 201, with `warnings: ["0% rate is equivalent to a no-interest loan."]` in response body | #19 |
| `penalty_type='EXTRA_INTEREST'` and `interest_type='COMPOUND'` | 400 | #35 |
| `repayment_type='CUSTOM_INSTALLMENTS'` | 201, but loan stays effectively un-activatable until schedule lines posted (see §6.5) | #21, #22 |

A successful create also writes the seed row to `disbursements` (sequence_no=1, label=ORIGINAL) and `loan_rate_history` (trigger=INITIAL) automatically — both are implied by the loan config, not separate calls the client has to make.

**Resolution — edge case #12's wording vs. its own explanation conflict, and this is the call made to break the tie.** The PRD states the scenario as *"Compound interest selected together with Custom repayment → **Blocked**: Custom repayment bypasses all interest formulas by definition; selecting Custom disables interest-type formula fields."* The label says "Blocked"; the explanation describes *disabling* a field, not *rejecting* a request — those aren't the same behavior. Taken at face value, "Blocked" would mean **400** the moment both are set together; taken at the explanation's word, the combination is **allowed** and the interest formula simply doesn't run. This spec implements the latter (201, formula ignored) because: (a) it's consistent with how `CUSTOM_INSTALLMENTS` is treated everywhere else in this doc — as a user-supplied override, not a forbidden combination; (b) a hard block here would mean a user can *never* pair custom installments with, say, a reducing-balance loan even informationally, which seems stricter than intended; (c) the data model's own `is_custom_line` flag is designed around "system applies no formula," not "system rejects the configuration." **Flag for explicit confirmation** before this goes further into `04_SCREENS.md` — if the actual intent was a hard block, this is a one-line change to the table above, but it changes which of the two readings is correct, not just a wording tweak.

### 6.3 Lifecycle actions

| Method | Path | Purpose | Notes |
|---|---|---|---|
| POST | `.../loans/{loan_id}/activate/` | DRAFT → ACTIVE | Generates `repayment_schedule_lines` (version 1) from the config, unless `repayment_type=CUSTOM_INSTALLMENTS`, where lines must already exist (**blocked, 400**, if zero rows — edge case #22). Warns (not blocks) if `disbursements[0].disbursement_date` is in the future (edge case #16) |
| POST | `.../loans/{loan_id}/close/` | ACTIVE → CLOSED | Body: `closure_reason` ∈ `{FULLY_PAID, MANUALLY_CLOSED}` (SETTLED/WRITTEN_OFF go through their own endpoints, §7). `MANUALLY_CLOSED` requires `closure_note` (400 if missing) |
| POST | `.../loans/{loan_id}/close-early/` | Full Closure (§4.9) | Body: `closure_date` (optional, default today). Repays outstanding principal in full, stops interest accrual as of that date, does **not** refund already-collected upfront interest. Sets `closure_reason=FULLY_PAID` |
| POST | `.../loans/{loan_id}/reopen/` | CLOSED → ACTIVE | Body: `reason` (required). Clears closure fields, reverts status, logs to `activity_log` (edge case #38) |
| POST | `.../loans/{loan_id}/change-advance-mode/` | Switch `advance_payment_mode` on an ACTIVE loan | Body: `advance_payment_mode` ∈ `{CARRY_FORWARD_CREDIT, RECALCULATE_SCHEDULE}`. Permission: `CanWrite` (Owner/Admin). **400** if the requested mode equals the current mode. **Edge case #32:** if switching `CARRY_FORWARD_CREDIT → RECALCULATE_SCHEDULE` and `advance_credit_balance > 0`, the credit is applied immediately against outstanding principal (as if it were a fresh advance payment under the new mode), the schedule is regenerated (new `schedule_version`), and `advance_credit_balance` is zeroed — all atomically. Response includes the updated `advance_payment_mode`, the amount of credit applied (`credit_applied`), and the new `schedule_version`. If the applied credit zeros remaining installments entirely, the loan **auto-closes** as `FULLY_PAID` (same mechanic as edge case #33). Switching in the other direction (`RECALCULATE_SCHEDULE → CARRY_FORWARD_CREDIT`) has no balance side-effect since `advance_credit_balance` is always 0 under that mode. Logs to `activity_log` |
| POST | `.../loans/{loan_id}/notes/` | Add a field note/visit remark | The one write FieldMan can do on a loan beyond payments — maps to "Add Notes" in the role matrix |

**Reject map for direct-call attempts bypassing the UI** (edge cases #3, #4, #39 generalize into one rule, enforced identically across every write action in this section): any role lacking the declared `permission_classes` for an action gets **403**, full stop, independent of which client called it.

### 6.4 Disbursements

| Method | Path | Purpose | Permission | Notes |
|---|---|---|---|---|
| GET | `.../loans/{loan_id}/disbursements/` | List disbursement ledger | All read roles | Ordered by `sequence_no`; outstanding principal = `SUM(amount)` here, per data model §4.2 |
| POST | `.../loans/{loan_id}/disbursements/` | Record a top-up / additional borrowing | Owner/Admin/FieldMan (CanRecordCollection — recording money out is the same write class as recording a payment in) | Body: `amount, disbursement_date, label` (`TOP_UP` or `ADDITIONAL_BORROWING`; display-only distinction, same mechanism). **409** if `loans.status != 'ACTIVE'` (edge case #23 — top-ups only allowed on ACTIVE loans). Same-date multiple disbursements are allowed as separate rows (edge case #24). `sequence_no` is server-assigned (`MAX(sequence_no)+1`), never client-supplied |

The seed disbursement (`sequence_no=1`) is **not** created through this endpoint — it's written automatically by `POST /loans/` at creation time (§6.2). This endpoint is for every disbursement *after* the first.

### 6.5 Schedule

| Method | Path | Purpose | Notes |
|---|---|---|---|
| GET | `.../loans/{loan_id}/schedule/` | Current schedule | `?include_superseded=true` returns every version, each row tagged `schedule_version`/`is_current_version` |
| POST | `.../loans/{loan_id}/schedule/custom-lines/` | Bulk set lines for `CUSTOM_INSTALLMENTS` / `interest_type=CUSTOM` loans | DRAFT only. Body: array of `{due_date, principal_due, interest_due}`. If `SUM(principal_due) != loans.principal_amount`, **201 with a warning**, not a block (edge case #21 — custom schedules are user-defined) |

A loan with `payment_timing_rule=ANYTIME` returns an empty array here by design (data model §4.5) — the frontend should treat an empty schedule + `payment_timing_rule=ANYTIME` as "no schedule exists," not as an error state.

---

## 7. Transactions, Settlement & Write-off

### 7.1 Transactions

| Method | Path | Purpose | Permission | Notes |
|---|---|---|---|---|
| GET | `/api/spaces/{space_id}/transactions/` | List, space-wide | Owner/Admin/Viewer | Filters: `?loan_id=`, `?type=`, `?date_from=&date_to=` |
| GET | `/api/spaces/{space_id}/loans/{loan_id}/transactions/` | List, scoped to one loan | All read roles incl. FieldMan (their own collections) | |
| POST | `/api/spaces/{space_id}/loans/{loan_id}/transactions/` | Record a transaction | Owner/Admin/FieldMan (**"Add Payment" row of the matrix — Viewer excluded**) | Body shape below |
| GET | `.../transactions/{transaction_id}/` | Detail | All read roles | |
| POST | `.../transactions/{transaction_id}/reverse/` | "Delete" via reversal | Owner/Admin/FieldMan (mirrors create permission) | Body: `reason` (optional — appended to an auto-generated note). Never a hard delete (edge case #29): creates a **new row with `type='MANUAL_ADJUSTMENT'`** (not the original's type — see data model §5.1 resolution note), `reverses_transaction_id` set to the original, `adjustment_reason="Reversal of transaction #<id>" + reason`, and amount that negates the original's effect. Flips `is_reversed=true` on the original row, which stays visible, marked "Reversed" |

**Create body:**
```json
{
  "type": "PAYMENT_RECEIVED",
  "amount": "8500.00",
  "transaction_date": "2026-07-15",
  "collection_method": "UPI",
  "note": "July installment",
  "allocations": [
    { "schedule_line_id": 1042, "principal_component": "7500.00", "interest_component": "1000.00" }
  ]
}
```
If `allocations` is omitted, the server **auto-allocates**: oldest unpaid current-version line first, interest before principal within a line, per standard amortization convention — documented here so the AI assistant implements one consistent auto-allocation order rather than improvising it loan-by-loan.

**`transaction_date` accepts either a date (`"2026-07-15"`) or a full ISO 8601 datetime (`"2026-07-15T14:30:00Z"`).** A date-only value is coerced server-side to midnight UTC on that date. This matters for same-day ordering: two transactions logged on the same calendar date with date-only input are ordered by `created_at` as a tiebreaker, not by `transaction_date` — if same-day ordering matters for a given record (e.g. multiple collections in one day), the client should send the full datetime.

**Server-side handling:**

| Scenario | Behavior | Edge case |
|---|---|---|
| `transaction_date < loans.start_date` | 400 | #30 |
| `transaction_date` in the future | 201, with `warnings: [...]` | #27 |
| Payment exceeds total outstanding | Excess auto-applied per `loans.advance_payment_mode`; if resulting balance = 0, response includes `prompt: "Close as Fully Paid?"` (frontend surfaces this; doesn't auto-close) | #26 |
| `type=MANUAL_ADJUSTMENT` with negative `amount` | Allowed; `adjustment_reason` required (400 if missing) | #31 |
| Loan is CLOSED | **409** — `"Loan is closed — reopen it first, or log a Manual Adjustment with a reason."` (Manual Adjustment is itself blocked the same way unless reopened — there's no backdoor) | #25 |
| Loan has `payment_timing_rule=ANYTIME` | Always allowed, `allocations` ignored/optional (no lines to allocate against) | #28 |

`RECALCULATE_SCHEDULE` mode: if applying this payment regenerates the schedule down to zero remaining installments, the loan **auto-closes** as `FULLY_PAID` in the same request/response cycle (edge case #33) — the response includes the updated `loans.status`.

### 7.2 Settlement & Write-off

| Method | Path | Purpose | Notes |
|---|---|---|---|
| POST | `.../loans/{loan_id}/settle/` | Log a Settlement, close loan | Body: `settlement_amount, settlement_date, note`. Server computes `outstanding_balance_at_settlement` itself (never trusts a client-sent value) and **rejects (400)** if `settlement_amount > outstanding_balance_at_settlement` (edge case #36). Creates the `transactions` row (type=SETTLEMENT) + `settlements` extension row atomically; sets `closure_reason=SETTLED` |
| POST | `.../loans/{loan_id}/write-off/` | Declare unrecoverable, close loan | Body: `reason, confirm`. **No** `transactions` row created. Writes `loans.written_off_amount` = outstanding balance at the moment of write-off; if `advance_credit_balance > 0`, it's zeroed and the forfeiture is surfaced in the response (`confirm` required precisely because of this forfeiture, edge case #37); sets `closure_reason=WRITTEN_OFF` |

---

## 8. Restructuring

All four actions below: **Owner/Admin only** (edge case #39 — Viewer/FieldMan get 403), require `reason` in the body (PRD §8: every restructuring action needs one), and write to `activity_log`.

| Method | Path | Purpose | Notes |
|---|---|---|---|
| POST | `.../loans/{loan_id}/restructure/rate-change/` | New `loan_rate_history` row, trigger=RESTRUCTURING | Body: `effective_from, rate_value, rate_period, reason`. `effective_from` **must be ≥ today** (400 otherwise, edge case #14). This is the *only* path to changing rate on an ACTIVE loan with transactions (edge case #10) — direct `PATCH` on the loan is rejected for that case, per §6.1 |
| POST | `.../loans/{loan_id}/restructure/extend-tenure/` | New `loan_tenure_extensions` row | Body: `added_periods, reason`. Regenerates remaining schedule, writes new `schedule_version` |
| POST | `.../loans/{loan_id}/restructure/moratorium/` | New `loan_moratoriums` row | Body: `pause_start_date, pause_end_date, interest_free, reason`. **400** if the range overlaps any schedule line already `status=PAID` — pause can only cover UNPAID, future installments (edge case #40) |
| POST | `.../loans/{loan_id}/restructure/waive-interest/` | New `loan_waivers` row (`waiver_type=INTEREST`) | Body: `waived_amount, reason`. Zeroes remaining unpaid interest on current-version schedule lines up to `waived_amount` |
| POST | `.../loans/{loan_id}/restructure/waive-penalty/` | New `loan_waivers` row (`waiver_type=PENALTY`) | Body: `waived_amount, reason`. A grace-period change doesn't retroactively recalculate already-accrued penalties (edge case #34) — this endpoint is the explicit, audited way to zero them out manually instead |
| GET | `.../loans/{loan_id}/restructure/history/` | Unified, chronological feed | Merges `loan_rate_history` (trigger≠INITIAL), `loan_tenure_extensions`, `loan_moratoriums`, `loan_waivers` into one ordered list for the loan's Restructuring tab |

`PATCH /spaces/{space_id}/settings/` changing `default_grace_period_days` has no retroactive effect on any existing loan's `grace_period_days` — already noted in §4, repeated here because edge case #34 is specifically about this non-retroactivity.

---

## 9. Expenses

| Method | Path | Purpose | Permission |
|---|---|---|---|
| GET | `/api/spaces/{space_id}/expenses/` | List | Owner/Admin/Viewer |
| POST | `/api/spaces/{space_id}/expenses/` | Create | CanWrite |
| GET/PATCH/DELETE | `.../expenses/{expense_id}/` | Detail/update/delete | CanWrite |

Optional `loan_id` link. Deleting an expense is a real hard delete (unlike `transactions`) — expenses aren't part of the financial ledger proper, just a cost log, so there's no append-only requirement here.

---

## 10. Partners & Partner Capital

Only meaningful where `spaces.space_type=BUSINESS AND space_visibility=SHARED`; every endpoint here returns **400** (`"Partnership Model is not active for this space."`) otherwise, rather than 404, so the frontend can distinguish "wrong space type" from "doesn't exist."

| Method | Path | Purpose | Permission | Notes |
|---|---|---|---|---|
| GET | `/api/spaces/{space_id}/partners/` | List partners | Owner/Admin: all rows. Other roles: **own row only** if they are themselves a listed partner, else 403 (§5.2 visibility rule) | |
| POST | `/api/spaces/{space_id}/partners/` | Designate a member as Partner | Owner/Admin | Body: `space_member_id, initial_contribution_amount, profit_share_percent` (both nullable, §5.1). Any member's role — including Viewer/FieldMan — can be the target (§5.1's explicit confirmation: partnership status isn't tied to role) |
| PATCH | `.../partners/{partner_id}/` | Edit contribution/share | Owner/Admin | |
| DELETE | `.../partners/{partner_id}/` | Remove partner designation | Owner/Admin | **409** if computed Net Position ≠ 0 (edge case #42) |
| GET | `/api/spaces/{space_id}/partners/dashboard/` | Partner Dashboard (lives under Reports per PRD §5.2) | Owner/Admin: full table. Partner-but-lesser-role: own row only | Query: `?period_start=&period_end=`. Per partner: contribution (running), share %, profit/loss allocated for the period, current Net Position — all computed per the formula in data model §7.2, nothing pre-cached |
| POST | `.../partners/{partner_id}/capital-transactions/` | Log contribution or withdrawal | Owner/Admin | Body: `type, amount, transaction_date, note`. Withdrawal **400** if `amount` > computed current Net Position (edge case #43, re-derived at write time, never against a stale cached balance) |
| GET | `.../partners/{partner_id}/capital-transactions/` | Capital ledger for one partner | Owner/Admin, or the partner themself | Lets a partner "see exactly how their position got to its current number," per PRD §5.3 |

---

## 11. Documents

| Method | Path | Purpose | Permission |
|---|---|---|---|
| GET | `/api/spaces/{space_id}/documents/?entity_type=&entity_id=` | List attachments for a loan or contact | All read roles |
| POST | `/api/spaces/{space_id}/documents/` | Upload | CanWrite | multipart; body includes `entity_type, entity_id, document_type` |
| DELETE | `.../documents/{document_id}/` | Remove | CanWrite |

No cascade-delete concerns at the API level — documents are blocked from orphaning only because their parent loan/contact is itself blocked from deletion while data exists (data model §8.1).

---

## 12. Activity Timeline

| Method | Path | Purpose | Permission |
|---|---|---|---|
| GET | `/api/spaces/{space_id}/activity/` | Timeline feed | Owner/Admin/Viewer (**403 FieldMan** — no portfolio-level views per matrix; their own action confirmations come back in the create-response of the action itself, not this feed) |

Filters: `?entity_type=&entity_id=` (history for one specific record), `?date_from=&date_to=`. **No `POST`** — every row here is a side effect of some other endpoint's write (loan create, transaction post, restructuring action, member invite, etc.), never a direct client call.

---

## 13. Reports

All under `/api/spaces/{space_id}/reports/...`, **Owner/Admin/Viewer only** (403 FieldMan, matrix row "Reports"). Every report accepts `?date_from=&date_to=` and `?deduct_expenses=true|false` (overrides `space_settings.deduct_expenses_from_reports` for this view only, per §7's "only affects reporting presentation").

| Path | Returns |
|---|---|
| `.../reports/receivable/` | All money owed *to* the user across active GIVEN loans |
| `.../reports/payable/` | All money the user owes across active TAKEN loans |
| `.../reports/interest/` | Interest earned vs. interest paid, for the range |
| `.../reports/overdue/` | Overdue loans + aging buckets (computed `is_overdue` + days-overdue per line) |
| `.../reports/cash-flow/` | Historical inflows/outflows (from `transactions`) + projected future inflows/outflows (from current-version `repayment_schedule_lines`) |
| `.../reports/partner-allocation/` | Same payload as `/partners/dashboard/` (§10) — exposed under Reports too, since PRD §9 lists it as a Reports sub-item; both paths are valid, neither is canonical, pick one in `04_SCREENS.md` for the actual nav |

---

## 14. Analytics

All under `/api/spaces/{space_id}/analytics/...`, same permission as Reports (Owner/Admin/Viewer, 403 FieldMan).

| Path | Returns |
|---|---|
| `.../analytics/net-position/` | Net lending position, collection forecast, future liabilities/receivables |
| `.../analytics/top-contacts/?role=borrower\|lender` | Ranked by outstanding/total volume |
| `.../analytics/loan-rankings/?by=profitable\|overdue` | Most profitable loans (interest earned, net of expenses if toggled) / most overdue |
| `.../analytics/trends/?metric=lending\|borrowing\|interest&granularity=month` | Time series for charts |

---

## 15. RBAC Matrix — Endpoint Cross-Reference

A condensed version of PRD §2.4, stated in terms of the permission classes actually declared on viewsets, so there's a direct line from "the PRD says X" to "the code enforces X":

| PRD Matrix Row | Permission class used | Endpoints it gates |
|---|---|---|
| Dashboard / Analytics / Reports = NO for FieldMan | `ExcludesFieldMan` | §2 dashboard, §13 all, §14 all, §12 activity |
| Loans/Contacts/Transactions = View only for FieldMan | `CanWrite` (excludes Viewer AND, for these specific resources, excludes nothing extra for FieldMan since FieldMan *can* read) | §5, §6.1 read vs. write split |
| Add Payment / Add Notes = NO for Viewer, YES for FieldMan | `CanRecordCollection` | §7.1 create/reverse, §6.3 notes action |
| Manage Members / Delete Space / Settings = Owner only | `IsOwner` | §2 change-type/visibility/transfer/delete, §3 invite/role-change/remove, §4 all |
| Export Data = Owner/Admin only, NO for Viewer/FieldMan | `IsOwnerOrAdmin` | (export endpoints land in `04_SCREENS.md`'s data-portability flow — flagged here so that doc inherits this permission class rather than inventing a new one) |
| Restructuring = Owner/Admin only | `IsOwnerOrAdmin` | §8 all |

---

## 16. Edge Case → Endpoint Map

For traceability against PRD §13's 48-row table — every edge case that has an API-observable behavior (most do; a few, like #43's UI copy, are response-message details rather than separate logic):

| PRD # | Endpoint | Behavior |
|---|---|---|
| 1 | `members/{id}` DELETE, `transfer-ownership` | Blocked without prior transfer |
| 2 | `members/invite`, `invites/{token}/accept` | Pending → auto-accept on registration |
| 3 | `settings` PATCH | 403 for non-Owner |
| 4 | `loans/{id}/transactions` POST | 403 for Viewer |
| 5 | `change-type` | Confirm required, partners start empty |
| 6 | `change-visibility` | Blocked if >1 active member |
| 7 | `change-type` (Business→Personal) | Blocked if partner rows exist |
| 8 | `spaces/{id}` DELETE | Typed confirmation, soft delete |
| 9–10 | `loans/{id}` PATCH, `restructure/rate-change` | Direct edit blocked once ACTIVE; restructuring is the only path with transactions |
| 11 | `loans/{id}` PATCH | `repayment_type` locked after first paid installment |
| 12 | `loans` POST | CUSTOM interest disables repayment formula fields |
| 13 | `loans` POST | promo period vs tenure validation |
| 14 | `restructure/rate-change` | effective_from ≥ today |
| 15 | `loans` POST | net_disbursed_amount < principal |
| 16 | `loans/{id}/activate` | Future disbursement date → warning |
| 17–18 | `loans` POST | date/principal validation |
| 19 | `loans` POST | 0% rate → warning only |
| 20 | `loans/{id}/activate` | single-installment EMI allowed |
| 21–22 | `schedule/custom-lines`, `activate` | Mismatch → warning; zero rows → blocked |
| 23 | `disbursements` POST | Top-up blocked on CLOSED |
| 24 | `disbursements` POST | Same-date multiple allowed |
| 25 | `loans/{id}/transactions` POST | Blocked on CLOSED |
| 26 | `loans/{id}/transactions` POST | Overpayment routing + close prompt |
| 27 | `loans/{id}/transactions` POST | Future date → warning |
| 28 | `loans/{id}/transactions` POST | Always allowed on ANYTIME loans |
| 29 | `transactions/{id}/reverse` | Reversal, never hard delete |
| 30 | `loans/{id}/transactions` POST | Date ≥ disbursement date |
| 31 | `loans/{id}/transactions` POST | Negative MANUAL_ADJUSTMENT allowed with reason |
| 32 | `loans/{id}/change-advance-mode` POST | Credit balance applied + schedule regenerated atomically on CARRY_FORWARD→RECALCULATE switch; `advance_credit_balance` zeroed |
| 33 | `loans/{id}/transactions` POST | Auto-close on empty recalculated schedule |
| 34 | `settings` PATCH, `restructure/waive-penalty` | Grace period change is prospective only |
| 35 | `loans` POST | EXTRA_INTEREST + COMPOUND blocked |
| 36 | `loans/{id}/settle` | settlement_amount ≤ outstanding, server-computed |
| 37 | `loans/{id}/write-off` | Credit balance forfeiture, surfaced via `confirm` |
| 38 | `loans/{id}/reopen` | Reason required |
| 39 | `restructure/*` | 403 for Viewer/FieldMan |
| 40 | `restructure/moratorium` | Blocked over paid installments |
| 41 | `partners` POST/PATCH | Warning only if shares ≠ 100% (open decision) |
| 42 | `partners/{id}` DELETE | Blocked if Net Position ≠ 0 |
| 43 | `partners/{id}/capital-transactions` POST | Blocked if withdrawal > Net Position |
| 44 | `contacts/{id}` DELETE | Blocked if loans exist |
| 45 | `contacts` POST | Allowed, no cross-space link |
| 46 | (import endpoint — out of scope for this pass; flagged as open decision in data model §13) | |
| 47 | `loans` POST | Informational notice only |
| 48 | `contacts/{id}/loans` GET | Net position across both directions |

---

*Next: `04_SCREENS.md` — every screen's data needs and actions should map to a GET/POST above; if a screen needs something not listed here, that's a gap to resolve before, not during, that doc.*
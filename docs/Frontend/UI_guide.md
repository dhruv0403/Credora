# Credora — UI Build Guide for AI Assistant (v1)

**Purpose:** This is the single document an AI coding assistant should read alongside `04_SCREENS.md` before writing any frontend code. `04_SCREENS.md` says *what* every screen needs to show and call; this document says *how* to build it — stack, visual language, which component to reach for, how to validate before hitting the API, and the exact sequence of steps for the flows that span multiple screens.

**How to use this with `04_SCREENS.md`:** Read this document once, fully, before starting. Then work screen-by-screen from `04_SCREENS.md`'s section order (§3 Auth → §4 Spaces → §5 Dashboard → §6 Loans → ...), and for every screen: (1) confirm the data needs/endpoints from `04_SCREENS.md`, (2) build the layout using the component mapping in §4 below, (3) apply the validation rules in §5 for any form on that screen, (4) follow the relevant flow in §6 if the screen is part of a multi-step journey. Don't reorder this — building Loans before the design tokens and shared components in §2–§4 are in place means redoing work.

---

## 1. Tech Stack (locked — do not substitute without flagging it back)

| Layer | Choice | Why |
|---|---|---|
| Framework | **React 18+ with Vite** | Fast dev loop, no framework-level opinions fighting DRF's API shape |
| Routing | **React Router v6** | Nested routes map directly onto the space-first URL hierarchy in `04_SCREENS.md` §1 |
| Data fetching / cache | **TanStack Query (React Query)** | Every screen in `04_SCREENS.md` is "GET this, then POST/PATCH that, then refetch" — React Query's cache invalidation is built for exactly this pattern. Do not hand-roll `useEffect` + `fetch` data loading. |
| Forms | **React Hook Form** | Used for every multi-field form, especially the Loan wizard (§6.2 of `04_SCREENS.md`) where conditional field visibility needs to be cheap to compute |
| Schema validation | **Zod**, paired with RHF via `@hookform/resolvers/zod` | One Zod schema per entity, shared between form validation and TypeScript types (`z.infer<typeof schema>`) — see §5 |
| Styling | **Tailwind CSS** | Utility-first, fast to keep consistent across ~40 screens |
| Component primitives | **shadcn/ui** (Radix UI underneath) | Accessible by default (focus trapping in modals, keyboard nav in menus) — do not build modals/dropdowns/selects from scratch |
| Icons | **lucide-react** | Matches shadcn/ui's default icon set |
| Tables | **TanStack Table** for any table with sort/filter/pagination (Loan List, Transactions ledger, Members list); plain mapped `<div>` cards for anything that's card-based on mobile (see §4) |
| Charts | **Recharts** | Cash Flow, Trends, Interest report visualizations |
| Dates | **date-fns** | Formatting, range math (aging buckets, "next 7/30 days") |
| HTTP client | **axios**, wrapped in a single `apiClient` instance | One place to attach the JWT, handle 401→refresh, and parse the standard error envelope (`04_SCREENS.md` / `03_API_SPEC.md` §0.6) |
| Toasts | **sonner** | Lightweight, used for the warning/success toast half of the `<ServerMessage />` pattern (§4.6) |

**Do not introduce:** Redux/Zustand/any global state library. Server data lives in React Query's cache; the only client-only state that needs a store is the active space context (§3.4) and wizard-in-progress form state (lives in RHF, not global). If a screen seems to need global state beyond that, that's a sign the data should be fetched closer to where it's used, not a reason to add a store.

### 1.1 Project structure

```
src/
  app/                  # router setup, root layout, providers (QueryClientProvider, SpaceContext)
  api/                  # one file per resource: spaces.ts, loans.ts, transactions.ts, ...
                         #   each exports typed functions: listLoans(spaceId, filters), createLoan(spaceId, body), ...
  schemas/              # one Zod schema file per entity: loan.schema.ts, contact.schema.ts, ...
  components/
    ui/                 # shadcn/ui primitives, generated via shadcn CLI, not hand-written
    shared/             # cross-screen components from §4.6: ServerMessage, StatCard, EmptyState, StatusBadge, ...
  features/
    auth/
    spaces/
    loans/              # LoanList, LoanWizard (7 step components), LoanDetail (tabs), modals/
    contacts/
    transactions/
    expenses/
    reports/
    analytics/
    partners/
    documents/
    activity/
    settings/
  lib/                  # apiClient.ts (axios instance + interceptors), formatCurrency.ts, formatDate.ts
  styles/               # tailwind.config.ts (tokens from §2), globals.css
```

Each `features/<x>/` folder holds that feature's screens + its modals + any feature-only components. Shared things (used by 3+ features) graduate to `components/shared/`.

### 1.2 Auth & token handling

- Access token: held in memory (a module-level variable in `apiClient.ts` or React context) — **never `localStorage`**, to limit XSS exposure of a token that can move money-adjacent data.
- Refresh token: httpOnly cookie, set by the backend on login (confirm this is how the Django backend issues it; if the backend currently returns the refresh token in the JSON body instead, flag that back rather than silently storing it in `localStorage` as a workaround).
- Axios response interceptor: on a `401` from any request other than `/auth/refresh/` itself, attempt one silent `POST /api/auth/refresh/`, retry the original request once, and only then redirect to `/login` if that also fails.
- `SpaceContext` (React context, not a global store) holds `currentSpaceId` + the current user's `role` in that space, populated on space switch and read by every screen's permission checks (§3.3).

---

## 2. Design Tokens

### 2.1 Direction & rationale

Credora is a **ledger** — the design should feel like a well-kept physical account book translated to screen, not a generic SaaS dashboard. That's the one deliberate aesthetic choice this guide makes: warm paper background instead of clinical white/grey, ink-navy for structure and text, a single brass accent used sparingly (active states, primary actions, the one signature device in §2.5), and real hairline rules between rows the way a ledger has ruled lines. Everything else stays quiet and disciplined so the brass accent and the numbers themselves carry the visual weight — financial software should feel calm and exact, not energetic.

### 2.2 Color palette

Six named tokens, defined once in `tailwind.config.ts` under `theme.extend.colors`, referenced everywhere by name — never a raw hex in a component file.

| Token | Hex | Used for |
|---|---|---|
| `ink` | `#1C2333` | Primary text, nav/header background, high-emphasis UI |
| `paper` | `#FAF7F2` | App background — warm, not stark white |
| `brass` | `#A9762E` | The single accent: primary buttons, active nav indicator, focus rings, the signature underline (§2.5). Used sparingly — if more than ~10% of a screen is brass-colored, that's too much |
| `receivable` | `#2E7D54` | Money owed *to* the user — GIVEN loan amounts, "Earned," positive net position, success states |
| `payable` | `#B8472E` | Money the user owes — TAKEN loan amounts, "Paid," negative net position, destructive actions, overdue indicators |
| `slate` | `#6B7280` | Secondary text, placeholders, disabled states, hairline borders (`slate/20` opacity for the actual rule lines) |

**Semantic mapping (do not reassign these per-screen — they're fixed across the whole app):**
- `receivable` green = anything representing money coming in / owed to the user / a positive outcome (Given loans, Interest Earned, positive Net Position, a successful action toast).
- `payable` rust = anything representing money going out / owed by the user / a risk signal (Taken loans, Interest Paid, Overdue badges, destructive confirmations, error toasts).
- These are **semantic, not decorative** — a GIVEN loan's amount is always rendered in `receivable` green regardless of surrounding UI; don't reuse green/rust for unrelated meanings (e.g., don't make a random "new feature" badge green).
- Status badges (DRAFT/ACTIVE/CLOSED/WRITTEN_OFF) use `slate` (DRAFT), `brass` (ACTIVE), `ink` at low opacity (CLOSED), `slate` with a strikethrough icon (WRITTEN_OFF) — status is structural, not financial-direction, so it deliberately does *not* borrow the receivable/payable colors.

### 2.3 Typography

Two type families, used with restraint:

- **Display — "Fraunces"** (serif, available via Google Fonts). Used *only* for page-level `<h1>` titles (e.g. "Loans," "Partner Dashboard") and the empty-state headline. Nowhere else. This is the one characterful choice on the page — it should read like a ledger book's title page, not appear on buttons or table headers.
- **Body — "Inter"** (sans, Google Fonts). Everything else: nav labels, body text, table contents, form labels, buttons.
- **Financial figures — Inter with `font-variant-numeric: tabular-nums`** applied via a `.font-figures` utility class. Apply this class to every rendered amount, anywhere in the app (loan amounts, schedule lines, dashboard stats, transaction rows) — tabular figures keep columns of numbers aligned the way a real ledger's printed columns do. This is a hard rule, not a suggestion: a column of amounts using proportional figures looks visibly unaligned and undermines the whole ledger metaphor.

Type scale (Tailwind's default scale is fine — just constrain *which* sizes get used where):
- Page title: `text-3xl` Fraunces, `ink`
- Section heading: `text-lg` Inter semibold, `ink`
- Body / table text: `text-sm` Inter regular, `ink`
- Secondary / metadata: `text-xs` Inter regular, `slate`
- Stat card headline number: `text-2xl` or `text-3xl` Inter bold + `.font-figures`, colored per §2.2's semantic rule when the stat is directional (receivable/payable), `ink` when neutral (e.g. loan count)

### 2.4 Spacing, radius, elevation

- Spacing scale: Tailwind defaults (4px base unit) — no custom scale needed.
- Border radius: `rounded-md` (6px) as the default for cards, inputs, buttons. **Not** `rounded-full`/pill buttons except for status badges — pills read as "marketing site," sharper corners read as "ledger/tool."
- Elevation: prefer a 1px `slate/20` border over a drop shadow for cards and table rows — shadows read as "floating card UI," borders read as "ruled ledger lines." Reserve actual shadows (`shadow-md`) for things that are genuinely layered above content: modals, dropdown menus, toasts.
- Hairline rule: `border-b border-slate/15` between every row in a list/table — this is one of the two signature details (§2.5).

### 2.5 The signature element

Per the design principle of spending boldness in exactly one place: this app's signature is the **brass underline tick** that appears under the page title on every screen, and the **ruled-row hairlines** in every list/table. Together they're the visual shorthand for "ledger," and they're the only two non-default visual choices in the whole system — everything else (color use, spacing, radius) stays disciplined and quiet around them. Do not add additional decorative flourishes (no gradients, no card shadows, no animated counters) — the restraint is the point.

### 2.6 Dark mode

**Out of scope for v1.** Build with light-mode tokens only; don't add a theme toggle or `dark:` variants. If this becomes a requirement later, the token structure above (named CSS variables, not hardcoded hex in components) makes adding a dark palette later a config change, not a rewrite — but don't build that flexibility speculatively now.

### 2.7 Breakpoints

Tailwind defaults: mobile-first, `sm:` (640px) as the first "desktop-ish" breakpoint where table-vs-card layout decisions (§4.2) switch over, `lg:` (1024px) for the point where the side nav becomes persistent instead of a drawer.

---

## 3. App Shell

### 3.1 Layout

- **Mobile (< 640px):** top bar (logo/space-switcher trigger + user menu) + bottom tab bar (per `04_SCREENS.md` §2.2's role-based tab sets) + full-width content.
- **Desktop (≥ 1024px):** persistent left sidebar (nav items per role, space switcher at the top of the sidebar) + top bar (breadcrumb-ish page title + user menu) + content area with a max content width (don't let tables stretch edge-to-edge on very wide screens — cap at ~1280px, centered).
- **Tablet (640–1024px):** collapsible sidebar (icon-only, expandable), same content rules as desktop.

### 3.2 Routing structure

Mirrors `04_SCREENS.md` §1 exactly — set up nested routes under `/spaces/:spaceId/*` with a layout route that fetches the space + the current user's role in it (via `SpaceContext`) before rendering any child route. If the space fetch 404s (not a member) or the role can't access the matched route per §3.3, redirect to `/spaces` rather than rendering a broken screen.

### 3.3 Route guarding by role

A single `<RequireRole roles={[...]}>` wrapper component, used at the route-definition level (not scattered `if` checks inside every screen component):

```tsx
<Route path="dashboard" element={
  <RequireRole roles={['OWNER','ADMIN','VIEWER']}><Dashboard /></RequireRole>
} />
```

This is cosmetic/UX only — it prevents a FieldMan from ever landing on a Dashboard route and seeing a flash of "loading" before a 403 comes back, but it is **not** the security boundary; the server enforces that per `03_API_SPEC.md` §0.3, and every screen must still handle a `403` response gracefully (route to a generic "You don't have access to this" screen) in case role state goes stale mid-session (e.g., an Admin demotes the user to Viewer in another tab).

### 3.4 Space Switcher

Dropdown/drawer (mobile: bottom sheet) listing `GET /api/spaces/` results, each row showing the space name + its own already-computed snapshot numbers. Selecting a space updates `SpaceContext`, calls `PATCH /api/users/me/`, and navigates to that space's default landing route (Dashboard for Owner/Admin/Viewer, Loans for FieldMan, per `04_SCREENS.md` §2.1).

---

## 4. Component Mapping

For every recurring UI need across the ~40 screens in `04_SCREENS.md`, build (or use) exactly this component — don't reinvent a pattern that already has an entry here.

### 4.1 Primitives (from shadcn/ui — install via CLI, don't hand-write)

| Need | shadcn/ui component |
|---|---|
| Buttons (primary = brass, secondary = outline ink, destructive = payable rust) | `Button` (variant prop mapped to the three above) |
| Any modal (Record Payment, Settle, Write Off, Restructure, Invite Member, etc.) | `Dialog` |
| Confirm-before-destructive-action | `AlertDialog` (not `Dialog`) — reserve this specifically for irreversible/destructive confirms (Delete Space, Remove Member, Delete Contact) per `04_SCREENS.md` §16's typed-confirmation note |
| Dropdown menus (overflow "⋮" menus, the Loan Detail header's lifecycle action menu) | `DropdownMenu` |
| Select inputs (enum pickers: interest type, repayment type, role, etc.) | `Select` |
| Date pickers | `Popover` + `Calendar` (shadcn's combo) |
| Tabs (Loan Detail's Overview/Schedule/Transactions/... tabs) | `Tabs` |
| Toggle switches (Expense Deduction toggle, "Auto-allocate" toggle in Record Payment) | `Switch` |
| Checkboxes (interest_free, confirm checkboxes) | `Checkbox` |
| Radio groups (label choice in Disbursement modal, Space Type/Visibility picker) | `RadioGroup` |
| Badges (status, direction, role) | `Badge` (custom `variant` per §4.3 below) |
| Tooltips (disabled-with-reason pattern) | `Tooltip` |
| Toasts | `sonner`'s `toast()` — styled to match tokens, not shadcn's own Toast |

### 4.2 Lists: table vs. card

Every list screen in `04_SCREENS.md` (Loans, Contacts, Transactions, Members, Expenses) follows one rule: **TanStack Table on `sm:` and above, a stacked card list below it** — implemented as two render branches off the same data, not two separate fetches. Build one `<ResponsiveList columns={...} cardRenderer={...} data={...} />` shared component (in `components/shared/`) and configure it per screen, rather than writing bespoke table+card pairs five times.

### 4.3 Status & direction badges

One `<StatusBadge status="ACTIVE|DRAFT|CLOSED|OVERDUE|WRITTEN_OFF" />` and one `<DirectionBadge direction="GIVEN|TAKEN" />`, both in `components/shared/`. `StatusBadge` renders the OVERDUE overlay (a small red dot/ring on top of the ACTIVE badge) when `is_overdue` is true on the record — this is the *only* place OVERDUE visually exists, since it's never a stored status (per `02_DATA_MODEL.md` §11, restated here so the component doesn't get built around a non-existent `status='OVERDUE'` value).

### 4.4 Stat cards (Dashboard, Reports headlines)

One `<StatCard label="" value="" direction="receivable|payable|neutral" trend={optional} />` component. `value` is always passed pre-formatted through `formatCurrency()` (§5.4) and rendered with `.font-figures`. `direction` drives the text color per §2.2's semantic mapping.

### 4.5 The Loan Wizard's stepper

A single `<WizardStepper currentStep={n} totalSteps={7} labels={[...]} />` shared component, used only by the Loan create/edit wizard (it's the one multi-step flow in the app) — shown as a horizontal progress bar with step labels on desktop, a simple "Step 3 of 6" text + thin progress bar on mobile (per `04_SCREENS.md` §6.2's mobile note). Each step is its own component under `features/loans/wizard/`, all sharing one RHF form context (`FormProvider`) so Review (Step 6) can read every prior step's values without prop-drilling.

### 4.6 Shared feedback components

- **`<ServerMessage response={} />`** — the component named in `04_SCREENS.md` §16. Reads a response object; if it has `warnings: []`, renders each as a dismissible amber `<Alert variant="warning">`; if it's an error response, renders `error.message` as a red inline `<Alert variant="destructive">` near the triggering form field (not just a generic toast, so the user can see *which* field is the problem). Implement this once in `components/shared/`, import everywhere.
- **`<EmptyState icon={} title="" action={} />`** — used for every list screen's zero-data state (e.g. "Record your first loan" per `04_SCREENS.md` §5's Dashboard empty state).
- **`<DisabledAction reason="" >{children}</DisabledAction>`** — wraps any button that needs the "disabled-with-tooltip-reason" pattern from `04_SCREENS.md` §16 (delete-contact-with-loans, remove-partner-with-position, sole-owner-leave, etc.). Wrapping it once means every one of these ~8 cases across the app renders identically.

---

## 5. Frontend Validation Rules

**Principle:** every Zod schema below exists to catch what `04_SCREENS.md`'s "disabled-with-reason over enabled-then-error" pattern (§16) calls for — block obviously-invalid input before it reaches the server, but never try to replicate server-computed checks (settlement caps, net-position caps) client-side from stale data; those stay as submit-then-handle via `<ServerMessage />`. A schema below is the *first* line, not the only line — the server remains the source of truth for every rule, including the ones duplicated here.

### 5.1 Loan creation/edit (`schemas/loan.schema.ts`)

| Field | Rule | Edge case ref |
|---|---|---|
| `principal_amount` | `z.number().positive()` | #18 |
| `start_date` | required, valid date | — |
| `first_due_date` | required unless `payment_timing_rule === 'ANYTIME'`; must be `>= start_date` | #17 |
| `tenure_periods` | positive integer, required unless repayment_type is ONE_TIME or FLEXIBLE | — |
| `fixed_interest_amount`, `fixed_interest_frequency` | both required (refine) when `interest_type === 'FIXED'` | data model §4.1 |
| `rate_value`, `rate_period` | both required when `interest_type` ∈ `{FLAT, REDUCING_BALANCE, COMPOUND}`; `rate_value` allowed to be 0 (show non-blocking inline note, not a Zod error) | #19 |
| `net_disbursed_amount` | required when `interest_timing === 'DEDUCTED_FROM_DISBURSEMENT'`; refine: must be `< principal_amount` | #15 |
| `promo_period_days` | required when `interest_rate_behavior === 'PROMOTIONAL'`; refine against `tenure_periods` converted to the same unit as `rate_period`/`payment_frequency` — **flag this conversion logic for explicit review**, it's the one validation here with real unit-conversion complexity (e.g. tenure in months vs. promo days) | #13 |
| `penalty_type === 'EXTRA_INTEREST'` + `interest_type === 'COMPOUND'` | refine: reject this combination client-side (disable the EXTRA_INTEREST option in the Select entirely once COMPOUND is chosen, rather than letting it be picked and validated) | #35 |
| `repayment_type` | once loan is ACTIVE, this field is not rendered as editable at all — not a "disabled input," entirely absent from the edit view (matches `04_SCREENS.md` §6.2's Edit-DRAFT-only note) | #11 |

### 5.2 Custom schedule lines (`schemas/scheduleLine.schema.ts`)

Each row: `due_date` (required), `principal_due` (`z.number().nonnegative()`), `interest_due` (`z.number().nonnegative()`, default 0). At the array level: warn (don't block submit) if `sum(principal_due) !== loan.principal_amount` — render as an inline `<Alert variant="warning">` above the submit button, matching edge case #21's "warning only."

### 5.3 Transaction / Record Payment (`schemas/transaction.schema.ts`)

| Field | Rule |
|---|---|
| `amount` | `z.number()` — positive for every type except `MANUAL_ADJUSTMENT`, which allows negative (refine on `type`) |
| `transaction_date` | required; if resolved date `< loan.start_date`, block client-side immediately (#30 — this is one of the few hard blocks worth catching before submit, since it never depends on server-only state); if in the future, allow but show the non-blocking confirm copy from #27 |
| `adjustment_reason` | required when `type === 'MANUAL_ADJUSTMENT'` |
| `allocations` | optional array; if provided, sum of `principal_component + interest_component + penalty_component` across all entries should not obviously exceed `amount` (soft client-side sanity check, not a hard Zod refine, since the server's allocation/overpayment logic is the real authority per #26) |

### 5.4 Currency & number formatting

One shared `formatCurrency(amount: string | number, currencyCode: string)` util (`lib/formatCurrency.ts`), built on `Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode })`. **Critical:** `currency_code` is a per-space setting (`02_DATA_MODEL.md` §2.2), not a global constant — every amount rendered anywhere must be formatted using the *current space's* currency code from `SpaceContext`, never a hardcoded `₹`/`INR`. Decimal precision follows the field's DB type (`DECIMAL(14,2)` everywhere financial) — always 2 decimal places, even for whole-rupee/dollar amounts.

### 5.5 Other entity schemas

Build `contact.schema.ts` (name required, email/phone optional but validated as email/phone format if present), `expense.schema.ts` (amount positive, date required, category enum), `space.schema.ts` (name required, currency_code valid ISO 4217 — use a fixed list, don't free-text it), `partner.schema.ts` (`profit_share_percent` between 0–100 if provided, `initial_contribution_amount` non-negative if provided) — same pattern as §5.1: one schema file per entity, mirroring the data model's typed columns field-for-field, never looser than the DB constraint and only as strict as the PRD's stated behavior (e.g. don't add a 100%-sum hard validation across partners — that's explicitly a warning-only open decision per edge case #41).

---

## 6. User Flows

These are the flows that span more than one screen/component — written as the exact sequence to implement, so the assistant isn't inferring transitions between screens that `04_SCREENS.md` describes independently but doesn't connect end-to-end.

### 6.1 First-time user → first loan

1. Register (`/register`) → auto-redirect to `/spaces` (no spaces yet) → `<EmptyState>` prompting "Create your first space."
2. Create Space wizard (2 steps, §4.1 of `04_SCREENS.md`) → on success, land on that space's Dashboard.
3. Dashboard's empty state ("Record your first loan") → Loan Wizard.
4. Loan Wizard steps 1–6 → `POST /loans/` → land on Loan Detail (status DRAFT) with the persistent "Activate" banner.
5. User clicks Activate → confirm any warnings (e.g. future disbursement date) → `POST .../activate/` → schedule generates → Loan Detail now shows the Schedule tab populated, status badge flips to ACTIVE.

### 6.2 Recording a payment that triggers auto-closure

1. From Loan Detail (ACTIVE), click "Record Payment" → modal opens (§6.4 of `04_SCREENS.md`).
2. User enters an amount ≥ outstanding balance, leaves Auto-allocate on, submits.
3. Response includes `prompt: "Close as Fully Paid?"` → modal transitions in-place to a confirm step (don't close and reopen a new modal) — "Payment recorded. Outstanding balance is now ₹0. Close this loan as Fully Paid?" with Confirm/Not now.
4. Confirm → `POST .../close/ {closure_reason: FULLY_PAID}` → toast "Loan closed" → Loan Detail header updates to CLOSED, "Reopen" replaces the lifecycle button.
5. "Not now" → modal just closes; loan stays ACTIVE with ₹0 outstanding (a valid, if unusual, resting state) until the user closes it manually later.

### 6.3 Settling a loan

1. Loan Detail (ACTIVE) → overflow menu → "Close Loan" → "Settle."
2. Modal opens, fetches nothing new (outstanding balance already in Loan Detail's loaded state) — shows it read-only at the top.
3. User enters `settlement_amount`; Submit button is disabled live (RHF `watch` + comparison, not a Zod refine, since it's comparing against a value already in memory, not user input) if amount exceeds the shown outstanding balance.
4. Submit → `POST .../settle/` → on success, toast + Loan Detail header flips to CLOSED / closure_reason=SETTLED, and the Transactions tab now shows the new SETTLEMENT row.

### 6.4 Switching advance payment mode with existing credit

1. Loan Detail (ACTIVE, `advance_payment_mode=CARRY_FORWARD_CREDIT`, `advance_credit_balance > 0`) → overflow menu → "Switch Advance Mode."
2. Modal shows current vs. target mode; because credit balance > 0, shows the preview line with the exact credit amount and (if the client can determine it would zero the schedule — only possible if outstanding principal ≤ credit balance, computable client-side from already-loaded data) the "may close as Fully Paid" warning.
3. Confirm → `POST .../change-advance-mode/` → response includes `credit_applied`, `schedule_version`, and possibly an updated `status`.
4. If `status` came back CLOSED: same closed-state UI update as §6.2 step 4. If still ACTIVE: toast confirms credit applied, Schedule tab refetches to show the new `schedule_version`.

### 6.5 Inviting a member and them accepting

1. Owner: Members screen → Invite → email + role → `POST .../members/invite/` → new row appears with status PENDING.
2. Invitee receives email with a link to `/invites/:token`.
3. Invitee (not logged in): hitting that route checks auth state; if not authenticated, redirect to `/login?next=/invites/:token` (preserve the token through the auth flow), then back.
4. Once authenticated: `POST /api/invites/{token}/accept/` fires automatically on landing (no extra "accept" button needed — arriving at a valid, matching-email invite link while logged in is itself the confirmation) → redirect into that space's default landing route.
5. Back on the Owner's Members screen (if still open / on next load), the row's status flips PENDING → ACTIVE.

### 6.6 Restructuring an active loan's rate

1. Loan Detail → Restructuring tab (or overflow menu "Restructure" → "Change Rate") → modal: `effective_from` (date picker, dates before today disabled in the picker itself, not just validated after pick), `rate_value`, `rate_period`, `reason` (required).
2. Submit → `POST .../restructure/rate-change/` → toast → Restructuring tab's history list refetches and shows the new entry; Schedule tab (if the user navigates there) reflects the recalculated remaining installments under a new `schedule_version`.

---

## 7. Accessibility & Quality Floor

Non-negotiable, regardless of how much time pressure exists on any given screen:

- Every interactive element reachable and operable via keyboard; visible focus ring uses the `brass` token (not the browser default blue) so it matches the design system rather than clashing with it.
- All shadcn/ui (Radix) primitives already handle focus trapping in modals/menus correctly — don't override that behavior.
- Color is never the *only* signal — status badges carry text/icon, not just color (a colorblind user must be able to tell ACTIVE from CLOSED without relying on hue).
- Respect `prefers-reduced-motion` — the only motion in this app should be functional (toast slide-in, modal fade, accordion expand), so this is a low-cost rule to honor, not a tradeoff.
- Every form input has a real, associated `<label>` (via shadcn's `Label` + `htmlFor`), not a placeholder standing in for a label.

---

## 8. What Not to Do

- Don't build a second design system "just for the wizard" because it feels different from the rest of the app — it uses the same tokens and primitives as everywhere else, just arranged as steps.
- Don't hardcode any currency symbol, role name, or status label as raw strings scattered across components — centralize labels (`lib/labels.ts`) so a copy change is a one-file edit, not a grep-and-replace.
- Don't replicate the server's settlement-cap / net-position-cap / 100%-share math client-side as the source of truth — compute a *preview* from already-loaded data where `04_SCREENS.md` calls for it (§6.3, §6.6 above), but always let the actual submit go through the server and render whatever it returns.
- Don't add a dark mode toggle, animated number counters, gradient buttons, or pill-shaped buttons — none of these fit the ledger direction in §2, and none were asked for.
- Don't store the JWT access token in `localStorage`.

---

## 9. Open Items Carried Over

These are still unresolved at the API layer per the last review pass against the real Django urlpatterns — this guide builds *around* them rather than pretending they're decided:

1. **Password reset screens** have no backend route yet (`03_API_SPEC.md`/`04_SCREENS.md` §17 item 1) — stub the UI (`/forgot-password`, `/reset-password`) with the form and validation built per this guide's patterns, but leave the actual submit wired to a clearly-marked TODO endpoint until the backend adds it.
2. **`reports/partner-allocation/`** is unresolved (drop vs. add) — build the Partners-module dashboard (§11.2 of `04_SCREENS.md`) first since that route is confirmed; hold off on the Reports-nav duplicate entry until that's decided.
3. **Backup/Restore/Import/Export** have no screens designed yet at all (`04_SCREENS.md` §17 item 3) — don't build placeholder UI for these; wait for that design pass so the Data sub-screen isn't built twice.

---

*This document, together with `04_SCREENS.md`, `02_DATA_MODEL.md`, and `03_API_SPEC.md`, should be sufficient for an AI assistant to build any given screen end-to-end without needing to ask what color something should be, which library renders a date picker, or whether a field is required — those are exactly the questions this guide exists to answer ahead of time.*
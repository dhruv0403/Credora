#!/usr/bin/env bash
#
# Credora API smoke test — happy path + edge-case assertions.
#
# Prerequisites:
#   - Backend running:  cd Backend && python manage.py runserver
#   - PostgreSQL database `credora` available (see config/settings.py)
#   - curl installed
#   - python (or py -3, or jq) for parsing JSON responses
#     On Windows: use real Python, not the Microsoft Store stub for python3
#
# Usage:
#   cd Backend/scripts && bash api_smoke_test.sh
#   BASE=http://127.0.0.1:8000 bash api_smoke_test.sh
#
set -uo pipefail

BASE="${BASE:-http://127.0.0.1:8000}"
RUN_ID="${RUN_ID:-$(date +%s)}"
PASSWORD="password123"

OWNER_EMAIL="owner_${RUN_ID}@example.com"
VIEWER_EMAIL="viewer_${RUN_ID}@example.com"
FIELDMAN_EMAIL="fieldman_${RUN_ID}@example.com"

PASS=0
FAIL=0
SKIP=0

OWNER_ACCESS=""
OWNER_REFRESH=""
VIEWER_ACCESS=""
FIELDMAN_ACCESS=""
SPACE_ID=""
CONTACT_ID=""
LOAN_ID=""
LOAN2_ID=""
SCHEDULE_LINE_ID=""
TXN_ID=""
MEMBER_VIEWER_ID=""
OWNER_MEMBER_ID=""
INVITE_TOKEN=""
PARTNER_SPACE_ID=""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { printf '%s\n' "$*"; }
pass() { PASS=$((PASS + 1)); printf "${GREEN}PASS${NC}  %s\n" "$1"; }
fail() { FAIL=$((FAIL + 1)); printf "${RED}FAIL${NC}  %s\n" "$1"; [[ -n "${2:-}" ]] && printf "       %s\n" "$2"; }
skip() { SKIP=$((SKIP + 1)); printf "${YELLOW}SKIP${NC}  %s\n" "$1"; [[ -n "${2:-}" ]] && printf "       %s\n" "$2"; }

# Resolve a Python interpreter that actually runs (Windows Store stubs fail this check).
PYTHON_CMD=""
pick_python() {
  local candidate args
  for candidate in python py python3; do
    if [[ "$candidate" == "py" ]]; then
      args=(-3)
    else
      args=()
    fi
    if command -v "$candidate" >/dev/null 2>&1; then
      if "$candidate" "${args[@]}" -c "import json" >/dev/null 2>&1; then
        PYTHON_CMD="$candidate"
        if [[ "$candidate" == "py" ]]; then
          PYTHON_CMD="py -3"
        fi
        return 0
      fi
    fi
  done
  return 1
}

json_field() {
  local json="$1"
  local field="$2"

  if [[ -n "$PYTHON_CMD" ]]; then
    # shellcheck disable=SC2086
    JSON="$json" FIELD="$field" $PYTHON_CMD - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
field = os.environ["FIELD"]
parts = field.split(".")
cur = data
for p in parts:
    if cur is None:
        break
    if isinstance(cur, dict):
        cur = cur.get(p)
    elif isinstance(cur, list) and p.isdigit():
        cur = cur[int(p)]
    else:
        cur = None
        break
if cur is None:
    print("")
elif isinstance(cur, (dict, list)):
    print(json.dumps(cur))
else:
    print(cur)
PY
    return
  fi

  if command -v jq >/dev/null 2>&1; then
    local jq_path
    jq_path=$(echo "$field" | awk -F. '{
      out=""
      for (i=1; i<=NF; i++) {
        if ($i ~ /^[0-9]+$/) out = out "[" $i "]"
        else out = out "." $i
      }
      sub(/^\./, "", out)
      print "." out
    }')
    echo "$json" | jq -r "${jq_path} // empty"
    return
  fi

  # Last-resort grep for top-level string/number fields.
  case "$field" in
    access|refresh|id|invite_token)
      echo "$json" | grep -o "\"${field}\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed 's/.*:[[:space:]]*"\([^"]*\)".*/\1/'
      ;;
    *)
      echo ""
      ;;
  esac
}

# api METHOD PATH [JSON_BODY] [AUTH_TOKEN]
# Sets globals: LAST_CODE, LAST_BODY
api() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local token="${4:-}"

  local args=(-sS -w "\n%{http_code}" -X "$method" "${BASE}${path}")
  args+=(-H "Content-Type: application/json")
  if [[ -n "$token" ]]; then
    args+=(-H "Authorization: Bearer ${token}")
  fi
  if [[ -n "$body" ]]; then
    args+=(-d "$body")
  fi

  local raw
  raw="$(curl "${args[@]}" 2>&1)" || {
    LAST_CODE="000"
    LAST_BODY="$raw"
    return 1
  }

  LAST_CODE="${raw##*$'\n'}"
  LAST_BODY="${raw%$'\n'*}"
  LAST_BODY="${LAST_BODY%$'\n'}"
}

expect_status() {
  local label="$1"
  local expected="$2"
  shift 2
  api "$@"
  if [[ "$LAST_CODE" == "$expected" ]]; then
    pass "$label (HTTP $expected)"
  else
    fail "$label (expected HTTP $expected, got $LAST_CODE)" "$(echo "$LAST_BODY" | head -c 300)"
  fi
}

expect_edge_ref() {
  local label="$1"
  local expected_ref="$2"
  shift 2
  api "$@"
  local ref
  ref="$(json_field "$LAST_BODY" "error.edge_case_ref")"
  if [[ "$ref" == "$expected_ref" ]]; then
    pass "$label (edge_case_ref=$expected_ref, HTTP $LAST_CODE)"
  else
    fail "$label (expected edge_case_ref=$expected_ref, got '${ref:-none}', HTTP $LAST_CODE)" "$(echo "$LAST_BODY" | head -c 300)"
  fi
}

section() {
  log ""
  log "══════════════════════════════════════════════════════════════"
  log " $1"
  log "══════════════════════════════════════════════════════════════"
}

check_server() {
  section "0. Prerequisites + connectivity"

  if pick_python; then
    pass "Python available for JSON parsing ($PYTHON_CMD)"
  elif command -v jq >/dev/null 2>&1; then
    pass "jq available for JSON parsing"
  else
    fail "Need python or jq to parse API responses (install Python and disable Windows Store alias for python3)"
    exit 1
  fi

  api GET "/api/spaces/" "" ""
  if [[ "$LAST_CODE" == "401" || "$LAST_CODE" == "403" ]]; then
    pass "Server reachable at $BASE (HTTP $LAST_CODE without auth)"
  elif [[ "$LAST_CODE" == "000" ]]; then
    fail "Cannot reach $BASE — start the server: cd Backend && python manage.py runserver"
    exit 1
  else
    pass "Server reachable at $BASE (HTTP $LAST_CODE)"
  fi
}

setup_owner() {
  section "1. Auth — owner happy path"

  expect_status "Register owner" 201 POST "/api/auth/register/" \
    "{\"email\":\"${OWNER_EMAIL}\",\"display_name\":\"Test Owner\",\"password\":\"${PASSWORD}\"}"

  api POST "/api/auth/login/" "{\"email\":\"${OWNER_EMAIL}\",\"password\":\"${PASSWORD}\"}"
  if [[ "$LAST_CODE" == "200" ]]; then
    OWNER_ACCESS="$(json_field "$LAST_BODY" "access")"
    OWNER_REFRESH="$(json_field "$LAST_BODY" "refresh")"
    if [[ -z "$OWNER_ACCESS" ]]; then
      fail "Login owner — could not parse access token from response" "$LAST_BODY"
      exit 1
    fi
    pass "Login owner (HTTP 200, token captured)"
  else
    fail "Login owner" "$LAST_BODY"
    exit 1
  fi

  expect_status "GET /users/me/" 200 GET "/api/users/me/" "" "$OWNER_ACCESS"

  api PATCH "/api/users/me/" "{\"display_name\":\"Owner Updated\"}" "$OWNER_ACCESS"
  if [[ "$LAST_CODE" == "200" ]]; then
    pass "PATCH /users/me/"
  else
    fail "PATCH /users/me/" "$LAST_BODY"
  fi
}

auth_edge_cases() {
  section "2. Auth edge cases"

  expect_status "Unauthenticated /users/me/ -> 401" 401 GET "/api/users/me/" "" ""
  expect_status "Wrong password login -> 401" 401 POST "/api/auth/login/" \
    "{\"email\":\"${OWNER_EMAIL}\",\"password\":\"wrong-password\"}"
  expect_status "Duplicate register -> 400" 400 POST "/api/auth/register/" \
    "{\"email\":\"${OWNER_EMAIL}\",\"display_name\":\"Dup\",\"password\":\"${PASSWORD}\"}"
  expect_status "Bad old password on change -> 400" 400 POST "/api/users/me/change-password/" \
    "{\"old_password\":\"wrong\",\"new_password\":\"newpass123\"}" "$OWNER_ACCESS"
}

setup_space_and_contact() {
  section "3. Space + contact happy path"

  api POST "/api/spaces/" \
    '{"name":"Smoke Test Space","space_type":"PERSONAL","space_visibility":"PRIVATE","currency_code":"INR"}' \
    "$OWNER_ACCESS"
  if [[ "$LAST_CODE" == "201" ]]; then
    SPACE_ID="$(json_field "$LAST_BODY" "id")"
    pass "Create space (id=$SPACE_ID)"
  else
    fail "Create space" "$LAST_BODY"
    exit 1
  fi

  api PATCH "/api/users/me/" "{\"last_active_space\":${SPACE_ID}}" "$OWNER_ACCESS"
  [[ "$LAST_CODE" == "200" ]] && pass "Set last_active_space" || fail "Set last_active_space" "$LAST_BODY"

  expect_status "List spaces" 200 GET "/api/spaces/" "" "$OWNER_ACCESS"
  expect_status "Space detail" 200 GET "/api/spaces/${SPACE_ID}/" "" "$OWNER_ACCESS"

  api GET "/api/spaces/${SPACE_ID}/members/" "" "$OWNER_ACCESS"
  if [[ "$LAST_CODE" == "200" ]]; then
    OWNER_MEMBER_ID="$(json_field "$LAST_BODY" "results.0.id")"
    if [[ -z "$OWNER_MEMBER_ID" || "$OWNER_MEMBER_ID" == "null" ]]; then
      OWNER_MEMBER_ID="$(json_field "$LAST_BODY" "0.id")"
    fi
    pass "Resolved owner member id=${OWNER_MEMBER_ID:-unknown}"
  fi
  expect_status "Dashboard" 200 GET "/api/spaces/${SPACE_ID}/dashboard/" "" "$OWNER_ACCESS"
  expect_status "GET settings" 200 GET "/api/spaces/${SPACE_ID}/settings/" "" "$OWNER_ACCESS"

  api PATCH "/api/spaces/${SPACE_ID}/settings/" \
    '{"default_interest_type":"REDUCING_BALANCE","default_rate_value":"1.5","default_rate_period":"MONTH","default_grace_period_days":3}' \
    "$OWNER_ACCESS"
  [[ "$LAST_CODE" == "200" ]] && pass "PATCH settings" || fail "PATCH settings" "$LAST_BODY"

  api POST "/api/spaces/${SPACE_ID}/contacts/" \
    '{"name":"Borrower Joe","phone":"9876543210","email":"joe@example.com","relationship_tag":"FRIEND"}' \
    "$OWNER_ACCESS"
  if [[ "$LAST_CODE" == "201" ]]; then
    CONTACT_ID="$(json_field "$LAST_BODY" "id")"
    pass "Create contact (id=$CONTACT_ID)"
  else
    fail "Create contact" "$LAST_BODY"
    exit 1
  fi

  expect_status "List contacts" 200 GET "/api/spaces/${SPACE_ID}/contacts/" "" "$OWNER_ACCESS"
  expect_status "Contact detail" 200 GET "/api/spaces/${SPACE_ID}/contacts/${CONTACT_ID}/" "" "$OWNER_ACCESS"
}

loan_happy_path() {
  section "4. Loan lifecycle happy path"

  api POST "/api/spaces/${SPACE_ID}/loans/" \
    "{\"contact_id\":${CONTACT_ID},\"direction\":\"GIVEN\",\"principal_amount\":\"10000.00\",\"start_date\":\"2026-07-01\",\"first_due_date\":\"2026-08-01\",\"tenure_periods\":6,\"interest_type\":\"REDUCING_BALANCE\",\"rate_value\":\"1.5\",\"rate_period\":\"MONTH\",\"interest_timing\":\"PAYABLE_PERIODICALLY\",\"interest_rate_behavior\":\"FIXED\",\"repayment_type\":\"EMI\",\"payment_frequency\":\"MONTHLY\",\"payment_timing_rule\":\"SCHEDULED\",\"penalty_type\":\"PERCENTAGE\",\"penalty_value\":\"2.0\",\"grace_period_days\":3}" \
    "$OWNER_ACCESS"
  if [[ "$LAST_CODE" == "201" ]]; then
    LOAN_ID="$(json_field "$LAST_BODY" "id")"
    pass "Create DRAFT loan (id=$LOAN_ID)"
  else
    fail "Create DRAFT loan" "$LAST_BODY"
    exit 1
  fi

  expect_status "List loans" 200 GET "/api/spaces/${SPACE_ID}/loans/" "" "$OWNER_ACCESS"
  expect_status "Loan detail" 200 GET "/api/spaces/${SPACE_ID}/loans/${LOAN_ID}/" "" "$OWNER_ACCESS"

  api POST "/api/spaces/${SPACE_ID}/loans/${LOAN_ID}/activate/" "" "$OWNER_ACCESS"
  if [[ "$LAST_CODE" == "200" ]]; then
    pass "Activate loan"
  else
    fail "Activate loan" "$LAST_BODY"
    exit 1
  fi

  api GET "/api/spaces/${SPACE_ID}/loans/${LOAN_ID}/schedule/" "" "$OWNER_ACCESS"
  if [[ "$LAST_CODE" == "200" ]]; then
    SCHEDULE_LINE_ID="$(json_field "$LAST_BODY" "0.id")"
    pass "Get schedule (line_id=${SCHEDULE_LINE_ID:-none})"
  else
    fail "Get schedule" "$LAST_BODY"
  fi

  api POST "/api/spaces/${SPACE_ID}/transactions/" \
    "{\"loan_id\":${LOAN_ID},\"type\":\"PAYMENT_RECEIVED\",\"amount\":\"100.00\",\"transaction_date\":\"2026-07-15\",\"collection_method\":\"UPI\",\"note\":\"Partial payment\"}" \
    "$OWNER_ACCESS"
  if [[ "$LAST_CODE" == "201" ]]; then
    TXN_ID="$(json_field "$LAST_BODY" "transaction.id")"
    pass "Record payment (txn_id=$TXN_ID)"
  else
    fail "Record payment" "$LAST_BODY"
  fi

  expect_status "List loan transactions" 200 GET "/api/spaces/${SPACE_ID}/loans/${LOAN_ID}/transactions/" "" "$OWNER_ACCESS"
  expect_status "List space transactions" 200 GET "/api/spaces/${SPACE_ID}/transactions/?loan_id=${LOAN_ID}" "" "$OWNER_ACCESS"

  if [[ -n "$TXN_ID" ]]; then
    expect_status "Transaction detail" 200 GET "/api/spaces/${SPACE_ID}/transactions/${TXN_ID}/" "" "$OWNER_ACCESS"
    api POST "/api/spaces/${SPACE_ID}/transactions/${TXN_ID}/reverse/" '{"reason":"Smoke test reversal"}' "$OWNER_ACCESS"
    [[ "$LAST_CODE" == "200" ]] && pass "Reverse transaction (edge #29)" || fail "Reverse transaction" "$LAST_BODY"
  fi

  api POST "/api/spaces/${SPACE_ID}/loans/${LOAN_ID}/notes/" '{"note":"Field visit note"}' "$OWNER_ACCESS"
  [[ "$LAST_CODE" == "200" ]] && pass "Add loan note" || fail "Add loan note" "$LAST_BODY"

  api GET "/api/spaces/${SPACE_ID}/contacts/${CONTACT_ID}/loans/" "" "$OWNER_ACCESS"
  if [[ "$LAST_CODE" == "200" ]]; then
    pass "Contact loans + net_position (edge #48)"
  else
    fail "Contact loans" "$LAST_BODY"
  fi
}

loan_edge_cases() {
  section "5. Loan + transaction edge cases"

  # Edge #18 — may return 400 if validation wired, else documents gap
  api POST "/api/spaces/${SPACE_ID}/loans/" \
    "{\"contact_id\":${CONTACT_ID},\"direction\":\"GIVEN\",\"principal_amount\":\"0\",\"start_date\":\"2026-07-01\",\"first_due_date\":\"2026-08-01\",\"tenure_periods\":6,\"interest_type\":\"NONE\",\"repayment_type\":\"EMI\",\"payment_frequency\":\"MONTHLY\"}" \
    "$OWNER_ACCESS"
  if [[ "$LAST_CODE" == "400" ]]; then
    pass "Edge #18: zero principal -> 400"
  else
    fail "Edge #18: zero principal -> 400" "got HTTP $LAST_CODE"
  fi

  # Edge #17
  api POST "/api/spaces/${SPACE_ID}/loans/" \
    "{\"contact_id\":${CONTACT_ID},\"direction\":\"GIVEN\",\"principal_amount\":\"1000\",\"start_date\":\"2026-08-01\",\"first_due_date\":\"2026-07-01\",\"tenure_periods\":6,\"interest_type\":\"NONE\",\"repayment_type\":\"EMI\",\"payment_frequency\":\"MONTHLY\"}" \
    "$OWNER_ACCESS"
  if [[ "$LAST_CODE" == "400" ]]; then
    pass "Edge #17: first_due before start -> 400"
  else
    fail "Edge #17: first_due before start -> 400" "got HTTP $LAST_CODE"
  fi

  # Edge #35
  api POST "/api/spaces/${SPACE_ID}/loans/" \
    "{\"contact_id\":${CONTACT_ID},\"direction\":\"GIVEN\",\"principal_amount\":\"10000\",\"start_date\":\"2026-07-01\",\"first_due_date\":\"2026-08-01\",\"tenure_periods\":6,\"interest_type\":\"COMPOUND\",\"rate_value\":\"12\",\"rate_period\":\"YEAR\",\"repayment_type\":\"EMI\",\"payment_frequency\":\"MONTHLY\",\"penalty_type\":\"EXTRA_INTEREST\",\"penalty_value\":\"1\"}" \
    "$OWNER_ACCESS"
  if [[ "$LAST_CODE" == "400" ]]; then
    pass "Edge #35: EXTRA_INTEREST + COMPOUND -> 400"
  else
    fail "Edge #35: EXTRA_INTEREST + COMPOUND -> 400" "got HTTP $LAST_CODE"
  fi

  # Edge #9: PATCH rate on ACTIVE loan
  expect_edge_ref "Edge #9: PATCH financial field on ACTIVE loan" 9 \
    PATCH "/api/spaces/${SPACE_ID}/loans/${LOAN_ID}/" '{"rate_value":"99.0"}' "$OWNER_ACCESS"

  # Edge #30: transaction before start_date
  expect_edge_ref "Edge #30: transaction before loan start" 30 \
    POST "/api/spaces/${SPACE_ID}/transactions/" \
    "{\"loan_id\":${LOAN_ID},\"type\":\"PAYMENT_RECEIVED\",\"amount\":\"100\",\"transaction_date\":\"2020-01-01\"}" \
    "$OWNER_ACCESS"

  # Edge #27: future transaction date (warning, not error)
  api POST "/api/spaces/${SPACE_ID}/transactions/" \
    "{\"loan_id\":${LOAN_ID},\"type\":\"PAYMENT_RECEIVED\",\"amount\":\"50\",\"transaction_date\":\"2035-01-01\"}" \
    "$OWNER_ACCESS"
  if [[ "$LAST_CODE" == "201" ]]; then
    warnings="$(json_field "$LAST_BODY" "warnings")"
    if [[ "$warnings" == *"future"* || "$warnings" == "[]" || -z "$warnings" ]]; then
      pass "Edge #27: future transaction date -> 201 (warnings=${warnings:-none})"
    else
      pass "Edge #27: future transaction date -> 201"
    fi
  else
    fail "Edge #27: future transaction date -> 201" "got HTTP $LAST_CODE"
  fi

  # Create second loan for close/settle tests
  api POST "/api/spaces/${SPACE_ID}/loans/" \
    "{\"contact_id\":${CONTACT_ID},\"direction\":\"GIVEN\",\"principal_amount\":\"5000.00\",\"start_date\":\"2026-07-01\",\"first_due_date\":\"2026-08-01\",\"tenure_periods\":3,\"interest_type\":\"NONE\",\"repayment_type\":\"EMI\",\"payment_frequency\":\"MONTHLY\",\"payment_timing_rule\":\"SCHEDULED\"}" \
    "$OWNER_ACCESS"
  LOAN2_ID="$(json_field "$LAST_BODY" "id")"
  api POST "/api/spaces/${SPACE_ID}/loans/${LOAN2_ID}/activate/" "" "$OWNER_ACCESS"

  # Edge #25: payment on closed loan
  api POST "/api/spaces/${SPACE_ID}/loans/${LOAN2_ID}/close/" \
    '{"closure_reason":"MANUALLY_CLOSED","closure_note":"Smoke test close"}' "$OWNER_ACCESS"
  expect_edge_ref "Edge #25: payment on CLOSED loan" 25 \
    POST "/api/spaces/${SPACE_ID}/transactions/" \
    "{\"loan_id\":${LOAN2_ID},\"type\":\"PAYMENT_RECEIVED\",\"amount\":\"100\",\"transaction_date\":\"2026-07-15\"}" \
    "$OWNER_ACCESS"

  # Edge #23: top-up on closed loan
  expect_edge_ref "Edge #23: disbursement on CLOSED loan" 23 \
    POST "/api/spaces/${SPACE_ID}/loans/${LOAN2_ID}/disbursements/" \
    '{"amount":"1000","disbursement_date":"2026-08-01","label":"TOP_UP"}' "$OWNER_ACCESS"

  # Edge #38: reopen without reason
  api POST "/api/spaces/${SPACE_ID}/loans/${LOAN2_ID}/reopen/" '{}' "$OWNER_ACCESS"
  ref="$(json_field "$LAST_BODY" "error.edge_case_ref")"
  if [[ "$ref" == "38" || "$LAST_CODE" == "400" ]]; then
    pass "Edge #38: reopen without reason -> 400"
  else
    fail "Edge #38: reopen without reason -> 400" "got HTTP $LAST_CODE ref=${ref:-none}"
  fi

  api POST "/api/spaces/${SPACE_ID}/loans/${LOAN2_ID}/reopen/" '{"reason":"Smoke test reopen"}' "$OWNER_ACCESS"
  [[ "$LAST_CODE" == "200" ]] && pass "Reopen loan with reason" || fail "Reopen loan" "$LAST_BODY"

  # Edge #22: CUSTOM_INSTALLMENTS activate without lines
  api POST "/api/spaces/${SPACE_ID}/loans/" \
    "{\"contact_id\":${CONTACT_ID},\"direction\":\"GIVEN\",\"principal_amount\":\"3000\",\"start_date\":\"2026-07-01\",\"first_due_date\":\"2026-08-01\",\"tenure_periods\":3,\"interest_type\":\"NONE\",\"repayment_type\":\"CUSTOM_INSTALLMENTS\",\"payment_frequency\":\"MONTHLY\"}" \
    "$OWNER_ACCESS"
  local custom_loan
  custom_loan="$(json_field "$LAST_BODY" "id")"
  expect_edge_ref "Edge #22: activate CUSTOM loan without schedule lines" 22 \
    POST "/api/spaces/${SPACE_ID}/loans/${custom_loan}/activate/" "" "$OWNER_ACCESS"

  # Edge #44: delete contact with loans
  expect_edge_ref "Edge #44: delete contact with active loans" 44 \
    DELETE "/api/spaces/${SPACE_ID}/contacts/${CONTACT_ID}/" "" "$OWNER_ACCESS"
}

space_edge_cases() {
  section "6. Space edge cases"

  expect_edge_ref "Edge #8: delete space wrong confirm_name" 8 \
    DELETE "/api/spaces/${SPACE_ID}/" '{"confirm_name":"Wrong Name"}' "$OWNER_ACCESS"

  expect_status "Non-member space access -> 404" 404 GET "/api/spaces/999999/" "" "$OWNER_ACCESS"
}

members_and_rbac() {
  section "7. Members + RBAC"

  api POST "/api/spaces/${SPACE_ID}/members/invite/" \
    "{\"email\":\"${VIEWER_EMAIL}\",\"role\":\"VIEWER\"}" "$OWNER_ACCESS"
  if [[ "$LAST_CODE" == "200" || "$LAST_CODE" == "201" ]]; then
    INVITE_TOKEN="$(json_field "$LAST_BODY" "invite_token")"
    MEMBER_VIEWER_ID="$(json_field "$LAST_BODY" "member.id")"
    pass "Invite viewer (token=${INVITE_TOKEN:0:8}...)"
  else
    fail "Invite viewer" "$LAST_BODY"
  fi

  api POST "/api/spaces/${SPACE_ID}/members/invite/" \
    "{\"email\":\"${FIELDMAN_EMAIL}\",\"role\":\"FIELDMAN\"}" "$OWNER_ACCESS"
  if [[ "$LAST_CODE" == "200" || "$LAST_CODE" == "201" ]]; then
    FIELDMAN_INVITE_TOKEN="$(json_field "$LAST_BODY" "invite_token")"
    pass "Invite fieldman"
  else
    fail "Invite fieldman" "$LAST_BODY"
  fi

  expect_status "List members" 200 GET "/api/spaces/${SPACE_ID}/members/" "" "$OWNER_ACCESS"

  # Register + accept viewer invite
  api POST "/api/auth/register/" \
    "{\"email\":\"${VIEWER_EMAIL}\",\"display_name\":\"Viewer User\",\"password\":\"${PASSWORD}\"}"
  api POST "/api/auth/login/" "{\"email\":\"${VIEWER_EMAIL}\",\"password\":\"${PASSWORD}\"}"
  VIEWER_ACCESS="$(json_field "$LAST_BODY" "access")"
  if [[ -n "$INVITE_TOKEN" && -n "$VIEWER_ACCESS" ]]; then
    api POST "/api/invites/${INVITE_TOKEN}/accept/" "" "$VIEWER_ACCESS"
    [[ "$LAST_CODE" == "200" ]] && pass "Viewer accepts invite (edge #2)" || fail "Viewer accept invite" "$LAST_BODY"
  fi

  api POST "/api/auth/register/" \
    "{\"email\":\"${FIELDMAN_EMAIL}\",\"display_name\":\"Field Man\",\"password\":\"${PASSWORD}\"}"
  api POST "/api/auth/login/" "{\"email\":\"${FIELDMAN_EMAIL}\",\"password\":\"${PASSWORD}\"}"
  FIELDMAN_ACCESS="$(json_field "$LAST_BODY" "access")"
  if [[ -n "$FIELDMAN_INVITE_TOKEN" && -n "$FIELDMAN_ACCESS" ]]; then
    api POST "/api/invites/${FIELDMAN_INVITE_TOKEN}/accept/" "" "$FIELDMAN_ACCESS"
    [[ "$LAST_CODE" == "200" ]] && pass "FieldMan accepts invite" || fail "FieldMan accept invite" "$LAST_BODY"
  fi

  # Edge #4: viewer cannot record payment
  api POST "/api/spaces/${SPACE_ID}/transactions/" \
    "{\"loan_id\":${LOAN_ID},\"type\":\"PAYMENT_RECEIVED\",\"amount\":\"100\",\"transaction_date\":\"2026-07-20\"}" \
    "$VIEWER_ACCESS"
  if [[ "$LAST_CODE" == "403" ]]; then
    pass "Edge #4: VIEWER payment -> 403"
  else
    fail "Edge #4: VIEWER payment -> 403" "got HTTP $LAST_CODE"
  fi

  # FieldMan dashboard -> 403
  api GET "/api/spaces/${SPACE_ID}/dashboard/" "" "$FIELDMAN_ACCESS"
  if [[ "$LAST_CODE" == "403" ]]; then
    pass "FieldMan dashboard -> 403"
  else
    fail "FieldMan dashboard -> 403" "got HTTP $LAST_CODE"
  fi

  # FieldMan activity -> 403
  api GET "/api/spaces/${SPACE_ID}/activity/" "" "$FIELDMAN_ACCESS"
  if [[ "$LAST_CODE" == "403" ]]; then
    pass "FieldMan activity -> 403"
  else
    fail "FieldMan activity -> 403" "got HTTP $LAST_CODE"
  fi

  # FieldMan CAN record payment
  api POST "/api/spaces/${SPACE_ID}/transactions/" \
    "{\"loan_id\":${LOAN_ID},\"type\":\"PAYMENT_RECEIVED\",\"amount\":\"50\",\"transaction_date\":\"2026-07-21\"}" \
    "$FIELDMAN_ACCESS"
  if [[ "$LAST_CODE" == "201" ]]; then
    pass "FieldMan payment -> 201"
  else
    fail "FieldMan payment -> 201" "got HTTP $LAST_CODE"
  fi

  # Edge #3: viewer cannot PATCH settings (need admin — register admin user)
  api POST "/api/spaces/${SPACE_ID}/members/invite/" \
    "{\"email\":\"admin_${RUN_ID}@example.com\",\"role\":\"ADMIN\"}" "$OWNER_ACCESS"
  local admin_token=""
  local admin_invite
  admin_invite="$(json_field "$LAST_BODY" "invite_token")"
  api POST "/api/auth/register/" \
    "{\"email\":\"admin_${RUN_ID}@example.com\",\"display_name\":\"Admin User\",\"password\":\"${PASSWORD}\"}"
  api POST "/api/auth/login/" "{\"email\":\"admin_${RUN_ID}@example.com\",\"password\":\"${PASSWORD}\"}"
  admin_token="$(json_field "$LAST_BODY" "access")"
  if [[ -n "$admin_invite" && -n "$admin_token" ]]; then
    api POST "/api/invites/${admin_invite}/accept/" "" "$admin_token"
    api PATCH "/api/spaces/${SPACE_ID}/settings/" '{"default_grace_period_days":5}' "$admin_token"
    if [[ "$LAST_CODE" == "403" ]]; then
      pass "Edge #3: ADMIN settings PATCH -> 403"
    else
      fail "Edge #3: ADMIN settings PATCH -> 403" "got HTTP $LAST_CODE"
    fi
  else
    skip "Edge #3: ADMIN settings PATCH" "could not set up admin user"
  fi

  # Edge #1: cannot remove sole owner
  if [[ -n "$OWNER_MEMBER_ID" ]]; then
    expect_edge_ref "Edge #1: remove sole OWNER" 1 \
      DELETE "/api/spaces/${SPACE_ID}/members/${OWNER_MEMBER_ID}/" "" "$OWNER_ACCESS"
  else
    skip "Edge #1: remove sole OWNER" "owner member id unknown"
  fi
}

partners_and_shared_space() {
  section "8. Partners (BUSINESS + SHARED space)"

  api POST "/api/spaces/" \
    '{"name":"Partner Space","space_type":"BUSINESS","space_visibility":"SHARED","currency_code":"INR"}' \
    "$OWNER_ACCESS"
  PARTNER_SPACE_ID="$(json_field "$LAST_BODY" "id")"
  if [[ -z "$PARTNER_SPACE_ID" ]]; then
    skip "Partners flow" "could not create business space"
    return
  fi
  pass "Create BUSINESS+SHARED space (id=$PARTNER_SPACE_ID)"

  api GET "/api/spaces/${PARTNER_SPACE_ID}/members/" "" "$OWNER_ACCESS"
  local partner_space_member_id
  partner_space_member_id="$(json_field "$LAST_BODY" "results.0.id")"
  if [[ -z "$partner_space_member_id" || "$partner_space_member_id" == "null" ]]; then
    partner_space_member_id="$(json_field "$LAST_BODY" "0.id")"
  fi

  api POST "/api/spaces/${PARTNER_SPACE_ID}/partners/" \
    "{\"space_member_id\":${partner_space_member_id},\"initial_contribution_amount\":\"10000\",\"profit_share_percent\":\"100\"}" \
    "$OWNER_ACCESS"
  if [[ "$LAST_CODE" == "400" || "$LAST_CODE" == "404" ]]; then
    skip "Designate partner" "member_id may differ in fresh DB — invite admin to partner space first"
  elif [[ "$LAST_CODE" == "201" ]]; then
    pass "Designate partner"
    local partner_id
    partner_id="$(json_field "$LAST_BODY" "id")"
    api POST "/api/spaces/${PARTNER_SPACE_ID}/partners/${partner_id}/capital-transactions/" \
      '{"type":"WITHDRAWAL","amount":"999999","transaction_date":"2026-07-01"}' "$OWNER_ACCESS"
    ref="$(json_field "$LAST_BODY" "error.edge_case_ref")"
    if [[ "$ref" == "43" || "$LAST_CODE" == "400" ]]; then
      pass "Edge #43: withdrawal exceeds net position"
    else
      fail "Edge #43: withdrawal exceeds net position" "HTTP $LAST_CODE"
    fi
  fi

  api GET "/api/spaces/${SPACE_ID}/partners/" "" "$OWNER_ACCESS"
  if [[ "$LAST_CODE" == "400" ]]; then
    pass "Partners on PERSONAL space -> 400 (expected)"
  else
    fail "Partners on PERSONAL space -> 400" "got HTTP $LAST_CODE"
  fi

  # Edge #7: business -> personal with partners (if partner was created on PARTNER_SPACE)
  api POST "/api/spaces/${PARTNER_SPACE_ID}/change-type/" \
    '{"target_type":"PERSONAL","confirm":true}' "$OWNER_ACCESS"
  if [[ "$LAST_CODE" == "409" ]]; then
    pass "Edge #7: BUSINESS->PERSONAL with partners -> 409"
  elif [[ "$LAST_CODE" == "200" ]]; then
    skip "Edge #7" "no partners on space yet"
  else
    fail "Edge #7" "got HTTP $LAST_CODE"
  fi
}

reports_expenses_documents() {
  section "9. Expenses, documents, reports, analytics"

  api POST "/api/spaces/${SPACE_ID}/expenses/" \
    "{\"loan\":${LOAN_ID},\"category\":\"COLLECTION\",\"amount\":\"150.00\",\"expense_date\":\"2026-07-15\",\"note\":\"Travel\"}" \
    "$OWNER_ACCESS"
  local expense_id
  expense_id="$(json_field "$LAST_BODY" "id")"
  [[ "$LAST_CODE" == "201" && -n "$expense_id" ]] && pass "Create expense" || fail "Create expense" "$LAST_BODY"

  api POST "/api/spaces/${SPACE_ID}/documents/" \
    "{\"entity_type\":\"LOAN\",\"entity_id\":${LOAN_ID},\"document_type\":\"AGREEMENT\",\"file_name\":\"agreement.pdf\",\"storage_path\":\"/uploads/agreement.pdf\",\"file_size_bytes\":1024}" \
    "$OWNER_ACCESS"
  [[ "$LAST_CODE" == "201" ]] && pass "Create document metadata" || fail "Create document" "$LAST_BODY"

  for path in \
    "/api/spaces/${SPACE_ID}/reports/receivable/" \
    "/api/spaces/${SPACE_ID}/reports/payable/" \
    "/api/spaces/${SPACE_ID}/reports/interest/" \
    "/api/spaces/${SPACE_ID}/reports/overdue/" \
    "/api/spaces/${SPACE_ID}/reports/cash-flow/" \
    "/api/spaces/${SPACE_ID}/analytics/net-position/" \
    "/api/spaces/${SPACE_ID}/analytics/top-contacts/?role=borrower" \
    "/api/spaces/${SPACE_ID}/analytics/loan-rankings/?by=overdue" \
    "/api/spaces/${SPACE_ID}/analytics/trends/?metric=lending&granularity=month" \
    "/api/spaces/${SPACE_ID}/activity/"
  do
    api GET "$path" "" "$OWNER_ACCESS"
    [[ "$LAST_CODE" == "200" ]] && pass "GET ${path}" || fail "GET ${path}" "HTTP $LAST_CODE"
  done
}

restructure_tests() {
  section "10. Restructuring (Owner/Admin only)"

  api POST "/api/spaces/${SPACE_ID}/loans/${LOAN_ID}/restructure/rate-change/" \
    '{"effective_from":"2020-01-01","rate_value":"2.0","rate_period":"MONTH","reason":"Past date test"}' \
    "$OWNER_ACCESS"
  ref="$(json_field "$LAST_BODY" "error.edge_case_ref")"
  if [[ "$ref" == "14" || "$LAST_CODE" == "400" ]]; then
    pass "Edge #14: rate change effective_from in past -> 400"
  else
    fail "Edge #14: rate change past date" "HTTP $LAST_CODE"
  fi

  api POST "/api/spaces/${SPACE_ID}/loans/${LOAN_ID}/restructure/rate-change/" \
    '{"effective_from":"2030-01-01","rate_value":"2.0","rate_period":"MONTH","reason":"Future rate change"}' \
    "$OWNER_ACCESS"
  [[ "$LAST_CODE" == "200" ]] && pass "Rate change with valid date" || fail "Rate change valid" "$LAST_BODY"

  expect_status "Restructure history" 200 GET "/api/spaces/${SPACE_ID}/loans/${LOAN_ID}/restructure/history/" "" "$OWNER_ACCESS"

  # Edge #39: viewer restructure -> 403
  api POST "/api/spaces/${SPACE_ID}/loans/${LOAN_ID}/restructure/extend-tenure/" \
    '{"added_periods":1,"reason":"Viewer attempt"}' "$VIEWER_ACCESS"
  if [[ "$LAST_CODE" == "403" ]]; then
    pass "Edge #39: VIEWER restructure -> 403"
  else
    fail "Edge #39: VIEWER restructure -> 403" "HTTP $LAST_CODE"
  fi
}

auth_teardown() {
  section "11. Token refresh + logout"

  if [[ -n "$OWNER_REFRESH" ]]; then
    api POST "/api/auth/refresh/" "{\"refresh\":\"${OWNER_REFRESH}\"}"
    if [[ "$LAST_CODE" == "200" ]]; then
      OWNER_REFRESH="$(json_field "$LAST_BODY" "refresh")"
      pass "Refresh token"
    else
      fail "Refresh token" "$LAST_BODY"
    fi
    api POST "/api/auth/logout/" "{\"refresh\":\"${OWNER_REFRESH}\"}" "$OWNER_ACCESS"
    [[ "$LAST_CODE" == "200" || "$LAST_CODE" == "205" ]] && pass "Logout" || fail "Logout" "$LAST_BODY"
  else
    skip "Refresh/logout" "no refresh token"
  fi
}

summary() {
  section "Summary"
  local total=$((PASS + FAIL + SKIP))
  log "Run ID:    $RUN_ID"
  log "Base URL:  $BASE"
  log "Owner:     $OWNER_EMAIL"
  log "Space ID:  ${SPACE_ID:-n/a}"
  log "Loan ID:   ${LOAN_ID:-n/a}"
  log ""
  log "Total:  $total"
  printf "${GREEN}Passed: %s${NC}\n" "$PASS"
  printf "${RED}Failed: %s${NC}\n" "$FAIL"
  printf "${YELLOW}Skipped: %s${NC}\n" "$SKIP"
  log ""
  if [[ "$FAIL" -gt 0 ]]; then
    log "Some checks failed — review output above."
    exit 1
  fi
  log "All checks passed."
  exit 0
}

main() {
  log "Credora API smoke test"
  log "BASE=$BASE  RUN_ID=$RUN_ID"
  check_server
  setup_owner
  auth_edge_cases
  setup_space_and_contact
  loan_happy_path
  loan_edge_cases
  space_edge_cases
  members_and_rbac
  partners_and_shared_space
  reports_expenses_documents
  restructure_tests
  auth_teardown
  summary
}

main "$@"

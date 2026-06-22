# 03-business-rules.md

# Loan Rules

Principal Amount > 0

Interest Rate >= 0

Tenure > 0

Contact Name Required

Loan Type Required

# Loan Status

DRAFT

ACTIVE

OVERDUE

CLOSED

# State Transitions

DRAFT -> ACTIVE

ACTIVE -> OVERDUE

ACTIVE -> CLOSED

OVERDUE -> CLOSED

# Payment Rules

Payment cannot exceed outstanding amount.

Payment updates outstanding amount immediately.

# Partial Payment

Example

EMI = 10000

Payment = 4000

Status = PARTIAL

Remaining = 6000

# Loan Closure

Loan can be closed when:

Outstanding = 0

OR

User selects settlement.

# Delete Loan

Deleting loan removes:

EMIs

Transactions

Activities

# Reports

Reports are generated from live data.

Never store report data.

# Draft Saving

Loan wizard autosaves after every step.

Draft stored in browser.

export const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  VIEWER: 'Viewer',
  FIELDMAN: 'Field Man',
};

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  OWNER: 'Full access, including managing billing, space visibility, deletion, and members.',
  ADMIN: 'Full read/write access to loans, contacts, transactions, expenses, and partners.',
  VIEWER: 'Read-only access to all modules, including reports and partner allocations.',
  FIELDMAN: 'Narrow access: view loans/contacts, record collections, and add field notes only.',
};

export const LOAN_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  CLOSED: 'Closed',
};

export const LOAN_DIRECTION_LABELS: Record<string, string> = {
  GIVEN: 'Lent (Given)',
  TAKEN: 'Borrowed (Taken)',
};

export const INTEREST_TYPE_LABELS: Record<string, string> = {
  NONE: 'Interest Free',
  FIXED: 'Fixed Interest',
  FLAT: 'Flat Rate',
  REDUCING_BALANCE: 'Reducing Balance',
  COMPOUND: 'Compound Interest',
  CUSTOM: 'Custom Interest',
};

export const REPAYMENT_TYPE_LABELS: Record<string, string> = {
  ONE_TIME: 'One-time Payment',
  EMI: 'EMI (Scheduled Installments)',
  INTEREST_ONLY: 'Interest Only',
  PRINCIPAL_ONLY: 'Principal Only',
  FLEXIBLE: 'Flexible / Anytime Repayment',
  CUSTOM_INSTALLMENTS: 'Custom Repayment Schedule',
};

export const FREQUENCY_LABELS: Record<string, string> = {
  WEEKLY: 'Weekly',
  BI_WEEKLY: 'Bi-weekly',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  YEARLY: 'Yearly',
};

export const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  PAYMENT_RECEIVED: 'Payment Received',
  PAYMENT_MADE: 'Payment Made',
  DISBURSEMENT: 'Disbursement',
  MANUAL_ADJUSTMENT: 'Manual Adjustment',
  INTEREST_ACCRUED: 'Interest Accrued',
  PENALTY_ACCRUED: 'Penalty Accrued',
  SETTLEMENT: 'Settlement',
  WRITE_OFF: 'Write Off',
};

export const SPACE_TYPE_LABELS: Record<string, string> = {
  PERSONAL: 'Personal',
  BUSINESS: 'Business',
};

export const SPACE_VISIBILITY_LABELS: Record<string, string> = {
  PRIVATE: 'Private',
  SHARED: 'Shared Partnership',
};

export const ADVANCE_PAYMENT_MODE_LABELS: Record<string, string> = {
  CARRY_FORWARD_CREDIT: 'Carry Forward Credit',
  RECALCULATE_SCHEDULE: 'Recalculate Schedule',
};

export const PENALTY_TYPE_LABELS: Record<string, string> = {
  NONE: 'No Penalty',
  FIXED: 'Fixed Penalty',
  PERCENTAGE: 'Percentage Penalty',
  EXTRA_INTEREST: 'Extra Interest rate',
};

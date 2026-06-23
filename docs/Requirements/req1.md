
# LoanBook - Product Vision & Master Requirements
 
## Product Overview
 
LoanBook is a personal loan management and tracking platform designed for individuals who regularly lend money to others or borrow money from others and want a structured system to manage these financial relationships.
 
The application serves as a personal source of truth for all lending and borrowing activities.
 
LoanBook does not facilitate lending transactions. It only records, tracks, calculates, organizes, and analyzes loans that exist in the real world.
 
The system should help users maintain complete visibility into:
 
* Loans given
* Loans taken
* Repayments
* Outstanding balances
* Interest earned
* Interest paid
* Due payments
* Overdue loans
* Loan-related expenses
* Financial reports
* Portfolio analytics
 
---
 
# Core Philosophy
 
Users should be able to answer the following questions immediately after opening the application:
 
* How much money have I lent?
* How much money have I borrowed?
* Who owes me money?
* Whom do I owe money?
* What repayments are due this week?
* What repayments are due this month?
* Which loans are overdue?
* How much interest have I earned?
* How much interest have I paid?
* What is my current net lending position?
* What is my expected future cash flow?
 
The product should prioritize clarity, simplicity, visibility, and financial control.
 
---
 
# Product Type
 
LoanBook is:
 
* Personal Loan Ledger
* Loan Portfolio Tracker
* Debt Management Tool
* Personal Lending CRM
* Financial Relationship Tracker
 
LoanBook is not:
 
* A bank loan management system
* A lending marketplace
* A peer-to-peer lending network
* A payment application
* An accounting ERP
* A collections platform
 
---
 
# User Model
 
The application is designed around a single owner of data.
 
The user manages their own loan portfolio.
 
Other people involved in loans are recorded as contacts only.
 
They do not log into the system.
 
They do not have accounts.
 
They do not interact directly with the application.
 
Examples:
 
* Friends
* Relatives
* Colleagues
* Business partners
* Customers
* Vendors
* Banks
* NBFCs
* Informal lenders
 
---
 
# Core Business Scenarios
 
## Scenario 1 - Loan Given
 
The user lends money to another person.
 
Example:
 
Rahul borrows ₹100,000.
 
The user records:
 
* Borrower information
* Principal amount
* Interest configuration
* Repayment schedule
* Notes and documents
 
The system tracks:
 
* Outstanding amount
* EMI schedule
* Payments received
* Overdue amounts
* Interest earned
 
---
 
## Scenario 2 - Loan Taken
 
The user borrows money from another person or institution.
 
Example:
 
The user borrows ₹50,000 from a friend.
 
The user records:
 
* Lender information
* Principal amount
* Interest configuration
* Repayment schedule
 
The system tracks:
 
* Outstanding balance
* Future liabilities
* Due payments
* Interest payable
 
---
 
## Scenario 3 - Ongoing Repayment Tracking
 
Payments may be:
 
* Full
* Partial
* Early
* Delayed
* Settlement based
 
The system should update all calculations automatically.
 
---
 
## Scenario 4 - Loan Closure
 
Loans can be closed through:
 
* Full repayment
* Settlement
* Manual closure
 
Historical records must remain accessible.
 
---
 
# Primary Modules
 
## Dashboard
 
Central financial overview.
 
Displays:
 
* Total money lent
* Total money borrowed
* Outstanding receivables
* Outstanding payables
* Interest earned
* Interest paid
* Active loans
* Overdue loans
* Upcoming payments
* Recent activity
 
---
 
## Loans
 
The core module.
 
Manages:
 
* Loan creation
* Loan editing
* Loan closure
* Repayment schedules
* Outstanding balances
* Interest calculations
* Loan history
 
Categories:
 
* All Loans
* Given Loans
* Taken Loans
* Active Loans
* Overdue Loans
* Closed Loans
 
---
 
## Contacts
 
Maintains information about all financial relationships.
 
Each contact may be:
 
* Borrower
* Lender
* Friend
* Relative
* Customer
* Vendor
* Bank
* NBFC
 
A contact may participate in multiple loans.
 
The system should provide complete history for every contact.
 
---
 
## Transactions
 
Records all money movement related to loans.
 
Examples:
 
* Payment received
* Payment made
* Interest received
* Interest paid
* Penalty received
* Penalty paid
* Manual adjustments
 
Transactions should automatically update balances and reports.
 
---
 
## Expenses
 
Tracks expenses incurred while managing loans.
 
Examples:
 
* Documentation costs
* Travel expenses
* Legal costs
* Collection costs
* Processing costs
* Miscellaneous expenses
 
Expenses may optionally be linked to loans.
 
---
 
## Reports
 
Provides structured financial reporting.
 
Reports should be generated dynamically from underlying data.
 
Examples:
 
### Receivable Report
 
Shows all money owed to the user.
 
### Payable Report
 
Shows all money the user owes.
 
### Interest Report
 
Shows:
 
* Interest earned
* Interest paid
 
### Overdue Report
 
Shows:
 
* Delayed payments
* Overdue loans
* Aging information
 
### Cash Flow Report
 
Shows:
 
* Historical inflows
* Historical outflows
* Future expected inflows
* Future expected outflows
 
---
 
## Analytics
 
Provides insights across the entire portfolio.
 
Examples:
 
* Net lending position
* Collection forecast
* Future liabilities
* Future receivables
* Top borrowers
* Top lenders
* Most profitable loans
* Most overdue loans
* Monthly lending trends
* Monthly borrowing trends
* Interest trends
 
---
 
## Settings
 
Application configuration.
 
Examples:
 
* Default interest rate
* Default repayment frequency
* Currency settings
* Backup
* Restore
* Import
* Export
 
---
 
# Loan Lifecycle
 
Loan creation should support:
 
* Given loans
* Taken loans
 
Each loan should support:
 
* Principal amount
* Interest configuration
* Tenure
* Repayment schedule
* Penalty rules
* Notes
* Documents
 
Possible states:
 
DRAFT
 
ACTIVE
 
OVERDUE
 
CLOSED
 
---
 
# Interest Models
 
The system should support multiple interest strategies.
 
### No Interest
 
Simple principal repayment.
 
### Flat Interest
 
Interest calculated on original principal.
 
### Reducing Balance Interest
 
Interest calculated on remaining balance.
 
### Custom Interest
 
Manual repayment schedules.
 
---
 
# Repayment Models
 
The system should support:
 
* Monthly EMI
* Weekly EMI
* Bi-weekly EMI
* Quarterly EMI
* One-time repayment
* Custom repayment schedules
 
---
 
# Payment Handling
 
The system should support:
 
* Full payments
* Partial payments
* Advance payments
* Missed payments
* Settlement payments
 
Outstanding balances should update automatically.
 
---
 
# Penalty Handling
 
Optional penalty rules.
 
Examples:
 
* Fixed penalties
* Percentage-based penalties
* Grace periods
 
The system should automatically calculate penalties when applicable.
 
---
 
# Timeline & Activity Tracking
 
Every important action should generate an activity record.
 
Examples:
 
* Loan created
* Loan updated
* Payment received
* Payment made
* EMI generated
* Loan closed
* Expense added
 
The activity timeline should provide a complete audit history.
 
---
 
# Documents
 
Loans and contacts should support attachments.
 
Examples:
 
* Agreements
* Identity documents
* Promissory notes
* Receipts
* Cheque images
* Supporting documents
 
Documents should remain attached to historical records.
 
---
 
# Search & Filtering
 
Users should be able to search and filter across:
 
* Contacts
* Loans
* Transactions
* Expenses
 
Filters should include:
 
* Status
* Date ranges
* Amount ranges
* Contact
* Loan type
 
---
 
# Financial Calculations
 
The system must provide:
 
* EMI calculations
* Interest calculations
* Outstanding calculations
* Penalty calculations
* Settlement calculations
* Collection forecasts
 
All calculations should be deterministic and transparent.
 
Users should always understand how values were derived.
 
---
 
# Data Ownership
 
Users own all data.
 
The application should support:
 
* Backup
* Restore
* Export
* Import
 
Data portability should be a first-class feature.
 
---
 
# Long-Term Vision
 
LoanBook should evolve into a comprehensive personal loan operating system.
 
The platform should become the user's complete financial relationship management tool for lending and borrowing activities while maintaining simplicity and clarity.
 
Success is achieved when a user can manage an entire personal lending and borrowing portfolio from a single application with complete visibility, accurate calculations, and actionable insights.
 
# 02-screen-manifest.md

# Dashboard

Route

/dashboard

Purpose

Provide quick financial overview.

Cards

* Money Given
* Money Taken
* Receivable
* Payable
* Interest Earned
* Interest Paid

Widgets

* Upcoming EMIs
* Overdue EMIs
* Recent Activity

---

# Loans List

Route

/loans

Components

Search Bar

Filters

Loan Table

Create Loan Button

Columns

Name

Type

Principal

Outstanding

Next EMI

Status

Actions

---

# Create Loan Wizard

Route

/loans/new

Step 1

Loan Type

Options

* Given Loan
* Taken Loan

Step 2

Contact Details

Fields

* Name
* Phone
* Email
* Notes

Step 3

Loan Details

Fields

* Principal
* Start Date
* Purpose

Step 4

Interest

Options

* No Interest
* Flat
* Reducing

Step 5

Repayment

Options

* Monthly
* Weekly
* One Time

Step 6

Review

Display summary

Step 7

Save

---

# Loan Details

Route

/loans/[id]

Header

Name

Status

Type

Tabs

Overview

Schedule

Transactions

Timeline

Overview

Show

Principal

Outstanding

Interest

Paid

Schedule

EMI table

Transactions

Transaction history

Timeline

Chronological activity list

---

# Transactions

Route

/transactions

Table

Date

Loan

Type

Amount

Mode

Actions

---

# Expenses

Route

/expenses

Table

Date

Category

Amount

Notes

---

# Reports

Route

/reports

Cards

Receivable

Payable

Interest Earned

Interest Paid

Overdue Loans

Charts

Cash Flow

Loan Distribution

---

# Settings

Route

/settings

Sections

Export Data

Import Data

Reset Data

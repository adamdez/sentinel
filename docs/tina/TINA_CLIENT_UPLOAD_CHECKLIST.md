# Tina Client Upload Checklist

Last updated: 2026-04-08

This is the exact file checklist Tina should ask a customer for when the goal is to prepare a CPA-ready small-business tax package.

This is not a Tina skills document.
It is the concrete intake package Tina should want from the customer.

Machine-readable source:

- [client-upload-schema.ts](/C:/Users/adamd/Desktop/Sentinel/src/tina/data/client-upload-schema.ts)

## Core Required Files

These are the default core files Tina should ask for in almost every business-tax file.

1. Prior-year filed return PDF
   - Best case: the full filed return PDF
   - Also acceptable for early review or testing: a structured prior-year return extract
2. Full-year profit and loss
3. General ledger export
4. Business bank statements
   - Statement PDFs are best, but Tina can also work from a bank statement extract

## Conditional Required Files

Ask for these only when the facts say they apply.

1. Payroll reports and W-2 support
When the business has payroll.

2. Contractor payments and 1099 support
When the business pays contractors.

3. Fixed asset and depreciation support
When the business bought equipment, furniture, vehicles, or other depreciable property.

4. Sales tax reports
When the business collects or remits sales tax.

5. Ending inventory support
When the business has inventory or cost-of-goods issues.

## Recommended Files

These are not always mandatory, but they make Tina stronger and save CPA review time.

1. Year-end balance sheet
2. Business credit card statements
   - Statement PDFs are best, but a credit card statement extract is acceptable for early review
3. Notes about unusual items
   - A memo is best, but a structured unusual-items note extract is acceptable
4. Entity and ownership documents
5. Year-end trial balance
6. Loan statements and debt support
   - Monthly statements are best, but Tina can also use a loan statement extract with beginning balance, payment, interest, principal, and ending balance
7. Short business description or NAICS note

## What Tina Wants Inside The Files

The best files include:

- exact dates
- exact dollar amounts
- clear account names
- vendor or customer names when available
- source document references
- full-year coverage
- CSV or XLSX exports when possible

The weakest files are:

- screenshots
- totals with no transaction detail
- partial-year statements
- unlabeled PDFs
- books with no date range
- mixed personal and business activity with no explanation

## Practical Customer Prompt

If Tina is asking a client in plain language, the short version should be:

1. Last year's filed tax return PDF
   or a structured prior-year return extract if that is what is available first
2. Your full-year P&L
3. A general ledger export
4. All business bank statements
   or a bank statement extract
5. Your year-end balance sheet if you have it
6. All business credit card statements if the business uses cards
7. Payroll reports if you have employees
8. Contractor or 1099 support if you use contractors
9. Asset or depreciation support if you bought equipment or vehicles
10. Loan statements if the business has debt
11. A short note about unusual items, owner draws, transfers, or personal charges in the books if any of those happened

## Why This Matters

This intake package helps Tina do three things honestly:

1. classify the return lane correctly
2. reconcile the numbers with real source support
3. hand a CPA a packet that does not require rebuilding the whole file from scratch

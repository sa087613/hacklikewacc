---
title: Time data feeds to Payroll and Benefits
type: doc
share_level: cross_team
topics: [time-integrations]
authors: [sam-okafor]
contains_personal_data: false
---

# Time data feeds

Owner: Sam Okafor

## To Payroll (PayCore)

Nightly preliminary file plus a final file at payroll cutoff. Hours are split by workweek into regular, overtime, and double time.

## To Benefits (BenHub)

One file per biweekly period with scheduled hours and overtime hours as biweekly totals per employee. BenHub does not receive per-workweek detail.

## Corrections

Timesheet edits after cutoff are sent in the next file as adjustments to the prior period.

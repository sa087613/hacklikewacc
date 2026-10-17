---
title: Payroll Engineering · Sprint 42 plan
type: doc
share_level: cross_team
topics: [eligibility-rules-engine]
authors: [raj-patel]
contains_personal_data: false
---

# Payroll Engineering · Sprint 42 plan

Sprint dates: Oct 13 – Oct 24, 2026 · Lead: Raj Patel

## Sprint goal

Start the eligibility rules engine and close out the exceptions dashboard bugs.

## Committed work

### 1. Eligibility rules engine (new)

PayCore needs to know which earnings and deductions an employee is eligible for before calculating pay, instead of trusting every election from upstream. This sprint we start an eligibility rules engine that evaluates employee eligibility from hours worked, employment status, and waiting periods.

- Define the rule format (JSON rules, evaluated per employee per period)
- Build evaluation for hours-based eligibility (average weekly hours)
- Wire the engine into the pre-deduction step behind a feature flag

Estimate: 13 points. Owner: Raj Patel.

### 2. Exceptions dashboard fixes

- Negative net pay exception shows the wrong period (3 points)
- Sorting by client name is broken (1 point)

### 3. Tax table update

- Load 2027 federal withholding tables in staging (2 points)

## Not committed

- Overtime calculator (see roadmap, Q1 2027)
- Pay statement redesign

## Risks

- Eligibility rules need input from someone who knows benefits waiting periods. We have not found a contact yet.

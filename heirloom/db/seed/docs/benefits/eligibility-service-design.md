---
title: Design doc · New eligibility service
type: doc
share_level: cross_team
topics: [eligibility-service, benefits-eligibility]
authors: [marcus-hill]
contains_personal_data: false
---

# Design doc · New eligibility service

Author: Marcus Hill · Date: Oct 10, 2026 · Status: In review · Reviewers: Priya Nair

## Problem

Eligibility logic lives inside BenHub's enrollment code. It is hard to test, and other systems cannot ask "is this employee eligible?" without going through enrollment.

## Proposal

Build a new eligibility service: a standalone service that evaluates employee eligibility for benefits from hours, employment status, and waiting periods, and exposes the result through an API.

## Scope

- Rule definitions stored as versioned JSON
- Hours-based eligibility (biweekly measurement, look-back periods)
- Waiting periods and stability periods
- An API: `GET /eligibility/{employee}/{period}`

## Timeline

Build starts this sprint (Oct 13). Target: pilot clients in January 2027.

## Open questions

- Should other teams (Payroll) call this service instead of keeping their own eligibility checks? Not discussed with Payroll yet.
- How do retroactive hours changes affect a decision that was already made? Unknown, needs follow-up.

## Alternatives considered

- Keep logic in BenHub: rejected, not reusable.
- Buy a vendor rules engine: rejected on cost.

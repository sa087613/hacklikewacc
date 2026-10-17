---
title: Design doc · ClockLine overtime calculator
type: doc
share_level: cross_team
topics: [overtime-calculator, overtime-pay]
authors: [sam-okafor]
contains_personal_data: false
---

# Design doc · ClockLine overtime calculator

Author: Sam Okafor · Status: Shipped (June 2026)

## Summary

ClockLine has a built-in overtime calculator. It computes weekly overtime, state daily overtime, and double time from raw punches, and it is in production for all clients as of June 2026.

## What it does

- Splits each workweek's hours into regular, overtime, and double time
- Applies state daily overtime rules (for example, over 8 hours in a day)
- Never pays daily and weekly overtime for the same hour
- Handles configurable workweek start days

## Interface

The calculator is exposed as an internal API: `POST /overtime/calculate` with raw punches for a workweek, returning the regular/overtime/double-time split. Any team can call it. Today only ClockLine's own export uses it.

## Tests

1,800 rule test cases covering all 50 states.

## Owner

Sam Okafor. Product: Chloe Reyes.

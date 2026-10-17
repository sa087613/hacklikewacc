---
title: Payroll Calculation Guide
type: doc
share_level: company
topics: [payroll-calculation, overtime-pay, tax-withholding]
authors: [maria-lopez, ana-torres]
contains_personal_data: false
---

# Payroll Calculation Guide

Owner: Ana Torres · Last reviewed: September 2026 · System: PayCore

This guide describes how PayCore turns approved hours and earnings into net pay. It covers the standard gross-to-net sequence only. Corrections to prior pay periods are handled separately and are not covered here.

## 1. Inputs

PayCore receives three inputs each pay period:

1. Approved hours from ClockLine (Time & Attendance), delivered as a nightly file and a final file at payroll cutoff.
2. Earnings and deduction elections from BenHub (Benefits).
3. Employee pay setup: pay rate, pay frequency, and tax profile.

## 2. Pay frequency

Most clients run biweekly payroll. Weekly and semimonthly schedules are supported. See the Pay Schedule Guide for cutoffs.

## 3. Regular earnings

Regular earnings equal regular hours multiplied by the base hourly rate. Salaried employees receive their period salary regardless of hours, unless they are non-exempt.

## 4. Gross pay

### 4.1 Earning types

Gross pay is the sum of regular earnings, overtime earnings, shift differentials, bonuses, and commissions for the period.

### 4.2 Overtime in gross pay

Overtime earnings are added to gross pay before any deductions are taken. Pre-tax benefit deductions are calculated on total gross pay, including overtime. Overtime premiums are calculated at 1.5 times the regular rate of pay for hours over 40 in a workweek, as defined in the Overtime Policy.

### 4.3 Regular rate

The regular rate includes non-discretionary bonuses and shift differentials. When a bonus covers several workweeks, PayCore allocates it across those weeks before computing the overtime premium.

## 5. Deductions

### 5.1 Order of deductions

1. Pre-tax deductions (medical, dental, vision premiums, HSA, FSA, pre-tax 401(k)).
2. Taxes, calculated on taxable wages after pre-tax deductions.
3. Post-tax deductions (Roth 401(k), voluntary life, garnishments).

### 5.2 Deduction amounts

Deduction amounts come from BenHub. PayCore does not decide whether an employee is eligible for a benefit; it applies the elections BenHub sends.

## 6. Taxes

See the Tax Withholding Guide for federal, state, and local withholding rules.

## 7. Net pay

Net pay equals gross pay minus all deductions and taxes. If net pay would be negative, PayCore stops the check and creates a payroll exception for review.

## 8. Exceptions

Payroll exceptions appear on the exceptions dashboard. Common exceptions: missing tax profile, negative net pay, hours over 80 in a single week, and missing pay rate. Exceptions must be cleared before payroll cutoff.

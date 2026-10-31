---
name: code-review
description: Perform a five-axis code review with P1-P4 severity and a PASS or CHANGES REQUIRED verdict.
---

# Code Review

## When to use

- A diff, branch, or PR is ready for review.
- Security or correctness must be assessed before merge.

## Procedure

1. Read the ticket and acceptance criteria to know intended behavior.
2. Review the diff across five axes: correctness, readability, architecture, security, performance.
3. For each finding assign a file:line and a severity:
   - P1 Blocker: correctness bugs, security flaws, data loss.
   - P2 Major: architectural violations, major perf issues, missing critical tests.
   - P3 Minor: readability, naming, small cleanup.
   - P4 Nitpick: style or alternative syntax.
4. Write findings grouped by severity with a concrete fix for P1/P2.
5. Compute the verdict: `PASS` only if no P1 or P2 exists; otherwise `CHANGES REQUIRED`.
6. Any P1 or P2 forces `CHANGES REQUIRED`.
7. Output a 1-5 scorecard per axis and a short summary.

## Checklist

- [ ] Every finding has file:line and severity.
- [ ] P1/P2 findings include a concrete fix.
- [ ] Verdict is `PASS` or `CHANGES REQUIRED`.
- [ ] P1 or P2 present implies `CHANGES REQUIRED`.
- [ ] Scorecard completed for all five axes.

## Evidence

- The review file at `.righthand/tickets/<TICKET>/reviews/<persona>.md`.
- Verdict and severity counts.

## Notes

- Findings without file:line are not actionable and should be dropped.
- A clean diff with no findings still needs a written `PASS` verdict.
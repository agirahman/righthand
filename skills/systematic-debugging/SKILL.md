---
name: systematic-debugging
description: Reproduce, isolate, fix the root cause, and re-verify; never silence errors or treat symptoms.
---

# Systematic Debugging

## When to use

- A test fails, a build breaks, or behavior is wrong.
- Root cause is unknown or a fix attempt failed.

## Procedure

1. Reproduce the issue with the smallest reliable steps and record them.
2. Capture the exact error output and exit code.
3. Isolate the cause: narrow by file, function, input, or environment.
4. Form one hypothesis and test it with a minimal change or command.
5. Fix the root cause, not the symptom; do not silence errors.
6. Re-run the reproduction and the full verification suite.
7. If two attempts fail, stop and re-plan with new evidence.

## Checklist

- [ ] Issue reproduced with recorded steps.
- [ ] Root cause identified, not just symptom.
- [ ] Fix addresses cause; no error suppression.
- [ ] Reproduction passes after fix.
- [ ] Verification suite re-run.

## Evidence

- Reproduction steps and original error output.
- The fix diff and post-fix verification output.

## Notes

- Suppressing an error (try/catch swallow) is not a fix.
- If the cause is environmental, document the required environment in the report.
- One change per hypothesis keeps the diff reviewable.
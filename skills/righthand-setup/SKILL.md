---
name: righthand-setup
description: "Provision RightHand before first use: set the harness and model per persona in .righthand/persona.json, then create the project folders."
---
# RightHand Setup

## When to use

- First use of RightHand in a project, a persona needs a particular harness or model, or `righthand doctor` reports a missing harness, invalid config, or missing folders.

## Procedure

1. Write `.righthand/persona.json` with one top-level key, `personas`; each entry takes `harness`, `model`, or `models` keyed by harness. Harnesses are `commandcode`, `pi`, `omp`, `opencode`; absent means commandcode, and `righthand setup <harness>` installs one.
2. Write the file as UTF-8 without a BOM; the CLI rejects a BOM as invalid JSON.
3. Run `righthand init` to create the eight `.righthand/` folders and append the `.gitignore` line.
4. Confirm each entry with `righthand config <persona>`, which prints persona, harness, model, and the source of each.

## Checklist

- [ ] Every configured harness is one of the four supported ids.
- [ ] `righthand config <persona>` prints the expected harness and model, and `righthand init` left the eight folders in place.

## Evidence

- The persona.json content and the `righthand config` line for each configured persona.

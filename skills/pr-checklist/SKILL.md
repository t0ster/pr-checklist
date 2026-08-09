---
name: pr-checklist
description: Review a PR or git scope with configurable anti-slop, custom-check, and change-boundary analysis.
---

# PR Checklist

Independently analyze changes and generate a report. Do not post or edit code unless explicitly requested.

## Scope

Default: current branch's GitHub PR. Explicit targets take precedence:

- `pr <number-or-url>`
- `branch <branch> [base <base>]`
- `range <base>..<head>` or `range <base>...<head>`
- `commit <sha>`, `staged`, or `working-tree`
- `self-check` (no review target)

Paths or natural-language focus/exclusions restrict the target.

PR uses GitHub's diff; branch uses `base...branch` (infer default base or ask); explicit ranges preserve supplied semantics; commit compares its parent; staged means index only; working-tree means its diff only. Without an explicit target or current PR, ask. Ignore untracked files in the review diff unless included or overlapping a staged file; mention overlaps. Configuration resolution is exempt.

Use GitHub only for PR identity, base/head, paths, and diff — not body, comments, reviews, checks, coverage, issues, or other metadata.

## Self-check

For `self-check`, read and follow [references/self-check.md](references/self-check.md), then stop. Do not enter the normal review workflow.

## Configuration

For normal reviews, before loading the diff, read and follow [references/configuration.md](references/configuration.md). Resolve `.pr-checklist.yml` from the target state and validate it with `scripts/parse-config.ts`. A missing file uses the defaults; an invalid file fails.

If configuration enables no analysis, print `PR checklist: nothing enabled to analyze.` and stop successfully.

## Workflow

1. Resolve target identity; use field-limited `gh pr view`.
2. Load, normalize, and validate configuration from the resolved target. Exit early when nothing is enabled.
3. Inspect the resolved diff, applicable instructions, and context at its head. Prefer `git show <head>:<path>`; use a temporary worktree for broad work, never an unrelated dirty checkout.
4. For staged scope, use `git show :<path>` or `git checkout-index`; exclude unstaged content. Working-tree scope uses the checkout.
5. Run useful local checks; independently derive and deduplicate findings.
6. Run only enabled analysis passes. For configured checks, pass the normalized items and verify that the result preserves their IDs, titles, and order.
7. Merge the exact normalized `plan`, enabled outputs, and `source`. Set disabled `antiSlop` and `changes` sections to `null`; set disabled or empty `checks` to `[]`. Validate against [`prChecklistSchema`](scripts/schema.ts), which enforces section enablement and configured check identity, title, and order.
8. In this skill directory, render to a unique temporary path:

```bash
TMP_ROOT="${TMPDIR:-/tmp}"
REPORT_DIR=$(mktemp -d "${TMP_ROOT%/}/pr-checklist.XXXXXX")
REPORT="$REPORT_DIR/pr-checklist.md"

if ! printf '%s' "$PR_CHECKLIST_JSON" | npx --yes deno@2.5.4 run \
    --allow-net=zenquotes.io \
    scripts/render.ts \
    > "$REPORT"
then
  rm -f "$REPORT"
  rmdir "$REPORT_DIR" 2>/dev/null || true
  exit 1
fi

printf '<pr_checklist>%s</pr_checklist>\n' "$REPORT"
```

JSON enters stdin; Markdown exits stdout. Report the path; change destination only when requested.

## Analysis

### Anti-slop

When enabled, read and follow [references/anti-slop-review.md](references/anti-slop-review.md). When subagents or task delegation are available, use that prompt as an independent delegated pass. Verify its result and score.

Use engineering judgment when verifying the score against the findings.

### Configured checks

When enabled with non-empty items, read and follow [references/configured-checks-review.md](references/configured-checks-review.md). When subagents or task delegation are available, use that prompt as an independent delegated pass. Verify every configured item is represented exactly once.

### Changes

When enabled, read and follow [references/changes-review.md](references/changes-review.md). When subagents or task delegation are available, use that prompt as an independent delegated pass. Verify its results.

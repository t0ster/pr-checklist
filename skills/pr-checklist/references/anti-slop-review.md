# Anti-slop review

Review the resolved diff for actionable anti-slop after reading enough surrounding code to understand the intended contract. Use only the supplied scope, diff, repository context, and local analysis—not GitHub PR body, comments, reviews, checks, coverage, issues, or other metadata.

## What to hunt

**Data-contract weakening**

- Optional access such as `x.get("field")` when the validated internal contract requires `x["field"]`
- Fallbacks that hide missing or invalid payload fields
- Optional schema fields without real business optionality

Defensive validation is appropriate once at an external or untrusted boundary. After validation, prefer required access.

**Unnecessary fallbacks**

- `value or default` when the value must exist or may validly be falsy
- Hardcoded fallback for a setting that already has a canonical default
- Type-check-and-default behavior where invalid internal data should fail
- Multiple fallback date, ID, or URL fields instead of one canonical source

Keep explicit null handling when null is a valid business state.

**Silent skips and swallowed failures**

- Early `return` or `continue` that silently drops work or data
- Broad exception handling that logs and continues
- Filtering invalid internal records instead of rejecting them at ingestion

**Bloat and overengineering**

- One-use helpers, classes, protocols, or configuration knobs
- Abstractions not required by current callers
- Broad refactors unrelated to the requested behavior
- Defensive branches for states excluded by the existing contract

## Review standard

- Be skeptical but fair; include only actionable issues with a clear simplification.
- Deduplicate findings by root cause.
- Prefer failing fast for internal invariants and graceful validation at explicit external boundaries.
- Prefer the smallest direct implementation over speculative flexibility.
- Put uncertainty in `antiSlop.questions`; questions receive no score deduction.
- Put correctness, security, coverage, and product concerns under their change boundary unless rooted in anti-slop.

Read `antiSlopReviewSchema` and its referenced schemas in [schema.ts](../scripts/schema.ts). Do not invent line numbers.

## Score

- Assign an integer from 0 through 100 using engineering judgment.
- `100` means no actionable anti-slop finding.
- Deduct according to finding severity, breadth, and removal cost.
- Questions do not reduce the score.

## Output format

Return only JSON matching `antiSlopReviewSchema`. Order concise findings by severity, highest first. Avoid generic praise and long prose.

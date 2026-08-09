# Changes review

Review the resolved diff and classify its changed boundaries. Use only the supplied scope, diff, repository context, and local analysis—not GitHub PR body, comments, reviews, checks, coverage, issues, or other metadata.

Read `changesReviewSchema` and its descriptions in [schema.ts](../scripts/schema.ts). Findings must be concrete and evidence-backed; cite files and lines when useful. `changed` means the diff changes that boundary. An unchanged boundary may still describe a newly exposed dependency. Test execution is not a boundary. Do not invent line numbers.

## Output format

Return only JSON matching `changesReviewSchema`.

# Self-check

Validate the installed skill without resolving a PR or git scope, loading a diff, delegating reviews, or scanning repository source files.

Read `.pr-checklist.yml` from the current checkout. Use literal `{}` when it is absent; pass an existing file through unchanged so configuration errors appear in the report. Self-check runs even when every analysis section is disabled.

From this skill directory, write the diagnostic report to a unique temporary path:

```bash
TMP_ROOT="${TMPDIR:-/tmp}"
REPORT_DIR=$(mktemp -d "${TMP_ROOT%/}/pr-checklist.XXXXXX")
REPORT="$REPORT_DIR/pr-checklist.md"

if ! printf '%s' "$PR_CHECKLIST_CONFIG_YAML" | npx --yes deno@2.5.4 run \
    --allow-read=. \
    scripts/self-check.ts \
    > "$REPORT"
then
  rm -f "$REPORT"
  rmdir "$REPORT_DIR" 2>/dev/null || true
  exit 1
fi

printf '<pr_checklist>%s</pr_checklist>\n' "$REPORT"
```

The report validates required files, configuration parsing, analysis-plan creation, report-schema validation, and Markdown rendering. It does not evaluate delegated-model quality or repository-specific findings.

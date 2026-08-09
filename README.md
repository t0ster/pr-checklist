<img width="844" height="554" src="https://github.com/user-attachments/assets/59351b7a-f2f4-42b5-8f92-e199d7d16682" />

## How to set it up on GitHub CI

### 1. Copy the workflow

Copy [`.github/workflows/pr-checklist.yml`](.github/workflows/pr-checklist.yml)
to the same path in your repository.

Change the target branch at the top if your default branch is not `master`.

### 2. Create the GitHub environment

Replace `OWNER/REPOSITORY` below:

```bash
gh api --method PUT \
  "repos/OWNER/REPOSITORY/environments/codex-auth" \
  --input /dev/null
```

GitHub calls this a deployment environment, but nothing is deployed.

### 3. Add the credential-writer token

Create a
[fine-grained PAT](https://github.com/settings/personal-access-tokens/new):

- Repository access: only the target repository
- Permission: **Environments — Read and write**

Store it as an environment secret:

```bash
gh secret set CODEX_AUTH_WRITER_PAT \
  --repo OWNER/REPOSITORY \
  --env codex-auth
```

Paste the PAT when prompted.

### 4. Sign in to Codex

Use a separate login directory for each repository:

```bash
install -d -m 700 "$HOME/.codex-ci/OWNER-REPOSITORY"

CODEX_HOME="$HOME/.codex-ci/OWNER-REPOSITORY" \
  npx --yes @openai/codex@0.147.0 login --device-auth
```

Open the displayed URL and enter the one-time code.

> Use a separate Codex login for each repository to avoid refresh-token races.

### 5. Upload the Codex credential

```bash
gh secret set CODEX_AUTH_JSON \
  --repo OWNER/REPOSITORY \
  --env codex-auth \
  < "$HOME/.codex-ci/OWNER-REPOSITORY/auth.json"
```

Confirm both secrets exist:

```bash
gh secret list --repo OWNER/REPOSITORY --env codex-auth
```

Expected:

```text
CODEX_AUTH_JSON
CODEX_AUTH_WRITER_PAT
```

### 6. Test it

```bash
actionlint .github/workflows/pr-checklist.yml
```

Push the workflow and open a same-repository, non-draft pull request.

A successful run will analyze the exact PR head, run delegated checks, post a
new comment, and safely persist refreshed OAuth credentials.

## How to configure the checklist

Configuration is optional. Add `.pr-checklist.yml` to the repository root to
enable custom checks or disable built-in sections.

```yaml
sections:
  anti_slop:
    enabled: true

  checks:
    items:
      - id: safe-migrations
        title: Safe migrations
        applies_when: Database migrations are changed.
        instructions: |
          Verify migrations are safe to roll out and roll back.

  changes:
    enabled: true
```

Anti-slop and change detection are enabled by default. Custom checks need an
`id`, `title`, and `instructions`; `applies_when` is optional.

See the [configuration reference](skills/pr-checklist/references/configuration.md)
for the full schema.

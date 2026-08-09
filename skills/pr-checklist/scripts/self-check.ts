import {
  createAnalysisPlan,
  parseConfig,
} from "./parse-config.ts"
import { renderMarkdown } from "./render.ts"
import {
  type AnalysisPlan,
  prChecklistSchema,
} from "./schema.ts"

type Diagnostic = {
  label: string
  passed: boolean
  detail?: string
}

const requiredFiles = [
  new URL("../SKILL.md", import.meta.url),
  new URL("../references/anti-slop-review.md", import.meta.url),
  new URL("../references/changes-review.md", import.meta.url),
  new URL("../references/configuration.md", import.meta.url),
  new URL("../references/configured-checks-review.md", import.meta.url),
  new URL("../references/self-check.md", import.meta.url),
]

function oneLine(value: string): string {
  return value.replaceAll(/\s+/g, " ").trim()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function inspectRequiredFiles(): Promise<Diagnostic> {
  const missing: string[] = []

  for (const file of requiredFiles) {
    try {
      const info = await Deno.stat(file)
      if (!info.isFile) {
        missing.push(file.pathname)
      }
    } catch (error) {
      missing.push(`${file.pathname}: ${errorMessage(error)}`)
    }
  }

  return missing.length === 0
    ? { label: "Skill files available", passed: true }
    : {
      label: "Skill files available",
      passed: false,
      detail: missing.join("; "),
    }
}

function validateRenderer(): {
  schema: Diagnostic
  renderer: Diagnostic
} {
  const check = {
    id: "self-check",
    title: "Configured check",
    instructions: "Validate configured-check rendering.",
  }
  const unchanged = (text: string) => ({
    changed: false,
    findings: [{ text, locations: [] }],
  })
  const synthetic = prChecklistSchema.safeParse({
    plan: { antiSlop: true, checks: [check], changes: true },
    source: null,
    antiSlop: {
      score: 100,
      findings: [],
      questions: [],
    },
    checks: [{
      id: check.id,
      title: check.title,
      findings: [],
    }],
    changes: {
      backendApiContract: unchanged("No backend API contract changes."),
      databaseSchema: unchanged("No database schema changes."),
      workerTaskContract: unchanged("No worker task contract changes."),
      externalIntegrationContract: unchanged(
        "No external integration contract changes.",
      ),
      deploymentConfiguration: unchanged(
        "No deployment configuration changes.",
      ),
      frontendRoutes: unchanged("No frontend route changes."),
    },
  })

  if (!synthetic.success) {
    return {
      schema: {
        label: "Report schema valid",
        passed: false,
        detail: synthetic.error.message,
      },
      renderer: {
        label: "Renderer working",
        passed: false,
        detail: "Skipped because the synthetic report was invalid.",
      },
    }
  }

  try {
    const markdown = renderMarkdown(synthetic.data)
    const passed = markdown.includes("# 📋 PR Checklist") &&
      markdown.includes("Anti-slop score") &&
      markdown.includes(check.title) &&
      markdown.includes("Backend API Contract")
    return {
      schema: { label: "Report schema valid", passed: true },
      renderer: {
        label: "Renderer working",
        passed,
        ...(passed ? {} : { detail: "Expected report sections were absent." }),
      },
    }
  } catch (error) {
    return {
      schema: { label: "Report schema valid", passed: true },
      renderer: {
        label: "Renderer working",
        passed: false,
        detail: errorMessage(error),
      },
    }
  }
}

function renderDiagnostic(diagnostic: Diagnostic): string[] {
  const icon = diagnostic.passed ? "✅" : "❌"
  const lines = [`- ${icon} ${diagnostic.label}`]
  if (!diagnostic.passed && diagnostic.detail !== undefined) {
    lines.push(`  - ${oneLine(diagnostic.detail)}`)
  }
  return lines
}

function activeConfiguration(plan: AnalysisPlan | null): string[] {
  if (plan === null) {
    return ["- Unavailable because configuration is invalid."]
  }
  return [
    `- Anti-slop: ${plan.antiSlop ? "enabled" : "disabled"}`,
    `- Configured checks: ${plan.checks.length}`,
    `- Changes: ${plan.changes ? "enabled" : "disabled"}`,
  ]
}

export async function selfCheck(configYaml: string): Promise<string> {
  const files = await inspectRequiredFiles()
  let plan: AnalysisPlan | null = null
  let configuration: Diagnostic

  try {
    plan = createAnalysisPlan(parseConfig(configYaml))
    configuration = { label: "Configuration valid", passed: true }
  } catch (error) {
    configuration = {
      label: "Configuration valid",
      passed: false,
      detail: errorMessage(error),
    }
  }

  const planning: Diagnostic = plan === null
    ? {
      label: "Analysis plan built",
      passed: false,
      detail: "Skipped because configuration is invalid.",
    }
    : { label: "Analysis plan built", passed: true }
  const rendering = validateRenderer()
  const diagnostics = [
    files,
    configuration,
    planning,
    rendering.schema,
    rendering.renderer,
  ]

  return [
    "# 📋 PR Checklist self-check",
    "",
    "> No repository changes were analyzed.",
    "",
    "## Diagnostics",
    "",
    ...diagnostics.flatMap(renderDiagnostic),
    "",
    "## Active configuration",
    "",
    ...activeConfiguration(plan),
    "",
    "## Limitations",
    "",
    "- Delegated-model review quality and repository-specific findings are not tested.",
  ].join("\n")
}

async function main(): Promise<void> {
  const configYaml = await new Response(Deno.stdin.readable).text()
  console.log(await selfCheck(configYaml))
}

if (import.meta.main) {
  try {
    await main()
  } catch (error) {
    console.error(errorMessage(error))
    Deno.exit(1)
  }
}

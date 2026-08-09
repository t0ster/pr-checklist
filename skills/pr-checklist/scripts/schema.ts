import { z } from "npm:zod@4.1.12"

const textSchema = z.string().trim().min(1)
const singleLineTextSchema = textSchema.refine(
  (value) => !/[\r\n]/.test(value),
  "Must be a single line",
)
const checkIdSchema = z.string().trim().regex(
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  "Must contain lowercase letters, numbers, and single hyphens only",
)

export const configuredCheckDefinitionSchema = z.object({
  id: checkIdSchema,
  title: singleLineTextSchema,
  applies_when: textSchema.optional(),
  instructions: textSchema,
}).strict()

const configuredCheckDefinitionsSchema = z.array(
  configuredCheckDefinitionSchema,
).superRefine((checks, context) => {
  const seen = new Set<string>()
  checks.forEach((check, index) => {
    if (seen.has(check.id)) {
      context.addIssue({
        code: "custom",
        message: `Duplicate check id: ${check.id}`,
        path: [index, "id"],
      })
    }
    seen.add(check.id)
  })
})

const enabledSectionConfigSchema = z.object({
  enabled: z.boolean().default(true),
}).strict()

const checksSectionConfigSchema = z.object({
  enabled: z.boolean().optional(),
  items: configuredCheckDefinitionsSchema.default([]),
}).strict()

const sectionsConfigSchema = z.object({
  anti_slop: enabledSectionConfigSchema.default({ enabled: true }),
  checks: checksSectionConfigSchema.default({ items: [] }),
  changes: enabledSectionConfigSchema.default({ enabled: true }),
}).strict()

export const prChecklistConfigSchema = z.object({
  sections: sectionsConfigSchema.default({
    anti_slop: { enabled: true },
    checks: { items: [] },
    changes: { enabled: true },
  }),
}).strict()

export const analysisPlanSchema = z.object({
  antiSlop: z.boolean(),
  checks: configuredCheckDefinitionsSchema,
  changes: z.boolean(),
}).strict()

export type AnalysisPlan = z.infer<typeof analysisPlanSchema>
export type ConfiguredCheckDefinition = z.infer<
  typeof configuredCheckDefinitionSchema
>
export type PrChecklistConfig = z.infer<typeof prChecklistConfigSchema>

export const locationSchema = z.object({
  path: z.string().trim().min(1).refine(
    (path) => !path.startsWith("/") && !path.split("/").includes(".."),
    "Must be a repository-relative path",
  ),
  line: z.number().int().positive(),
  endLine: z.number().int().positive().optional(),
  target: z.enum(["DIFF_LEFT", "DIFF_RIGHT", "BASE", "HEAD"]).describe(
    "Use DIFF_LEFT or DIFF_RIGHT only when the cited line appears on that side of the resolved patch; use BASE or HEAD for surrounding code",
  ),
}).strict().refine(
  (location) => location.endLine === undefined || location.endLine >= location.line,
  {
    message: "Must be greater than or equal to line",
    path: ["endLine"],
  },
)

const reportItemShape = {
  text: textSchema,
  locations: z.array(locationSchema),
}

export const reportItemSchema = z.object(reportItemShape).strict()

export const antiSlopFindingSchema = z.object({
  ...reportItemShape,
  severity: z.enum(["High", "Medium", "Low"]),
}).strict()

export const githubSourceSchema = z.object({
  repositoryUrl: z.url().describe(
    "Normalized https://github.com/<owner>/<repo> URL without .git",
  ),
  headRevision: z.string().trim().min(1).describe(
    "Resolved commit reviewed on the diff's head side",
  ),
  baseRevision: z.string().trim().min(1).optional().describe(
    "Resolved commit reviewed on the diff's base side",
  ),
  pullRequestUrl: z.url().optional().describe(
    "Canonical GitHub PR URL; omit for non-PR scopes",
  ),
}).strict()

export const changeSchema = z.object({
  changed: z.boolean(),
  findings: z.array(reportItemSchema).min(1),
}).strict()

export const changesSchema = z.object({
  backendApiContract: changeSchema.describe(
    "Whether backend routes, request or response models, status codes, or API behavior changed",
  ),
  databaseSchema: changeSchema.describe(
    "Whether database tables, columns, indexes, constraints, or relationships changed",
  ),
  workerTaskContract: changeSchema.describe(
    "Whether worker task names, payloads, queue routing, retries, or scheduling changed",
  ),
  externalIntegrationContract: changeSchema.describe(
    "Whether an external integration API, webhook, payload, or protocol changed",
  ),
  deploymentConfiguration: changeSchema.describe(
    "Whether environment variables, containers, infrastructure, or runtime configuration changed",
  ),
  frontendRoutes: changeSchema.describe(
    "Whether frontend paths, route parameters, query contracts, guards, or navigation changed",
  ),
}).strict()

export const changesReviewSchema = z.object({
  changes: changesSchema,
}).strict()

export const antiSlopSchema = z.object({
  score: z.number().int().min(0).max(100),
  findings: z.array(antiSlopFindingSchema),
  questions: z.array(reportItemSchema),
}).strict()

export const antiSlopReviewSchema = z.object({
  antiSlop: antiSlopSchema,
}).strict()

export const configuredCheckResultSchema = z.object({
  id: checkIdSchema,
  title: singleLineTextSchema,
  findings: z.array(reportItemSchema),
}).strict()

const configuredCheckResultsSchema = z.array(
  configuredCheckResultSchema,
).superRefine((checks, context) => {
  const seen = new Set<string>()
  checks.forEach((check, index) => {
    if (seen.has(check.id)) {
      context.addIssue({
        code: "custom",
        message: `Duplicate check result id: ${check.id}`,
        path: [index, "id"],
      })
    }
    seen.add(check.id)
  })
})

export const configuredChecksReviewSchema = z.object({
  checks: configuredCheckResultsSchema,
}).strict()

export const prChecklistSchema = z.object({
  plan: analysisPlanSchema,
  source: githubSourceSchema.nullable().describe(
    "Use null for staged, working-tree, and non-GitHub scopes; for PRs populate the repository URL, PR URL, and resolved diff commits",
  ),
  antiSlop: antiSlopSchema.nullable().describe(
    "Use null when the anti-slop section is disabled",
  ),
  checks: configuredCheckResultsSchema,
  changes: changesSchema.nullable().describe(
    "Use null when the changes section is disabled",
  ),
}).strict().superRefine((report, context) => {
  if (
    !report.plan.antiSlop &&
    report.plan.checks.length === 0 &&
    !report.plan.changes
  ) {
    context.addIssue({
      code: "custom",
      message: "At least one analysis section must be enabled",
      path: ["plan"],
    })
  }

  if (report.plan.antiSlop !== (report.antiSlop !== null)) {
    context.addIssue({
      code: "custom",
      message: report.plan.antiSlop
        ? "Required by the analysis plan"
        : "Must be null when disabled",
      path: ["antiSlop"],
    })
  }

  if (report.plan.changes !== (report.changes !== null)) {
    context.addIssue({
      code: "custom",
      message: report.plan.changes
        ? "Required by the analysis plan"
        : "Must be null when disabled",
      path: ["changes"],
    })
  }

  if (report.checks.length !== report.plan.checks.length) {
    context.addIssue({
      code: "custom",
      message: "Must contain one result per configured check",
      path: ["checks"],
    })
  }

  report.plan.checks.forEach((definition, index) => {
    const result = report.checks[index]
    if (result === undefined) {
      return
    }
    if (result.id !== definition.id) {
      context.addIssue({
        code: "custom",
        message: `Must match configured check id: ${definition.id}`,
        path: ["checks", index, "id"],
      })
    }
    if (result.title !== definition.title) {
      context.addIssue({
        code: "custom",
        message: `Must match configured check title: ${definition.title}`,
        path: ["checks", index, "title"],
      })
    }
  })
})

export type AntiSlopFinding = z.infer<typeof antiSlopFindingSchema>
export type AntiSlop = z.infer<typeof antiSlopSchema>
export type Change = z.infer<typeof changeSchema>
export type ConfiguredCheckResult = z.infer<typeof configuredCheckResultSchema>
export type GithubSource = z.infer<typeof githubSourceSchema>
export type Location = z.infer<typeof locationSchema>
export type PrChecklist = z.infer<typeof prChecklistSchema>
export type ReportItem = z.infer<typeof reportItemSchema>
export type RenderableItem = AntiSlopFinding | ReportItem

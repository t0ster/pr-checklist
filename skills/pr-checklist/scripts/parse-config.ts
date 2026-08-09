import { parse } from "jsr:@std/yaml@1.2.0"

import {
  type AnalysisPlan,
  type PrChecklistConfig,
  prChecklistConfigSchema,
} from "./schema.ts"

function formatPath(path: PropertyKey[]): string {
  return path.length > 0 ? path.map(String).join(".") : "<root>"
}

export function parseConfig(input: string): PrChecklistConfig {
  if (input.trim().length === 0) {
    throw new Error(".pr-checklist.yml is empty")
  }

  let document: unknown
  try {
    document = parse(input)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Invalid .pr-checklist.yml:\n${message}`)
  }

  const result = prChecklistConfigSchema.safeParse(document)
  if (!result.success) {
    const details = result.error.issues.map((issue) =>
      `- ${formatPath(issue.path)}: ${issue.message}`
    ).join("\n")
    throw new Error(`Invalid .pr-checklist.yml:\n${details}`)
  }

  return result.data
}

export function createAnalysisPlan(config: PrChecklistConfig): AnalysisPlan {
  const { anti_slop, checks, changes } = config.sections
  return {
    antiSlop: anti_slop.enabled,
    checks: checks.enabled === false ? [] : checks.items,
    changes: changes.enabled,
  }
}

async function main(): Promise<void> {
  const input = await new Response(Deno.stdin.readable).text()
  console.log(JSON.stringify(createAnalysisPlan(parseConfig(input))))
}

if (import.meta.main) {
  try {
    await main()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    Deno.exit(1)
  }
}

import { createHash } from "node:crypto"

import { z } from "npm:zod@4.1.12"

import {
  type AntiSlop,
  type Change,
  type ConfiguredCheckResult,
  type GithubSource,
  type Location,
  type PrChecklist,
  prChecklistSchema,
  type RenderableItem,
} from "./schema.ts"

const quoteSchema = z.array(z.object({
  q: z.string().trim().min(1),
  a: z.string().trim().min(1),
})).min(1)

const QUOTE_TIMEOUT_MS = 3_000

const changeBoundaries: ReadonlyArray<{
  key: keyof NonNullable<PrChecklist["changes"]>
  title: string
}> = [
  { key: "backendApiContract", title: "Backend API Contract" },
  { key: "databaseSchema", title: "Database Schema" },
  { key: "workerTaskContract", title: "Worker Task Contract" },
  { key: "externalIntegrationContract", title: "External Integration Contract" },
  { key: "deploymentConfiguration", title: "Deployment Configuration" },
  { key: "frontendRoutes", title: "Frontend Routes" },
]

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "")
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

function encodeRepositoryPath(path: string): string {
  return path.split("/").map(encodePathSegment).join("/")
}

function escapeMarkdownLabel(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]")
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function locationLabel(location: Location): string {
  const lines = location.endLine === undefined
    ? `${location.line}`
    : `${location.line}-${location.endLine}`
  return `${location.path}:${lines}`
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function locationLink(
  location: Location,
  source: GithubSource | null,
): string {
  const label = locationLabel(location)
  if (source === null) {
    return `\`${label.replaceAll("`", "\\`")}\``
  }

  let href: string
  const isDiffTarget = location.target === "DIFF_LEFT" ||
    location.target === "DIFF_RIGHT"
  if (source.pullRequestUrl !== undefined && isDiffTarget) {
    const pathHash = sha256(location.path)
    const side = location.target === "DIFF_LEFT" ? "L" : "R"
    const endAnchor = location.endLine === undefined
      ? ""
      : `-${side}${location.endLine}`
    href = `${
      withoutTrailingSlash(source.pullRequestUrl)
    }/files#diff-${pathHash}${side}${location.line}${endAnchor}`
  } else {
    const usesBase = location.target === "BASE" ||
      location.target === "DIFF_LEFT"
    let revision = source.headRevision
    if (usesBase) {
      const baseRevision = source.baseRevision
      if (baseRevision === undefined) {
        return `\`${label.replaceAll("`", "\\`")}\``
      }
      revision = baseRevision
    }
    const endAnchor = location.endLine === undefined
      ? ""
      : `-L${location.endLine}`
    href = `${
      withoutTrailingSlash(source.repositoryUrl)
    }/blob/${encodeURIComponent(revision)}/${
      encodeRepositoryPath(location.path)
    }#L${location.line}${endAnchor}`
  }

  return `[${escapeMarkdownLabel(label)}](${href})`
}

function renderItem(
  item: RenderableItem,
  source: GithubSource | null,
): string {
  const prefixes: string[] = []
  if ("severity" in item) {
    prefixes.push(`**${item.severity}**`)
  }
  if (item.locations.length > 0) {
    const locations = item.locations.map((location) => locationLink(location, source))
    prefixes.push(locations.join(", "))
  }
  prefixes.push(item.text)
  return prefixes.join(" — ")
}

function bullets(
  findings: readonly RenderableItem[],
  source: GithubSource | null,
): string {
  const rendered = findings.map((finding) => renderItem(finding, source))
  return rendered.map((finding) => `- ${finding}`).join("\n")
}

function scoreStatus(score: number): { circle: string; block: string } {
  if (score >= 70) {
    return { circle: "🟢", block: "🟩" }
  }
  if (score >= 40) {
    return { circle: "🟡", block: "🟨" }
  }
  return { circle: "🔴", block: "🟥" }
}

function antiSlopSection(
  antiSlop: AntiSlop,
  source: GithubSource | null,
): string {
  const totalBlocks = 20
  const filledBlocks = Math.round(antiSlop.score / 5)
  const status = scoreStatus(antiSlop.score)
  const bar = status.block.repeat(filledBlocks) + "⬜".repeat(totalBlocks - filledBlocks)
  const renderedFindings = antiSlop.findings.length > 0
    ? bullets(antiSlop.findings, source)
    : "- No anti-slop findings in requested scope."
  const renderedQuestions = antiSlop.questions.length > 0
    ? `\n\n**Questions**\n\n${bullets(antiSlop.questions, source)}`
    : ""

  return `<details>
<summary>${status.circle} <strong>Anti-slop score</strong> ${bar} <strong>${antiSlop.score}/100</strong></summary>

${renderedFindings}${renderedQuestions}

</details>`
}

function configuredCheckSection(
  check: ConfiguredCheckResult,
  source: GithubSource | null,
): string {
  const circle = check.findings.length > 0 ? "🔴" : "🟢"
  const renderedFindings = check.findings.length > 0
    ? bullets(check.findings, source)
    : "- No findings in requested scope."

  return `<details>
<summary>${circle} <strong>${escapeHtml(check.title)}</strong></summary>

${renderedFindings}

</details>`
}

function changeSection(
  title: string,
  change: Change,
  source: GithubSource | null,
): string {
  const circle = change.changed ? "🔴" : "🟢"
  const state = change.changed ? "Changed" : "Unchanged"

  return `<details>
<summary>${circle} <strong>${title} — ${state}</strong></summary>

${bullets(change.findings, source)}

</details>`
}

function oneLine(value: string): string {
  return value.replaceAll(/\s+/g, " ").trim()
}

async function randomQuote(): Promise<{ quote: string; author: string } | null> {
  try {
    const response = await fetch("https://zenquotes.io/api/random", {
      signal: AbortSignal.timeout(QUOTE_TIMEOUT_MS),
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const [result] = quoteSchema.parse(await response.json())
    return {
      quote: oneLine(result.q),
      author: oneLine(result.a),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`ZenQuotes quote unavailable: ${message}`)
    return null
  }
}

export function renderMarkdown(
  report: PrChecklist,
  quote: { quote: string; author: string } | null = null,
): string {
  const antiSlopSections = report.antiSlop === null
    ? []
    : [antiSlopSection(report.antiSlop, report.source)]
  const checkSections = report.checks.map((check) =>
    configuredCheckSection(check, report.source)
  )
  const changes = report.changes
  const changeSections = changes === null
    ? []
    : changeBoundaries.map(({ key, title }) =>
      changeSection(title, changes[key], report.source)
    )
  const reportSections = [
    ...antiSlopSections,
    ...checkSections,
    ...changeSections,
  ]

  return [
    "# 📋 PR Checklist",
    "",
    ...reportSections.flatMap((section) => [section, ""]),
    ...(quote ? ["---", "", `> “${quote.quote}” — **${quote.author}**`] : []),
  ].join("\n")
}

async function main(): Promise<void> {
  const rawInput = await new Response(Deno.stdin.readable).text()
  let input: unknown

  try {
    input = JSON.parse(rawInput)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`stdin does not contain valid JSON: ${message}`)
  }

  const result = prChecklistSchema.safeParse(input)
  if (!result.success) {
    for (const issue of result.error.issues) {
      console.error(`- ${issue.path.join(".") || "<root>"}: ${issue.message}`)
    }
    Deno.exit(1)
  }

  const quote = await randomQuote()
  console.log(renderMarkdown(result.data, quote))
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

import type { AgentConfig } from "@opencode-ai/sdk"
import type { AgentMode, AgentPromptMetadata } from "./types"
import type { CustomAgentConfig } from "../config/schema"
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs"
import { dirname, resolve } from "path"
import { homedir } from "os"

const MODE: AgentMode = "primary"

export const DAEDALUS_PROMPT_METADATA: AgentPromptMetadata = {
  category: "utility",
  cost: "EXPENSIVE",
  promptAlias: "Daedalus",
  triggers: [
    { domain: "Infrastructure operations", trigger: "Terraform, Docker, Helm, CI/CD, cloud infrastructure changes" },
    { domain: "Incident response", trigger: "Service outages, monitoring alerts, infrastructure issues" },
    { domain: "Infrastructure analysis", trigger: "Infrastructure status, capacity planning, cost analysis" },
  ],
  useWhen: [
    "Terraform/OpenTofu operations (plan, apply, destroy)",
    "Docker image building and deployment",
    "Helm chart management",
    "CI/CD pipeline management (GitHub Actions)",
    "Infrastructure incident response and analysis",
    "Monitoring data analysis (Datadog, OpenSearch)",
    "Cloud infrastructure management (AWS)",
  ],
  avoidWhen: [
    "Pure code implementation (use coding agents)",
    "Git operations (delegate to git-owner)",
    "kubectl operations (delegate to k8s-owner)",
    "Frontend/UI changes",
  ],
}

function resolvePath(filePath: string): string {
  if (filePath.startsWith("~/") || filePath.startsWith("~\\")) {
    return resolve(homedir(), filePath.slice(2))
  }
  return resolve(filePath)
}

function safeReadFile(filePath: string): string | undefined {
  const resolved = resolvePath(filePath)
  if (!existsSync(resolved)) return undefined
  return readFileSync(resolved, "utf-8")
}

function initializeDecisionsFile(filePath: string): void {
  const resolved = resolvePath(filePath)
  if (existsSync(resolved)) return

  const dir = dirname(resolved)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(resolved, "", "utf-8")
}

function readRecentDecisions(filePath: string, maxEntries: number = 20): string[] {
  const resolved = resolvePath(filePath)
  if (!existsSync(resolved)) return []

  const content = readFileSync(resolved, "utf-8")
  if (!content.trim()) return []

  const lines = content.split("\n").filter((line) => line.trim())
  const validDecisions: string[] = []

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line)
      validDecisions.push(JSON.stringify(parsed))
    } catch {
      // Skip invalid JSON lines silently
      continue
    }
  }

  return validDecisions.slice(-maxEntries)
}

function buildSystemPrompt(
  ownerContent: string | undefined,
  constraintsContent: string | undefined,
  knowledgeContents: string[] = [],
  recentDecisions?: string[],
): string {
  const parts: string[] = []

  if (ownerContent) {
    parts.push(ownerContent)
  } else {
    parts.push(DEFAULT_DAEDALUS_PROMPT)
  }

  if (constraintsContent) {
    parts.push(`\n\n## Constraints Reference (Machine-Readable)\n\n\`\`\`yaml\n${constraintsContent}\n\`\`\``)
  }

  for (const knowledgeContent of knowledgeContents) {
    parts.push(`\n\n---\n## Company Conventions\n\n${knowledgeContent}`)
  }

  if (recentDecisions && recentDecisions.length > 0) {
    parts.push("\n\n## Recent Decisions (Auto-loaded)\n\n아래는 최근 기록된 결정 사항입니다. 참고하여 일관된 판단을 내리세요.\n\n")
    parts.push(recentDecisions.join("\n"))
  }

  return parts.join("\n")
}

const DEFAULT_DAEDALUS_PROMPT = `# Daedalus — DevOps & Infrastructure Owner

You are **Daedalus**, the DevOps & Infrastructure Owner. You are the exclusive authority for all infrastructure operations.

## Three Roles

1. **실행자 (Executor)** — Direct operations (deploy, scale, debug)
2. **플래너 (Planner)** — Strategic planning (architecture, migrations)
3. **분석가 (Analyst)** — Investigation (incidents, diagnostics)

## Responsibilities
- Terraform/OpenTofu operations (plan, apply, destroy)
- Docker image building and deployment
- Helm chart management
- CI/CD pipeline management
- Infrastructure incident response
- Monitoring data analysis (Datadog, OpenSearch, Grafana)
- Cloud infrastructure management (AWS)

## Safety Rules
- ALWAYS check cluster context before kubectl operations
- ALWAYS verify auto-scaler conflicts before scaling
- ALWAYS confirm production operations explicitly
- NEVER skip safety checks
- Log all significant decisions to decisions.jsonl

## Delegation
- Git operations → delegate to git-owner
- kubectl operations → delegate to k8s-owner
- Deep research → delegate to explore
- External docs → delegate to librarian
- Complex design → delegate to oracle (sparingly)`

/**
 * Creates a daedalus agent from custom agent config.
 * Loads OWNER.md and constraints.yaml from configured paths,
 * initializes decisions.jsonl if missing, reads recent decisions,
 * and injects them into the system prompt for self-learning.
 */
export function createDaedalusAgent(model: string, config?: CustomAgentConfig): AgentConfig {
  let ownerContent: string | undefined
  let constraintsContent: string | undefined
  const knowledgeContents: string[] = []
  let decisionsPath: string | undefined

  if (config?.promptPath) {
    ownerContent = safeReadFile(config.promptPath)
  }

  if (config?.constraintsPath) {
    constraintsContent = safeReadFile(config.constraintsPath)
  }

  if (config?.decisionsPath) {
    decisionsPath = config.decisionsPath
    initializeDecisionsFile(decisionsPath)
  }

  if (config?.knowledgePaths && config.knowledgePaths.length > 0) {
    for (const knowledgePath of config.knowledgePaths) {
      const content = safeReadFile(knowledgePath)
      if (content) {
        knowledgeContents.push(content)
      }
    }
  }

  const recentDecisions = decisionsPath ? readRecentDecisions(decisionsPath, 20) : []
  const systemPrompt = buildSystemPrompt(ownerContent, constraintsContent, knowledgeContents, recentDecisions)

  return {
    description:
      "DevOps/Infrastructure Orchestrator. Plans and executes infrastructure changes (Terraform, Docker, Helm), analyzes incidents, and delegates to domain owners (git-owner, k8s-owner). (Daedalus - OhMyOpenCode)",
    mode: MODE,
    model,
    temperature: 0.3,
    prompt: systemPrompt,
  } as AgentConfig
}
createDaedalusAgent.mode = MODE

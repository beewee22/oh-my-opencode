import type { PreToolUseContext } from "./pre-tool-use"
import type { OhMyOpenCodeConfig } from "../../config/schema"
import { classifyGitCommand } from "./git-command-classifier"

export interface GitWriteEnforcementResult {
  blocked: boolean
  reason?: string
}

export function enforceGitWriteRestriction(
  context: PreToolUseContext,
  config: OhMyOpenCodeConfig
): GitWriteEnforcementResult {
  const toolName = context.toolName
  const toolLower = toolName.toLowerCase()
   const isBashTool = toolLower === "bash" || toolLower === "mcp_bash"
   const isInteractiveBash = toolLower === "interactive_bash"

   if (!isBashTool && !isInteractiveBash) {
    return { blocked: false }
  }

   const command = extractCommand(context)

   if (!command) {
    return { blocked: false }
  }

   const classification = classifyGitCommand(command)

   if (!classification.isGit || !classification.isWrite) {
    return { blocked: false }
  }

   const agent = context.agent

   if (agent === "git-owner") {
    return { blocked: false }
  }

  return {
    blocked: true,
    reason: `Git write blocked. You cannot execute git write operations directly.

REQUIRED: Delegate to git-owner agent using task():

task(
  subagent_type="git-owner",
  load_skills=["git-master"],
  prompt="Execute the git operation: [describe what you were trying to do]"
)

Example:
task(
  subagent_type="git-owner",
  load_skills=["git-master"],
  prompt="Commit changes with message: feat(xyz): add feature. Target branch: dev"
)

DO NOT attempt git write operations directly. ALL git write operations (commit, push, merge, rebase, etc.) MUST go through git-owner with git-master skill.`,
  }
}

function extractCommand(context: PreToolUseContext): string {
  const toolInput = context.toolInput
  const toolLower = context.toolName.toLowerCase()

  if (toolLower === "bash" || toolLower === "mcp_bash") {
    return (toolInput.command as string) ?? ""
  }

  if (toolLower === "interactive_bash") {
    return (toolInput.tmux_command as string) ?? ""
  }

  return ""
}

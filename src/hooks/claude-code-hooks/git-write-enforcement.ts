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

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CRITICAL: DO NOT ask the user to execute git commands manually.
DO NOT say "사용자님이 실행해주세요" or provide manual command instructions.

YOU MUST DELEGATE using task() - this is NOT optional.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

REQUIRED ACTION: Delegate to git-owner agent using task():

task(
  subagent_type="git-owner",
  load_skills=["git-master"],
  run_in_background=false,
  prompt="Execute the git operation: [describe what you were trying to do]"
)

CONCRETE EXAMPLE:
task(
  subagent_type="git-owner",
  load_skills=["git-master"],
  run_in_background=false,
  prompt="Commit changes with message: feat(xyz): add feature. Files: src/file.ts. Target branch: dev"
)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FORBIDDEN RESPONSES:
❌ "사용자님이 git commit을 실행해주세요"
❌ "Please run: git commit -m '...'"
❌ "You can execute: git push origin main"
❌ Providing git commands for user to copy-paste

CORRECT RESPONSE:
✅ Immediately call task() with git-owner
✅ Provide full context in the prompt parameter
✅ Continue work after delegation completes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALL git write operations (commit, push, merge, rebase, branch creation, etc.) MUST go through git-owner. NO EXCEPTIONS.`,
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

import type { PreToolUseContext } from "./pre-tool-use"
import type { OhMyOpenCodeConfig } from "../../config/schema"
import { classifyKubectlCommand } from "./kubectl-command-classifier"

export interface KubectlWriteEnforcementResult {
  blocked: boolean
  reason?: string
}

export function enforceKubectlWriteRestriction(
  context: PreToolUseContext,
  config: OhMyOpenCodeConfig
): KubectlWriteEnforcementResult {
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

  const classification = classifyKubectlCommand(command)

  if (!classification.isKubectl) {
    return { blocked: false }
  }

  const agent = context.agent

  if (classification.isDangerous && agent !== "k8s-owner") {
    return {
      blocked: true,
      reason: `Kubectl dangerous operation blocked. You cannot execute dangerous kubectl operations directly.

REQUIRED: Delegate to k8s-owner agent using task():

task(
  subagent_type="k8s-owner",
  load_skills=[],
  prompt="Execute the kubectl operation: [describe what you were trying to do]"
)

Example:
task(
  subagent_type="k8s-owner",
  load_skills=[],
  prompt="Scale deployment xyz to 3 replicas. Check for KEDA/HPA conflicts first."
)

DO NOT attempt kubectl dangerous operations directly. ALL dangerous operations (scale, delete, apply, etc.) MUST go through k8s-owner.`,
    }
  }

  if (classification.isContextSwitch && agent !== "k8s-owner") {
    return {
      blocked: true,
      reason: `Kubectl context switch blocked. You cannot switch kubectl contexts directly.

REQUIRED: Delegate to k8s-owner agent using task():

task(
  subagent_type="k8s-owner",
  load_skills=[],
  prompt="Switch kubectl context to: [cluster-name]"
)

Example:
task(
  subagent_type="k8s-owner",
  load_skills=[],
  prompt="Switch kubectl context to prd-mss-cluster. Show current context first."
)

DO NOT attempt context switching directly. ALL context switches MUST go through k8s-owner for safety.`,
    }
  }

  return { blocked: false }
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

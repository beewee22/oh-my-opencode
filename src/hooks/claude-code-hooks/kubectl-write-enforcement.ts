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

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CRITICAL: DO NOT ask the user to execute kubectl commands manually.
DO NOT say "사용자님이 실행해주세요" or provide manual command instructions.

YOU MUST DELEGATE using task() - this is NOT optional.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

REQUIRED ACTION: Delegate to k8s-owner agent using task():

task(
  subagent_type="k8s-owner",
  load_skills=[],
  run_in_background=false,
  prompt="Execute the kubectl operation: [describe what you were trying to do]"
)

CONCRETE EXAMPLE:
task(
  subagent_type="k8s-owner",
  load_skills=[],
  run_in_background=false,
  prompt="Scale deployment xyz to 3 replicas in dev-mss-cluster namespace dev-member. Check for KEDA/HPA conflicts first."
)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FORBIDDEN RESPONSES:
❌ "사용자님이 kubectl scale을 실행해주세요"
❌ "Please run: kubectl apply -f ..."
❌ "You can execute: kubectl delete pod ..."
❌ Providing kubectl commands for user to copy-paste

CORRECT RESPONSE:
✅ Immediately call task() with k8s-owner
✅ Provide full context (cluster, namespace, resource, action)
✅ Continue work after delegation completes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALL dangerous kubectl operations (scale, delete, apply, patch, etc.) MUST go through k8s-owner. NO EXCEPTIONS.`,
    }
  }

  if (classification.isContextSwitch && agent !== "k8s-owner") {
    return {
      blocked: true,
      reason: `Kubectl context switch blocked. You cannot switch kubectl contexts directly.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CRITICAL: DO NOT ask the user to switch kubectl context manually.
DO NOT say "사용자님이 실행해주세요" or provide manual command instructions.

YOU MUST DELEGATE using task() - this is NOT optional.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

REQUIRED ACTION: Delegate to k8s-owner agent using task():

task(
  subagent_type="k8s-owner",
  load_skills=[],
  run_in_background=false,
  prompt="Switch kubectl context to: [cluster-name]. Show current context first."
)

CONCRETE EXAMPLE:
task(
  subagent_type="k8s-owner",
  load_skills=[],
  run_in_background=false,
  prompt="Switch kubectl context to prd-mss-cluster. Confirm current context is dev-mss-cluster before switching."
)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FORBIDDEN RESPONSES:
❌ "사용자님이 kubectl config use-context를 실행해주세요"
❌ "Please run: kubectl config use-context prd-mss-cluster"
❌ "You can execute: kubectl config set-context ..."
❌ Providing context switch commands for user to copy-paste

CORRECT RESPONSE:
✅ Immediately call task() with k8s-owner
✅ Specify target cluster and confirmation requirements
✅ Continue work after delegation completes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALL kubectl context switches MUST go through k8s-owner for safety verification. NO EXCEPTIONS.`,
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

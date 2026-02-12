export const BUILTIN_ALLOWED_AGENTS = ["explore", "librarian"] as const

export const ALLOWED_AGENTS = [
  "explore",
  "librarian",
  "oracle",
  "hephaestus",
  "metis",
  "momus",
  "multimodal-looker",
  "git-owner",
  "k8s-owner",
] as const

export const CALL_OMO_AGENT_DESCRIPTION = `Spawn explore/librarian/owner agent. run_in_background REQUIRED (true=async with task_id, false=sync).

Available: {agents}

Pass \`session_id=<id>\` to continue previous agent with full context. Prompts MUST be in English. Use \`background_output\` for async results.`

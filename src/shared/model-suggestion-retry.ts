import type { createOpencodeClient } from "@opencode-ai/sdk"
import { log } from "./logger"
import { fuzzyMatchModel } from "./model-availability"
import { isProviderRateLimited, markProviderRateLimited } from "./rate-limit-cache"

type OpencodeClient = ReturnType<typeof createOpencodeClient>
type PromptFn = OpencodeClient["session"]["prompt"]

export interface PromptClient {
  session: {
    prompt: PromptFn
  }
  // Optional: available on some SDK/client versions.
  // We keep this loose because OpenCode SDK types may not include these fields.
  model?: {
    list?: () => Promise<unknown>
  }
  provider?: {
    list?: () => Promise<unknown>
  }
}

type PromptArgs = Parameters<PromptFn>[0]

export interface ModelSuggestionInfo {
  providerID: string
  modelID: string
  suggestion: string
}

function extractMessage(error: unknown): string {
  if (typeof error === "string") return error
  if (error instanceof Error) return error.message
  if (typeof error === "object" && error !== null) {
    const obj = error as Record<string, unknown>
    if (typeof obj.message === "string") return obj.message
    try {
      return JSON.stringify(error)
    } catch {
      return ""
    }
  }
  return String(error)
}

export function parseModelSuggestion(error: unknown): ModelSuggestionInfo | null {
  if (!error) return null

  if (typeof error === "object") {
    const errObj = error as Record<string, unknown>

    if (errObj.name === "ProviderModelNotFoundError" && typeof errObj.data === "object" && errObj.data !== null) {
      const data = errObj.data as Record<string, unknown>
      const suggestions = data.suggestions
      if (Array.isArray(suggestions) && suggestions.length > 0 && typeof suggestions[0] === "string") {
        return {
          providerID: String(data.providerID ?? ""),
          modelID: String(data.modelID ?? ""),
          suggestion: suggestions[0],
        }
      }
      return null
    }

    for (const key of ["data", "error", "cause"] as const) {
      const nested = errObj[key]
      if (nested && typeof nested === "object") {
        const result = parseModelSuggestion(nested)
        if (result) return result
      }
    }
  }

  const message = extractMessage(error)
  if (!message) return null

  const modelMatch = message.match(/model not found:\s*([^/\s]+)\s*\/\s*([^.\s]+)/i)
  const suggestionMatch = message.match(/did you mean:\s*([^,?]+)/i)

  if (modelMatch && suggestionMatch) {
    return {
      providerID: modelMatch[1].trim(),
      modelID: modelMatch[2].trim(),
      suggestion: suggestionMatch[1].trim(),
    }
  }

  return null
}

function hasNumericProp(obj: Record<string, unknown>, key: string): obj is Record<string, number> {
  return typeof obj[key] === "number"
}

function hasStringProp(obj: Record<string, unknown>, key: string): obj is Record<string, string> {
  return typeof obj[key] === "string"
}

function isAnthropicQuotaExhausted(error: unknown): boolean {
  const message = extractMessage(error)
  const lower = message.toLowerCase()

  // Primary: explicit quota/credit/billing signals
  const keywordHit =
    lower.includes("insufficient_quota") ||
    lower.includes("quota") ||
    lower.includes("billing") ||
    lower.includes("credit") ||
    lower.includes("exceeded")

  if (!keywordHit) {
    return false
  }

  // If we can read a status code, be stricter.
  if (error && typeof error === "object") {
    const obj = error as Record<string, unknown>
    if (hasNumericProp(obj, "status")) {
      // 429: rate limit / quota, 402: payment required, 403: forbidden (sometimes quota)
      return obj.status === 429 || obj.status === 402 || obj.status === 403
    }
    if (hasNumericProp(obj, "statusCode")) {
      return obj.statusCode === 429 || obj.statusCode === 402 || obj.statusCode === 403
    }
    if (hasStringProp(obj, "name")) {
      const nameLower = obj.name.toLowerCase()
      if (nameLower.includes("quota") || nameLower.includes("insufficient") || nameLower.includes("rate")) {
        return true
      }
    }
  }

  // Otherwise, rely on message pattern.
  return (
    lower.includes("insufficient_quota") ||
    lower.includes("exceeded your") ||
    lower.includes("quota exceeded") ||
    lower.includes("exceeded")
  )
}

function isOpenAIQuotaExhausted(error: unknown): boolean {
  const message = extractMessage(error)
  const lower = message.toLowerCase()

  const keywordHit =
    lower.includes("rate_limit") ||
    lower.includes("rate limit") ||
    lower.includes("quota") ||
    lower.includes("exceeded") ||
    lower.includes("too many requests")

  if (!keywordHit) {
    return false
  }

  if (error && typeof error === "object") {
    const obj = error as Record<string, unknown>
    if (hasNumericProp(obj, "status")) {
      return obj.status === 429
    }
    if (hasNumericProp(obj, "statusCode")) {
      return obj.statusCode === 429
    }
    if (typeof obj.error === "object" && obj.error !== null) {
      const errInner = obj.error as Record<string, unknown>
      if (hasStringProp(errInner, "type") && errInner.type.includes("rate_limit")) {
        return true
      }
    }
  }

  return lower.includes("rate_limit_exceeded") || lower.includes("too many requests")
}

async function listAvailableModelsFromClient(client: PromptClient): Promise<Set<string>> {
  const modelSet = new Set<string>()

  const listFn = client.model?.list
  if (typeof listFn !== "function") {
    return modelSet
  }

  const result = await listFn()
  const data = (result as { data?: unknown }).data
  if (!Array.isArray(data)) {
    return modelSet
  }

  for (const item of data) {
    if (!item || typeof item !== "object") continue
    const rec = item as Record<string, unknown>
    if (hasStringProp(rec, "provider") && hasStringProp(rec, "id")) {
      modelSet.add(`${rec.provider}/${rec.id}`)
    }
  }

  return modelSet
}

function getModelIdFromFullModel(model: string): string {
  const slashIndex = model.indexOf("/")
  if (slashIndex === -1) return model
  return model.slice(slashIndex + 1)
}

export async function promptWithModelSuggestionRetry(
  client: PromptClient,
  args: PromptArgs,
): Promise<void> {
  if (!args.body) {
    throw new Error("promptWithModelSuggestionRetry: args.body is required")
  }
  if (!args.body.parts) {
    throw new Error("promptWithModelSuggestionRetry: args.body.parts is required")
  }

  const originalBody = args.body

  const model = args.body.model
  if (model && model.providerID === "anthropic" && model.modelID.toLowerCase().includes("claude") && isProviderRateLimited("anthropic")) {
    const availableModels = await listAvailableModelsFromClient(client)
    const preferredTarget = `amazon-bedrock/${model.modelID}`
    const preferredMatch = fuzzyMatchModel(preferredTarget, availableModels, ["amazon-bedrock"])
    if (preferredMatch) {
      const bedrockModelID = getModelIdFromFullModel(preferredMatch)
      log("[model-suggestion-retry] Anthropic cached as rate-limited, skipping to amazon-bedrock", {
        original: `${model.providerID}/${model.modelID}`,
        fallback: `amazon-bedrock/${bedrockModelID}`,
      })
      await client.session.prompt({
        ...args,
        body: {
          ...args.body,
          parts: args.body.parts,
          model: {
            providerID: "amazon-bedrock",
            modelID: bedrockModelID,
          },
        },
      })
      return
    }
    log("[model-suggestion-retry] Anthropic cached as rate-limited but no bedrock alias found, trying anyway")
  }

  if (model && model.providerID === "openai" && isProviderRateLimited("openai")) {
    const availableModels = await listAvailableModelsFromClient(client)
    const preferredTarget = `openrouter/openai/${model.modelID}`
    const preferredMatch = fuzzyMatchModel(preferredTarget, availableModels, ["openrouter"])
    if (preferredMatch) {
      const openrouterModelID = getModelIdFromFullModel(preferredMatch)
      log("[model-suggestion-retry] OpenAI cached as rate-limited, skipping to openrouter", {
        original: `${model.providerID}/${model.modelID}`,
        fallback: `openrouter/${openrouterModelID}`,
      })
      await client.session.prompt({
        ...args,
        body: {
          ...args.body,
          parts: args.body.parts,
          model: {
            providerID: "openrouter",
            modelID: openrouterModelID,
          },
        },
      })
      return
    }
    log("[model-suggestion-retry] OpenAI cached as rate-limited but no openrouter model found, trying anyway")
  }

  try {
    await client.session.prompt(args)
  } catch (error) {
    const suggestion = parseModelSuggestion(error)
    if (!suggestion || !originalBody.model) {
      // Special-case: Anthropic quota exhaustion -> retry with Amazon Bedrock Claude (same model ID)
      const model = originalBody.model
      if (
        model &&
        model.providerID === "anthropic" &&
        model.modelID.toLowerCase().includes("claude") &&
        isAnthropicQuotaExhausted(error)
      ) {
        markProviderRateLimited("anthropic")
        const availableModels = await listAvailableModelsFromClient(client)

        // Safety: only fallback if we can find an amazon-bedrock model that matches
        // the original Anthropic model ID (typically via an alias in provider config).
        const preferredTarget = `amazon-bedrock/${model.modelID}`
        const preferredMatch = fuzzyMatchModel(preferredTarget, availableModels, ["amazon-bedrock"])
        if (!preferredMatch) {
          const bedrockConnected = Array.from(availableModels).some((m) => m.startsWith("amazon-bedrock/"))
          log("[model-suggestion-retry] Anthropic quota exhausted but no bedrock alias found - not retrying", {
            original: `${model.providerID}/${model.modelID}`,
            attempted: preferredTarget,
            bedrockConnected,
          })
          throw error
        }

        const bedrockModelID = getModelIdFromFullModel(preferredMatch)

        log("[model-suggestion-retry] Anthropic quota exhausted, retrying via amazon-bedrock", {
          original: `${model.providerID}/${model.modelID}`,
          fallback: `amazon-bedrock/${bedrockModelID}`,
        })

        await client.session.prompt({
          ...args,
          body: {
            ...originalBody,
            parts: originalBody.parts,
            model: {
              providerID: "amazon-bedrock",
              modelID: bedrockModelID,
            },
          },
        })
        return
      }

      const openaiModel = originalBody.model
      if (
        openaiModel &&
        openaiModel.providerID === "openai" &&
        isOpenAIQuotaExhausted(error)
      ) {
        markProviderRateLimited("openai")
        const availableModels = await listAvailableModelsFromClient(client)

        const preferredTarget = `openrouter/openai/${openaiModel.modelID}`
        const preferredMatch = fuzzyMatchModel(preferredTarget, availableModels, ["openrouter"])
        if (!preferredMatch) {
          const openrouterConnected = Array.from(availableModels).some((m) => m.startsWith("openrouter/"))
          log("[model-suggestion-retry] OpenAI rate limited but no openrouter model found - not retrying", {
            original: `${openaiModel.providerID}/${openaiModel.modelID}`,
            attempted: preferredTarget,
            openrouterConnected,
          })
          throw error
        }

        const openrouterModelID = getModelIdFromFullModel(preferredMatch)

        log("[model-suggestion-retry] OpenAI rate limited, retrying via openrouter", {
          original: `${openaiModel.providerID}/${openaiModel.modelID}`,
          fallback: `openrouter/${openrouterModelID}`,
        })

        await client.session.prompt({
          ...args,
          body: {
            ...originalBody,
            parts: originalBody.parts,
            model: {
              providerID: "openrouter",
              modelID: openrouterModelID,
            },
          },
        })
        return
      }

      throw error
    }

    log("[model-suggestion-retry] Model not found, retrying with suggestion", {
      original: `${suggestion.providerID}/${suggestion.modelID}`,
      suggested: suggestion.suggestion,
    })

    await client.session.prompt({
      ...args,
      body: {
        ...originalBody,
        parts: originalBody.parts,
        model: {
          providerID: suggestion.providerID,
          modelID: suggestion.suggestion,
        },
      },
    })
  }
}

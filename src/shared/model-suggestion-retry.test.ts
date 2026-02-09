import { describe, it, expect, mock, beforeEach } from "bun:test"
import type { PromptClient } from "./model-suggestion-retry"
import { parseModelSuggestion, promptWithModelSuggestionRetry } from "./model-suggestion-retry"
import { markProviderRateLimited, __resetRateLimitCache } from "./rate-limit-cache"

function createClient(promptMock: ReturnType<typeof mock>): PromptClient {
  const prompt: PromptClient["session"]["prompt"] = ((
    args: Parameters<PromptClient["session"]["prompt"]>[0]
  ) => {
    return Promise.resolve(promptMock(args)) as unknown as ReturnType<
      PromptClient["session"]["prompt"]
    >
  }) as unknown as PromptClient["session"]["prompt"]

  return {
    session: {
      prompt,
    },
    provider: {
      list: async () => ({ data: { connected: ["amazon-bedrock", "anthropic"] } }),
    },
    model: {
      list: async () => ({
        data: [
          { provider: "anthropic", id: "claude-opus-4-6" },
          { provider: "amazon-bedrock", id: "claude-opus-4-6" },
        ],
      }),
    },
  }
}

function getCallBody(callArg: unknown): Record<string, unknown> {
  if (!callArg || typeof callArg !== "object") {
    throw new Error("Expected call argument to be an object")
  }
  const obj = callArg as Record<string, unknown>
  const body = obj.body
  if (!body || typeof body !== "object") {
    throw new Error("Expected call argument to contain body object")
  }
  return body as Record<string, unknown>
}

describe("parseModelSuggestion", () => {
  describe("structured NamedError format", () => {
    it("should extract suggestion from ProviderModelNotFoundError", () => {
      // given a structured NamedError with suggestions
      const error = {
        name: "ProviderModelNotFoundError",
        data: {
          providerID: "anthropic",
          modelID: "claude-sonet-4",
          suggestions: ["claude-sonnet-4", "claude-sonnet-4-5"],
        },
      }

      // when parsing the error
      const result = parseModelSuggestion(error)

      // then should return the first suggestion
      expect(result).toEqual({
        providerID: "anthropic",
        modelID: "claude-sonet-4",
        suggestion: "claude-sonnet-4",
      })
    })

    it("should return null when suggestions array is empty", () => {
      // given a NamedError with empty suggestions
      const error = {
        name: "ProviderModelNotFoundError",
        data: {
          providerID: "anthropic",
          modelID: "claude-sonet-4",
          suggestions: [],
        },
      }

      // when parsing the error
      const result = parseModelSuggestion(error)

      // then should return null
      expect(result).toBeNull()
    })

    it("should return null when suggestions field is missing", () => {
      // given a NamedError without suggestions
      const error = {
        name: "ProviderModelNotFoundError",
        data: {
          providerID: "anthropic",
          modelID: "claude-sonet-4",
        },
      }

      // when parsing the error
      const result = parseModelSuggestion(error)

      // then should return null
      expect(result).toBeNull()
    })
  })

  describe("nested error format", () => {
    it("should extract suggestion from nested data.error", () => {
      // given an error with nested NamedError in data field
      const error = {
        data: {
          name: "ProviderModelNotFoundError",
          data: {
            providerID: "openai",
            modelID: "gpt-5",
            suggestions: ["gpt-5.2"],
          },
        },
      }

      // when parsing the error
      const result = parseModelSuggestion(error)

      // then should extract from nested structure
      expect(result).toEqual({
        providerID: "openai",
        modelID: "gpt-5",
        suggestion: "gpt-5.2",
      })
    })

    it("should extract suggestion from nested error field", () => {
      // given an error with nested NamedError in error field
      const error = {
        error: {
          name: "ProviderModelNotFoundError",
          data: {
            providerID: "google",
            modelID: "gemini-3-flsh",
            suggestions: ["gemini-3-flash"],
          },
        },
      }

      // when parsing the error
      const result = parseModelSuggestion(error)

      // then should extract from nested error field
      expect(result).toEqual({
        providerID: "google",
        modelID: "gemini-3-flsh",
        suggestion: "gemini-3-flash",
      })
    })
  })

  describe("string message format", () => {
    it("should parse suggestion from error message string", () => {
      // given an Error with model-not-found message and suggestion
      const error = new Error(
        "Model not found: anthropic/claude-sonet-4. Did you mean: claude-sonnet-4, claude-sonnet-4-5?"
      )

      // when parsing the error
      const result = parseModelSuggestion(error)

      // then should extract from message string
      expect(result).toEqual({
        providerID: "anthropic",
        modelID: "claude-sonet-4",
        suggestion: "claude-sonnet-4",
      })
    })

    it("should parse from plain string error", () => {
      // given a plain string error message
      const error =
        "Model not found: openai/gtp-5. Did you mean: gpt-5?"

      // when parsing the error
      const result = parseModelSuggestion(error)

      // then should extract from string
      expect(result).toEqual({
        providerID: "openai",
        modelID: "gtp-5",
        suggestion: "gpt-5",
      })
    })

    it("should parse from object with message property", () => {
      // given an object with message property
      const error = {
        message: "Model not found: google/gemini-3-flsh. Did you mean: gemini-3-flash?",
      }

      // when parsing the error
      const result = parseModelSuggestion(error)

      // then should extract from message property
      expect(result).toEqual({
        providerID: "google",
        modelID: "gemini-3-flsh",
        suggestion: "gemini-3-flash",
      })
    })

    it("should return null when message has no suggestion", () => {
      // given an error without Did you mean
      const error = new Error("Model not found: anthropic/nonexistent.")

      // when parsing the error
      const result = parseModelSuggestion(error)

      // then should return null
      expect(result).toBeNull()
    })
  })

  describe("edge cases", () => {
    it("should return null for null error", () => {
      // given null
      // when parsing
      const result = parseModelSuggestion(null)
      // then should return null
      expect(result).toBeNull()
    })

    it("should return null for undefined error", () => {
      // given undefined
      // when parsing
      const result = parseModelSuggestion(undefined)
      // then should return null
      expect(result).toBeNull()
    })

    it("should return null for unrelated error", () => {
      // given an unrelated error
      const error = new Error("Connection timeout")
      // when parsing
      const result = parseModelSuggestion(error)
      // then should return null
      expect(result).toBeNull()
    })

    it("should return null for empty object", () => {
      // given empty object
      // when parsing
      const result = parseModelSuggestion({})
      // then should return null
      expect(result).toBeNull()
    })
  })
})

describe("promptWithModelSuggestionRetry", () => {
  beforeEach(() => {
    __resetRateLimitCache()
  })

  it("should succeed on first try without retry", async () => {
    // given a client where prompt succeeds
    const promptMock = mock(() => Promise.resolve())
    const client = createClient(promptMock)

    // when calling promptWithModelSuggestionRetry
    await promptWithModelSuggestionRetry(client, {
      path: { id: "session-1" },
      body: {
        parts: [{ type: "text", text: "hello" }],
        model: { providerID: "anthropic", modelID: "claude-sonnet-4" },
      },
    })

    // then should call prompt exactly once
    expect(promptMock).toHaveBeenCalledTimes(1)
  })

  it("should retry with suggestion on model-not-found error", async () => {
    // given a client that fails first with model-not-found, then succeeds
    const promptMock = mock()
      .mockRejectedValueOnce({
        name: "ProviderModelNotFoundError",
        data: {
          providerID: "anthropic",
          modelID: "claude-sonet-4",
          suggestions: ["claude-sonnet-4"],
        },
      })
      .mockResolvedValueOnce(undefined)
    const client = createClient(promptMock)

    // when calling promptWithModelSuggestionRetry
    await promptWithModelSuggestionRetry(client, {
      path: { id: "session-1" },
      body: {
        agent: "explore",
        parts: [{ type: "text", text: "hello" }],
        model: { providerID: "anthropic", modelID: "claude-sonet-4" },
      },
    })

    // then should call prompt twice - first with original, then with suggestion
    expect(promptMock).toHaveBeenCalledTimes(2)
    const retryCall = promptMock.mock.calls[1][0]
    expect(retryCall.body.model).toEqual({
      providerID: "anthropic",
      modelID: "claude-sonnet-4",
    })
  })

  it("should throw original error when no suggestion available", async () => {
    // given a client that fails with a non-model-not-found error
    const originalError = new Error("Connection refused")
    const promptMock = mock().mockRejectedValueOnce(originalError)
    const client = createClient(promptMock)

    // when calling promptWithModelSuggestionRetry
    // then should throw the original error
    await expect(
      promptWithModelSuggestionRetry(client, {
        path: { id: "session-1" },
        body: {
          parts: [{ type: "text", text: "hello" }],
          model: { providerID: "anthropic", modelID: "claude-sonnet-4" },
        },
      })
    ).rejects.toThrow("Connection refused")

    expect(promptMock).toHaveBeenCalledTimes(1)
  })

  it("should throw original error when retry also fails", async () => {
    // given a client that fails with model-not-found, retry also fails
    const modelNotFoundError = {
      name: "ProviderModelNotFoundError",
      data: {
        providerID: "anthropic",
        modelID: "claude-sonet-4",
        suggestions: ["claude-sonnet-4"],
      },
    }
    const retryError = new Error("Still not found")
    const promptMock = mock()
      .mockRejectedValueOnce(modelNotFoundError)
      .mockRejectedValueOnce(retryError)
    const client = createClient(promptMock)

    // when calling promptWithModelSuggestionRetry
    // then should throw the retry error (not the original)
    await expect(
      promptWithModelSuggestionRetry(client, {
        path: { id: "session-1" },
        body: {
          parts: [{ type: "text", text: "hello" }],
          model: { providerID: "anthropic", modelID: "claude-sonet-4" },
        },
      })
    ).rejects.toThrow("Still not found")

    expect(promptMock).toHaveBeenCalledTimes(2)
  })

  it("should preserve other body fields during retry", async () => {
    // given a client that fails first with model-not-found
    const promptMock = mock()
      .mockRejectedValueOnce({
        name: "ProviderModelNotFoundError",
        data: {
          providerID: "anthropic",
          modelID: "claude-sonet-4",
          suggestions: ["claude-sonnet-4"],
        },
      })
      .mockResolvedValueOnce(undefined)
    const client = createClient(promptMock)

    // when calling with additional body fields
    await promptWithModelSuggestionRetry(client, {
      path: { id: "session-1" },
      body: {
        agent: "explore",
        system: "You are a helpful agent",
        tools: { task: false },
        parts: [{ type: "text", text: "hello" }],
        model: { providerID: "anthropic", modelID: "claude-sonet-4" },
        noReply: true,
      },
    })

    // then retry call should preserve all fields except corrected model
    const retryCall = promptMock.mock.calls[1][0]
    expect(retryCall.body.agent).toBe("explore")
    expect(retryCall.body.system).toBe("You are a helpful agent")
    expect(retryCall.body.tools).toEqual({ task: false })
    expect(retryCall.body.noReply).toBe(true)
    expect(retryCall.body.model).toEqual({
      providerID: "anthropic",
      modelID: "claude-sonnet-4",
    })
  })

  it("should handle string error message with suggestion", async () => {
    // given a client that fails with a string error containing suggestion
    const promptMock = mock()
      .mockRejectedValueOnce(
        new Error("Model not found: anthropic/claude-sonet-4. Did you mean: claude-sonnet-4?")
      )
      .mockResolvedValueOnce(undefined)
    const client = createClient(promptMock)

    // when calling promptWithModelSuggestionRetry
    await promptWithModelSuggestionRetry(client, {
      path: { id: "session-1" },
      body: {
        parts: [{ type: "text", text: "hello" }],
        model: { providerID: "anthropic", modelID: "claude-sonet-4" },
      },
    })

    // then should retry with suggested model
    expect(promptMock).toHaveBeenCalledTimes(2)
    const retryCall = promptMock.mock.calls[1][0]
    expect(retryCall.body.model.modelID).toBe("claude-sonnet-4")
  })

  it("should not retry when no model in original request", async () => {
    // given a client that fails with model-not-found but original has no model param
    const modelNotFoundError = new Error(
      "Model not found: anthropic/claude-sonet-4. Did you mean: claude-sonnet-4?"
    )
    const promptMock = mock().mockRejectedValueOnce(modelNotFoundError)
    const client = createClient(promptMock)

    // when calling without model in body
    // then should throw without retrying
    await expect(
      promptWithModelSuggestionRetry(client, {
        path: { id: "session-1" },
        body: {
          parts: [{ type: "text", text: "hello" }],
        },
      })
    ).rejects.toThrow()

    expect(promptMock).toHaveBeenCalledTimes(1)
  })

  it("should retry with amazon-bedrock when Anthropic quota is exhausted", async () => {
    // given a client that fails with quota error first, then succeeds
    const promptMock = mock()
      .mockRejectedValueOnce({ status: 429, message: "insufficient_quota" })
      .mockResolvedValueOnce(undefined)
    const client = createClient(promptMock)

    // when calling promptWithModelSuggestionRetry
    await promptWithModelSuggestionRetry(client, {
      path: { id: "session-1" },
      body: {
        agent: "sisyphus",
        parts: [{ type: "text", text: "hello" }],
        model: { providerID: "anthropic", modelID: "claude-opus-4-6" },
        noReply: true,
      },
    })

    // then should retry once with amazon-bedrock provider and preserve modelID
    expect(promptMock).toHaveBeenCalledTimes(2)
    const retryCallArg = promptMock.mock.calls[1]?.[0] as unknown
    const retryBody = getCallBody(retryCallArg)
    expect(retryBody.model).toEqual({
      providerID: "amazon-bedrock",
      modelID: "claude-opus-4-6",
    })
    expect(retryBody.noReply).toBe(true)
  })

  it("should not retry with amazon-bedrock when no bedrock alias exists", async () => {
    // given - quota error but bedrock model list does not include an alias for the same model ID
    const promptMock = mock().mockRejectedValueOnce({ status: 429, message: "quota exceeded" })
    const client: PromptClient = {
      ...createClient(promptMock),
      provider: {
        list: async () => ({ data: { connected: ["amazon-bedrock", "anthropic"] } }),
      },
      model: {
        list: async () => ({
          data: [
            { provider: "anthropic", id: "claude-opus-4-6" },
            // Note: bedrock has a different ID; no alias
            { provider: "amazon-bedrock", id: "anthropic.claude-opus-4-6-20260206-v1:0" },
          ],
        }),
      },
    }

    // when / then - should throw without retrying
    await expect(
      promptWithModelSuggestionRetry(client, {
        path: { id: "session-1" },
        body: {
          agent: "sisyphus",
          parts: [{ type: "text", text: "hello" }],
          model: { providerID: "anthropic", modelID: "claude-opus-4-6" },
        },
      })
    ).rejects.toThrow()

    expect(promptMock).toHaveBeenCalledTimes(1)
  })

  it("should not retry with amazon-bedrock when provider is not anthropic", async () => {
    // given a quota-like error but non-anthropic provider
    const promptMock = mock().mockRejectedValueOnce({ status: 429, message: "quota exceeded" })
    const client = createClient(promptMock)

    // when / then - should throw without retrying
    await expect(
      promptWithModelSuggestionRetry(client, {
        path: { id: "session-1" },
        body: {
          parts: [{ type: "text", text: "hello" }],
          model: { providerID: "openai", modelID: "gpt-5.2" },
        },
      })
    ).rejects.toThrow()

    expect(promptMock).toHaveBeenCalledTimes(1)
  })

  it("should skip Anthropic and go directly to Bedrock when provider is cached as rate-limited", async () => {
    //#given - anthropic is already cached as rate-limited
    markProviderRateLimited("anthropic")
    const promptMock = mock().mockResolvedValueOnce(undefined)
    const client = createClient(promptMock)

    //#when - promptWithModelSuggestionRetry is called with anthropic model
    await promptWithModelSuggestionRetry(client, {
      path: { id: "session-1" },
      body: {
        agent: "sisyphus",
        parts: [{ type: "text", text: "hello" }],
        model: { providerID: "anthropic", modelID: "claude-opus-4-6" },
        noReply: true,
      },
    })

    //#then - should call prompt ONCE with bedrock (never tried anthropic)
    expect(promptMock).toHaveBeenCalledTimes(1)
    const callArg = promptMock.mock.calls[0]?.[0] as unknown
    const body = getCallBody(callArg)
    expect(body.model).toEqual({
      providerID: "amazon-bedrock",
      modelID: "claude-opus-4-6",
    })
  })

  it("should cache Anthropic as rate-limited after first quota error", async () => {
    //#given - fresh cache, first call hits quota error, second call succeeds via bedrock
    const promptMock = mock()
      .mockRejectedValueOnce({ status: 429, message: "insufficient_quota" })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
    const client = createClient(promptMock)

    //#when - first call triggers quota error → caches + retries with bedrock
    await promptWithModelSuggestionRetry(client, {
      path: { id: "session-1" },
      body: {
        parts: [{ type: "text", text: "hello" }],
        model: { providerID: "anthropic", modelID: "claude-opus-4-6" },
      },
    })

    // second call should skip anthropic entirely
    await promptWithModelSuggestionRetry(client, {
      path: { id: "session-2" },
      body: {
        parts: [{ type: "text", text: "world" }],
        model: { providerID: "anthropic", modelID: "claude-opus-4-6" },
      },
    })

    //#then - 3 calls total: 1st=anthropic(fail), 2nd=bedrock(success), 3rd=bedrock(cached skip)
    expect(promptMock).toHaveBeenCalledTimes(3)
    // Third call should be bedrock (cached)
    const thirdCallArg = promptMock.mock.calls[2]?.[0] as unknown
    const thirdBody = getCallBody(thirdCallArg)
    expect(thirdBody.model).toEqual({
      providerID: "amazon-bedrock",
      modelID: "claude-opus-4-6",
    })
  })

  it("should not skip non-Anthropic provider even when Anthropic is cached", async () => {
    //#given - anthropic is cached as rate-limited
    markProviderRateLimited("anthropic")
    const promptMock = mock().mockResolvedValueOnce(undefined)
    const client = createClient(promptMock)

    //#when - calling with openai provider (not anthropic)
    await promptWithModelSuggestionRetry(client, {
      path: { id: "session-1" },
      body: {
        parts: [{ type: "text", text: "hello" }],
        model: { providerID: "openai", modelID: "gpt-5.2" },
      },
    })

    //#then - should call openai normally (cache only affects anthropic)
    expect(promptMock).toHaveBeenCalledTimes(1)
    const callArg = promptMock.mock.calls[0]?.[0] as unknown
    const body = getCallBody(callArg)
    expect(body.model).toEqual({
      providerID: "openai",
      modelID: "gpt-5.2",
    })
  })
})

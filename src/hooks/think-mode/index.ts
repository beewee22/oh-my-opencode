import { detectThinkKeyword, extractPromptText } from "./detector"
import { isAlreadyHighVariant, getThinkingConfig } from "./switcher"
import type { ThinkModeState, ThinkModeInput } from "./types"
import { log } from "../../shared"

export * from "./detector"
export * from "./switcher"
export * from "./types"

const thinkModeState = new Map<string, ThinkModeState>()

export function clearThinkModeState(sessionID: string): void {
  thinkModeState.delete(sessionID)
}

export function createThinkModeHook() {
  return {
    "chat.params": async (
      output: ThinkModeInput,
      sessionID: string
    ): Promise<void> => {
      const promptText = extractPromptText(output.parts)

      const state: ThinkModeState = {
        requested: false,
        modelSwitched: false,
        thinkingConfigInjected: false,
      }

      if (!detectThinkKeyword(promptText)) {
        thinkModeState.set(sessionID, state)
        return
      }

      state.requested = true

      const currentModel = output.message.model
      if (!currentModel) {
        thinkModeState.set(sessionID, state)
        return
      }

      state.providerID = currentModel.providerID
      state.modelID = currentModel.modelID

      if (isAlreadyHighVariant(currentModel.modelID)) {
        thinkModeState.set(sessionID, state)
        return
      }

      const thinkingConfig = getThinkingConfig(currentModel.providerID, currentModel.modelID)

      // NOTE: We intentionally do NOT switch model IDs here.
      // The "-high" model IDs are an internal convention that is not guaranteed
      // to exist in provider model catalogs (Anthropic, Bedrock, OpenAI, etc.).
      // Think mode should be implemented via provider options (thinking/reasoning config)
      // to avoid "invalid model identifier" errors.

      if (thinkingConfig) {
        const messageData = output.message as Record<string, unknown>
        const agentThinking = messageData.thinking as { type?: string } | undefined
        const agentProviderOptions = messageData.providerOptions

        const agentDisabledThinking = agentThinking?.type === "disabled"
        const agentHasCustomProviderOptions = Boolean(agentProviderOptions)

        if (agentDisabledThinking) {
          log("Think mode: skipping - agent has thinking disabled", {
            sessionID,
            provider: currentModel.providerID,
          })
        } else if (agentHasCustomProviderOptions) {
          log("Think mode: skipping - agent has custom providerOptions", {
            sessionID,
            provider: currentModel.providerID,
          })
        } else {
          Object.assign(output.message, thinkingConfig)
          state.thinkingConfigInjected = true
          log("Think mode: thinking config injected", {
            sessionID,
            provider: currentModel.providerID,
            config: thinkingConfig,
          })
        }
      }

      thinkModeState.set(sessionID, state)
    },

    event: async ({ event }: { event: { type: string; properties?: unknown } }) => {
      if (event.type === "session.deleted") {
        const props = event.properties as { info?: { id?: string } } | undefined
        if (props?.info?.id) {
          thinkModeState.delete(props.info.id)
        }
      }
    },
  }
}

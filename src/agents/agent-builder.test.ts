import { describe, expect, test } from "bun:test"
import { buildAgent } from "./agent-builder"
import type { AgentConfig } from "@opencode-ai/sdk"
import type { DomainRestriction } from "../config/schema/custom-agents"

describe("buildAgent - domain restriction injection", () => {
  test("injects domain restriction section when restrictions provided", () => {
    const baseAgent: AgentConfig = {
      name: "test-agent",
      description: "Test agent",
      prompt: "Original prompt content",
    }

    const restrictions: DomainRestriction[] = [
      {
        domain: "kubernetes",
        restrictedTools: ["bash", "edit", "write"],
        ownerAgent: "k8s-owner",
      },
    ]

    const result = buildAgent(
      baseAgent,
      "claude-3-5-sonnet-20241022",
      undefined,
      undefined,
      undefined,
      undefined,
      restrictions
    )

    // Should prepend domain restriction section
    expect(result.prompt).toContain("## Domain Restrictions (MANDATORY)")
    expect(result.prompt).toContain("### kubernetes")
    expect(result.prompt).toContain("bash, edit, write WILL BE BLOCKED")
    expect(result.prompt).toContain('task(subagent_type="k8s-owner"')
    // Original prompt should still be present
    expect(result.prompt).toContain("Original prompt content")
    // Domain section should come before original prompt
    expect(result.prompt?.indexOf("## Domain Restrictions")).toBeLessThan(
      result.prompt?.indexOf("Original prompt content") ?? -1
    )
  })

  test("does not inject when restrictions array is empty", () => {
    const baseAgent: AgentConfig = {
      name: "test-agent",
      description: "Test agent",
      prompt: "Original prompt content",
    }

    const result = buildAgent(
      baseAgent,
      "claude-3-5-sonnet-20241022",
      undefined,
      undefined,
      undefined,
      undefined,
      []
    )

    // Should not contain domain restriction section
    expect(result.prompt).not.toContain("## Domain Restrictions")
    // Original prompt should be unchanged
    expect(result.prompt).toBe("Original prompt content")
  })

  test("does not inject when restrictions is undefined", () => {
    const baseAgent: AgentConfig = {
      name: "test-agent",
      description: "Test agent",
      prompt: "Original prompt content",
    }

    const result = buildAgent(
      baseAgent,
      "claude-3-5-sonnet-20241022",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined
    )

    // Should not contain domain restriction section
    expect(result.prompt).not.toContain("## Domain Restrictions")
    // Original prompt should be unchanged
    expect(result.prompt).toBe("Original prompt content")
  })

  test("injects domain restrictions after skills", () => {
    const baseAgent: AgentConfig = {
      name: "test-agent",
      description: "Test agent",
      prompt: "Original prompt content",
      skills: ["git-master"],
    }

    const restrictions: DomainRestriction[] = [
      {
        domain: "kubernetes",
        restrictedTools: ["bash"],
        ownerAgent: "k8s-owner",
      },
    ]

    const result = buildAgent(
      baseAgent,
      "claude-3-5-sonnet-20241022",
      undefined,
      undefined,
      undefined,
      undefined,
      restrictions
    )

    // Both skill content and domain restrictions should be present
    expect(result.prompt).toContain("## Domain Restrictions (MANDATORY)")
    expect(result.prompt).toContain("Original prompt content")

    // Domain restrictions should come after skills but before original prompt
    const domainIndex = result.prompt?.indexOf("## Domain Restrictions") ?? -1
    const originalIndex = result.prompt?.indexOf("Original prompt content") ?? -1
    expect(domainIndex).toBeGreaterThan(0)
    expect(domainIndex).toBeLessThan(originalIndex)
  })

  test("handles multiple domain restrictions", () => {
    const baseAgent: AgentConfig = {
      name: "test-agent",
      description: "Test agent",
      prompt: "Original prompt content",
    }

    const restrictions: DomainRestriction[] = [
      {
        domain: "kubernetes",
        restrictedTools: ["bash", "edit"],
        ownerAgent: "k8s-owner",
      },
      {
        domain: "git",
        restrictedTools: ["bash"],
        ownerAgent: "git-owner",
      },
    ]

    const result = buildAgent(
      baseAgent,
      "claude-3-5-sonnet-20241022",
      undefined,
      undefined,
      undefined,
      undefined,
      restrictions
    )

    // Should contain both restrictions
    expect(result.prompt).toContain("### kubernetes")
    expect(result.prompt).toContain("bash, edit WILL BE BLOCKED")
    expect(result.prompt).toContain('task(subagent_type="k8s-owner"')
    expect(result.prompt).toContain("### git")
    expect(result.prompt).toContain('task(subagent_type="git-owner"')
  })

  test("works with agent factory", () => {
    const agentFactory = Object.assign(
      (model: string): AgentConfig => ({
        name: "factory-agent",
        description: "Factory-created agent",
        prompt: "Factory prompt",
        model,
      }),
      { mode: "subagent" as const }
    )

    const restrictions: DomainRestriction[] = [
      {
        domain: "kubernetes",
        restrictedTools: ["bash"],
        ownerAgent: "k8s-owner",
      },
    ]

    const result = buildAgent(
      agentFactory,
      "claude-3-5-sonnet-20241022",
      undefined,
      undefined,
      undefined,
      undefined,
      restrictions
    )

    expect(result.prompt).toContain("## Domain Restrictions (MANDATORY)")
    expect(result.prompt).toContain("Factory prompt")
  })
})

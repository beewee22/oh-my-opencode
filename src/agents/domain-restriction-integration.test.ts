/// <reference types="bun-types" />

import { describe, it, expect } from "bun:test"
import { createBuiltinAgents } from "./builtin-agents"
import type { DomainRestriction } from "../config/schema/custom-agents"

/**
 * Integration tests for the complete domain restriction injection pipeline.
 *
 * This test suite verifies the end-to-end flow:
 * 1. Config defines domain_restrictions array
 * 2. createBuiltinAgents() receives restrictions
 * 3. buildAgent() injects restriction prompts into agent prompts
 * 4. Agents receive both proactive (prompt) and reactive (hook) enforcement
 *
 * DUAL-LAYER APPROACH:
 * - Proactive: Domain restriction prompts guide agents to delegate BEFORE attempting restricted operations
 * - Reactive: Enforcement hooks block restricted tool calls if agents ignore prompts
 *
 * This test suite focuses on the PROACTIVE layer (prompt injection).
 * Reactive enforcement is tested separately in git-write-enforcement.test.ts.
 */

describe("Domain Restriction Integration", () => {
  describe("with domain restrictions configured", () => {
    it("should inject git and k8s restrictions into all agent prompts", async () => {
      // #given: config with git and k8s domain restrictions
      const restrictions: DomainRestriction[] = [
        {
          domain: "Git Operations",
          ownerAgent: "git-owner",
          restrictedTools: ["bash (git commit)", "bash (git push)", "bash (git merge)"],
        },
        {
          domain: "Kubernetes Operations",
          ownerAgent: "k8s-owner",
          restrictedTools: ["bash (kubectl scale)", "bash (kubectl delete)", "bash (kubectl apply)"],
        },
      ]

      // #when: creating builtin agents with restrictions
      const agents = await createBuiltinAgents(
        [], // disabledAgents
        {}, // agentOverrides
        undefined, // directory
        "anthropic/claude-sonnet-4-5", // systemDefaultModel
        undefined, // categories
        undefined, // gitMasterConfig
        [], // discoveredSkills
        undefined, // customAgentSummaries
        undefined, // browserProvider
        undefined, // uiSelectedModel
        undefined, // disabledSkills
        restrictions // domainRestrictions
      )

      // #then: sisyphus and general agents should have domain restriction section in prompts
      const agentNames = Object.keys(agents)
      expect(agentNames.length).toBeGreaterThan(0)

      const sisyphus = agents["sisyphus"]
      expect(sisyphus).toBeDefined()
      expect(sisyphus.prompt).toContain("## Domain Restrictions (MANDATORY)")
      expect(sisyphus.prompt).toContain("### Git Operations")
      expect(sisyphus.prompt).toContain("git-owner")
      expect(sisyphus.prompt).toContain("### Kubernetes Operations")
      expect(sisyphus.prompt).toContain("k8s-owner")
      expect(sisyphus.prompt).toContain('task(subagent_type="git-owner"')
      expect(sisyphus.prompt).toContain('task(subagent_type="k8s-owner"')

      const oracle = agents["oracle"]
      if (oracle?.prompt) {
        expect(oracle.prompt).toContain("## Domain Restrictions (MANDATORY)")
        expect(oracle.prompt).toContain("### Git Operations")
        expect(oracle.prompt).toContain("### Kubernetes Operations")
      }
    })

    it("should inject cross-domain awareness (git-owner gets k8s restrictions, k8s-owner gets git restrictions)", async () => {
      // #given: config with git and k8s domain restrictions
      const restrictions: DomainRestriction[] = [
        {
          domain: "Git Operations",
          ownerAgent: "git-owner",
          restrictedTools: ["bash (git commit)"],
        },
        {
          domain: "Kubernetes Operations",
          ownerAgent: "k8s-owner",
          restrictedTools: ["bash (kubectl scale)"],
        },
      ]

      // #when: creating builtin agents with restrictions
      const agents = await createBuiltinAgents(
        [], // disabledAgents
        {}, // agentOverrides
        undefined, // directory
        "anthropic/claude-sonnet-4-5", // systemDefaultModel
        undefined, // categories
        undefined, // gitMasterConfig
        [], // discoveredSkills
        undefined, // customAgentSummaries
        undefined, // browserProvider
        undefined, // uiSelectedModel
        undefined, // disabledSkills
        restrictions // domainRestrictions
      )

      // #then: git-owner should know about k8s restrictions
      const gitOwner = agents["git-owner"]
      if (gitOwner?.prompt) {
        expect(gitOwner.prompt).toContain("### Kubernetes Operations")
        expect(gitOwner.prompt).toContain("k8s-owner")
      }

      // #then: k8s-owner should know about git restrictions
      const k8sOwner = agents["k8s-owner"]
      if (k8sOwner?.prompt) {
        expect(k8sOwner.prompt).toContain("### Git Operations")
        expect(k8sOwner.prompt).toContain("git-owner")
      }
    })
  })

  describe("without domain restrictions configured", () => {
    it("should create agents with clean prompts (no restriction section)", async () => {
      // #given: no domain restrictions
      const restrictions: DomainRestriction[] = []

      // #when: creating builtin agents without restrictions
      const agents = await createBuiltinAgents(
        [], // disabledAgents
        {}, // agentOverrides
        undefined, // directory
        "anthropic/claude-sonnet-4-5", // systemDefaultModel
        undefined, // categories
        undefined, // gitMasterConfig
        [], // discoveredSkills
        undefined, // customAgentSummaries
        undefined, // browserProvider
        undefined, // uiSelectedModel
        undefined, // disabledSkills
        restrictions // domainRestrictions (empty)
      )

      // #then: agents should NOT have domain restriction section
      const agentNames = Object.keys(agents)
      expect(agentNames.length).toBeGreaterThan(0)

      for (const agentName of agentNames) {
        const agent = agents[agentName]
        if (!agent.prompt) continue

        // Should NOT contain domain restriction header
        expect(agent.prompt).not.toContain("## Domain Restrictions (MANDATORY)")
      }
    })

    it("should create agents with clean prompts when restrictions is undefined", async () => {
      // #given: undefined domain restrictions
      // #when: creating builtin agents without restrictions
      const agents = await createBuiltinAgents(
        [], // disabledAgents
        {}, // agentOverrides
        undefined, // directory
        "anthropic/claude-sonnet-4-5", // systemDefaultModel
        undefined, // categories
        undefined, // gitMasterConfig
        [], // discoveredSkills
        undefined, // customAgentSummaries
        undefined, // browserProvider
        undefined, // uiSelectedModel
        undefined, // disabledSkills
        undefined // domainRestrictions (undefined)
      )

      // #then: agents should NOT have domain restriction section
      const agentNames = Object.keys(agents)
      expect(agentNames.length).toBeGreaterThan(0)

      for (const agentName of agentNames) {
        const agent = agents[agentName]
        if (!agent.prompt) continue

        // Should NOT contain domain restriction header
        expect(agent.prompt).not.toContain("## Domain Restrictions (MANDATORY)")
      }
    })
  })

  describe("hypothetical domain (terraform)", () => {
    it("should inject terraform restrictions without code changes (config-driven)", async () => {
      // #given: hypothetical terraform domain restriction
      const restrictions: DomainRestriction[] = [
        {
          domain: "Terraform Operations",
          ownerAgent: "terraform-owner",
          restrictedTools: ["bash (terraform apply)", "bash (terraform destroy)"],
        },
      ]

      // #when: creating builtin agents with terraform restrictions
      const agents = await createBuiltinAgents(
        [], // disabledAgents
        {}, // agentOverrides
        undefined, // directory
        "anthropic/claude-sonnet-4-5", // systemDefaultModel
        undefined, // categories
        undefined, // gitMasterConfig
        [], // discoveredSkills
        undefined, // customAgentSummaries
        undefined, // browserProvider
        undefined, // uiSelectedModel
        undefined, // disabledSkills
        restrictions // domainRestrictions
      )

      // #then: sisyphus should have terraform restriction section
      const sisyphus = agents["sisyphus"]
      expect(sisyphus).toBeDefined()
      expect(sisyphus.prompt).toContain("### Terraform Operations")
      expect(sisyphus.prompt).toContain("terraform-owner")
      expect(sisyphus.prompt).toContain('task(subagent_type="terraform-owner"')
    })
  })

  describe("prompt size constraints", () => {
    it("should keep restriction section under 1000 chars for 2 domains", async () => {
      // #given: config with 2 domain restrictions
      const restrictions: DomainRestriction[] = [
        {
          domain: "Git Operations",
          ownerAgent: "git-owner",
          restrictedTools: ["bash (git commit)", "bash (git push)", "bash (git merge)"],
        },
        {
          domain: "Kubernetes Operations",
          ownerAgent: "k8s-owner",
          restrictedTools: ["bash (kubectl scale)", "bash (kubectl delete)", "bash (kubectl apply)"],
        },
      ]

      // #when: creating builtin agents with restrictions
      const agents = await createBuiltinAgents(
        [], // disabledAgents
        {}, // agentOverrides
        undefined, // directory
        "anthropic/claude-sonnet-4-5", // systemDefaultModel
        undefined, // categories
        undefined, // gitMasterConfig
        [], // discoveredSkills
        undefined, // customAgentSummaries
        undefined, // browserProvider
        undefined, // uiSelectedModel
        undefined, // disabledSkills
        restrictions // domainRestrictions
      )

      // #then: restriction section should be under 1000 chars in sisyphus
      const sisyphus = agents["sisyphus"]
      expect(sisyphus).toBeDefined()

      const startMarker = "## Domain Restrictions (MANDATORY)"
      const startIndex = sisyphus.prompt!.indexOf(startMarker)
      expect(startIndex).toBeGreaterThan(-1)

      const afterStart = sisyphus.prompt!.slice(startIndex + startMarker.length)
      const nextSectionMatch = afterStart.match(/\n</)
      const restrictionSection = nextSectionMatch
        ? afterStart.slice(0, nextSectionMatch.index)
        : afterStart

      expect(restrictionSection.length).toBeLessThan(1000)
    })
  })
})

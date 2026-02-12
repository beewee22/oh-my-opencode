// src/tools/call-omo-agent/constants.test.ts
import { describe, expect, test } from "bun:test"
import { ALLOWED_AGENTS, BUILTIN_ALLOWED_AGENTS, CALL_OMO_AGENT_DESCRIPTION } from "./constants"

describe("ALLOWED_AGENTS", () => {
  test("includes git-owner agent", () => {
    // #given ALLOWED_AGENTS constant
    // #when checking for git-owner
    // #then git-owner should be in the array
    expect(ALLOWED_AGENTS).toContain("git-owner")
  })

  test("includes k8s-owner agent", () => {
    // #given ALLOWED_AGENTS constant
    // #when checking for k8s-owner
    // #then k8s-owner should be in the array
    expect(ALLOWED_AGENTS).toContain("k8s-owner")
  })

  test("includes all original agents", () => {
    // #given ALLOWED_AGENTS constant
    // #when checking for original agents
    // #then all original agents should still be present
    expect(ALLOWED_AGENTS).toContain("explore")
    expect(ALLOWED_AGENTS).toContain("librarian")
    expect(ALLOWED_AGENTS).toContain("oracle")
    expect(ALLOWED_AGENTS).toContain("hephaestus")
    expect(ALLOWED_AGENTS).toContain("metis")
    expect(ALLOWED_AGENTS).toContain("momus")
    expect(ALLOWED_AGENTS).toContain("multimodal-looker")
  })
})

describe("BUILTIN_ALLOWED_AGENTS", () => {
  test("remains unchanged with only explore and librarian", () => {
    // #given BUILTIN_ALLOWED_AGENTS constant
    // #when checking the builtin agents
    // #then should only contain explore and librarian
    expect(BUILTIN_ALLOWED_AGENTS).toEqual(["explore", "librarian"])
  })

  test("does not include owner agents", () => {
    // #given BUILTIN_ALLOWED_AGENTS constant
    // #when checking for owner agents
    // #then owner agents should not be in builtin list
    expect(BUILTIN_ALLOWED_AGENTS).not.toContain("git-owner")
    expect(BUILTIN_ALLOWED_AGENTS).not.toContain("k8s-owner")
  })

  test("does not include primary agents", () => {
    // #given BUILTIN_ALLOWED_AGENTS constant
    // #when checking for primary agents
    // #then primary agents should not be in builtin list
    expect(BUILTIN_ALLOWED_AGENTS).not.toContain("sisyphus")
    expect(BUILTIN_ALLOWED_AGENTS).not.toContain("atlas")
    expect(BUILTIN_ALLOWED_AGENTS).not.toContain("hephaestus")
    expect(BUILTIN_ALLOWED_AGENTS).not.toContain("prometheus")
  })
})

describe("CALL_OMO_AGENT_DESCRIPTION", () => {
  test("mentions owner agents in description", () => {
    // #given CALL_OMO_AGENT_DESCRIPTION constant
    // #when checking the description
    // #then should mention owner agents
    expect(CALL_OMO_AGENT_DESCRIPTION).toContain("owner")
  })

  test("includes placeholder for agents list", () => {
    // #given CALL_OMO_AGENT_DESCRIPTION constant
    // #when checking the description
    // #then should include {agents} placeholder
    expect(CALL_OMO_AGENT_DESCRIPTION).toContain("{agents}")
  })
})

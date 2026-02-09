import { describe, it, expect } from "bun:test"
import { DomainRestrictionSchema } from "./custom-agents"
import { OhMyOpenCodeConfigSchema } from "./oh-my-opencode-config"

describe("DomainRestrictionSchema", () => {
  it("should parse minimal domain restriction with required fields", () => {
    const minimal = {
      domain: "auth",
      ownerAgent: "oracle",
      restrictedTools: ["mcp_bash", "mcp_write"],
    }
    const result = DomainRestrictionSchema.parse(minimal)
    expect(result.domain).toBe("auth")
    expect(result.ownerAgent).toBe("oracle")
    expect(result.restrictedTools).toEqual(["mcp_bash", "mcp_write"])
  })

  it("should parse domain restriction with all optional fields", () => {
    const full = {
      domain: "auth",
      ownerAgent: "oracle",
      restrictedTools: ["mcp_bash"],
      description: "Authentication domain - only oracle can modify",
      allowedReadOps: ["mcp_read", "mcp_grep"],
      delegationTemplate: {
        subagentType: "oracle",
        loadSkills: ["git-master"],
      },
    }
    const result = DomainRestrictionSchema.parse(full)
    expect(result.domain).toBe("auth")
    expect(result.description).toBe("Authentication domain - only oracle can modify")
    expect(result.allowedReadOps).toEqual(["mcp_read", "mcp_grep"])
    expect(result.delegationTemplate?.subagentType).toBe("oracle")
    expect(result.delegationTemplate?.loadSkills).toEqual(["git-master"])
  })

  it("should allow optional description field", () => {
    const withDescription = {
      domain: "api",
      ownerAgent: "hephaestus",
      restrictedTools: ["mcp_bash"],
      description: "API layer - controlled modifications only",
    }
    const result = DomainRestrictionSchema.parse(withDescription)
    expect(result.description).toBe("API layer - controlled modifications only")
  })

  it("should allow optional allowedReadOps field", () => {
    const withReadOps = {
      domain: "database",
      ownerAgent: "librarian",
      restrictedTools: ["mcp_write"],
      allowedReadOps: ["mcp_read", "mcp_grep", "mcp_lsp_symbols"],
    }
    const result = DomainRestrictionSchema.parse(withReadOps)
    expect(result.allowedReadOps).toEqual(["mcp_read", "mcp_grep", "mcp_lsp_symbols"])
  })

  it("should allow optional delegationTemplate field", () => {
    const withTemplate = {
      domain: "frontend",
      ownerAgent: "frontend-ui-ux",
      restrictedTools: ["mcp_bash"],
      delegationTemplate: {
        subagentType: "frontend-ui-ux",
        loadSkills: ["playwright", "frontend-ui-ux"],
      },
    }
    const result = DomainRestrictionSchema.parse(withTemplate)
    expect(result.delegationTemplate?.subagentType).toBe("frontend-ui-ux")
    expect(result.delegationTemplate?.loadSkills).toEqual(["playwright", "frontend-ui-ux"])
  })

  it("should reject missing required fields", () => {
    const invalid = {
      domain: "auth",
      // missing ownerAgent and restrictedTools
    }
    expect(() => DomainRestrictionSchema.parse(invalid)).toThrow()
  })
})

describe("OhMyOpenCodeConfigSchema with domain_restrictions", () => {
  it("should parse config with domain_restrictions field", () => {
    const config = {
      domain_restrictions: [
        {
          domain: "auth",
          ownerAgent: "oracle",
          restrictedTools: ["mcp_bash"],
          description: "Authentication domain",
        },
        {
          domain: "api",
          ownerAgent: "hephaestus",
          restrictedTools: ["mcp_write"],
          allowedReadOps: ["mcp_read"],
        },
      ],
    }
    const result = OhMyOpenCodeConfigSchema.parse(config)
    expect(result.domain_restrictions).toBeDefined()
    expect(result.domain_restrictions?.length).toBe(2)
    expect(result.domain_restrictions?.[0].domain).toBe("auth")
    expect(result.domain_restrictions?.[1].domain).toBe("api")
  })

  it("should parse config without domain_restrictions (backward compatibility)", () => {
    const config = {
      default_run_agent: "sisyphus",
    }
    const result = OhMyOpenCodeConfigSchema.parse(config)
    expect(result.domain_restrictions).toBeUndefined()
    expect(result.default_run_agent).toBe("sisyphus")
  })

  it("should parse minimal config with empty domain_restrictions", () => {
    const config = {
      domain_restrictions: [],
    }
    const result = OhMyOpenCodeConfigSchema.parse(config)
    expect(result.domain_restrictions).toEqual([])
  })

  it("should parse full config with domain_restrictions and other fields", () => {
    const config = {
      default_run_agent: "sisyphus",
      disabled_tools: ["todowrite"],
      domain_restrictions: [
        {
          domain: "core",
          ownerAgent: "sisyphus",
          restrictedTools: ["mcp_bash"],
          description: "Core system domain",
          allowedReadOps: ["mcp_read", "mcp_grep"],
          delegationTemplate: {
            subagentType: "oracle",
            loadSkills: ["git-master"],
          },
        },
      ],
    }
    const result = OhMyOpenCodeConfigSchema.parse(config)
    expect(result.default_run_agent).toBe("sisyphus")
    expect(result.disabled_tools).toEqual(["todowrite"])
    expect(result.domain_restrictions?.length).toBe(1)
    expect(result.domain_restrictions?.[0].description).toBe("Core system domain")
  })
})

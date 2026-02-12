// src/agents/domain-restriction-prompt-builder.test.ts
import { describe, expect, test } from "bun:test";
import { buildDomainRestrictionSection } from "./domain-restriction-prompt-builder";

interface DomainRestriction {
  domain: string;
  ownerAgent: string;
  restrictedTools: string[];
}

describe("buildDomainRestrictionSection", () => {
  test("returns empty string for undefined input", () => {
    // #given undefined restrictions
    const input = undefined;

    // #when building section
    const result = buildDomainRestrictionSection(input as any);

    // #then returns empty string
    expect(result).toBe("");
  });

  test("returns empty string for empty array", () => {
    // #given empty restrictions array
    const input: DomainRestriction[] = [];

    // #when building section
    const result = buildDomainRestrictionSection(input);

    // #then returns empty string
    expect(result).toBe("");
  });

  test("includes mandatory header for non-empty restrictions", () => {
    // #given one domain restriction
    const input: DomainRestriction[] = [
      {
        domain: "git",
        ownerAgent: "git-owner",
        restrictedTools: ["mcp_bash"],
      },
    ];

    // #when building section
    const result = buildDomainRestrictionSection(input);

    // #then includes mandatory header
    expect(result).toContain("## Domain Restrictions (MANDATORY)");
  });

  test("lists domain name with assertive WILL BE BLOCKED language", () => {
    // #given one domain restriction
    const input: DomainRestriction[] = [
      {
        domain: "git",
        ownerAgent: "git-owner",
        restrictedTools: ["mcp_bash"],
      },
    ];

    // #when building section
    const result = buildDomainRestrictionSection(input);

    // #then includes domain name and assertive language
    expect(result).toContain("git");
    expect(result).toContain("WILL BE BLOCKED");
  });

  test("includes owner agent name for each domain", () => {
    // #given one domain restriction
    const input: DomainRestriction[] = [
      {
        domain: "git",
        ownerAgent: "git-owner",
        restrictedTools: ["mcp_bash"],
      },
    ];

    // #when building section
    const result = buildDomainRestrictionSection(input);

    // #then includes owner agent
    expect(result).toContain("git-owner");
  });

  test("includes allowed read operations list", () => {
    // #given one domain restriction
    const input: DomainRestriction[] = [
      {
        domain: "git",
        ownerAgent: "git-owner",
        restrictedTools: ["mcp_bash"],
      },
    ];

    // #when building section
    const result = buildDomainRestrictionSection(input);

    // #then includes allowed operations section
    expect(result).toContain("ALLOWED");
  });

  test("includes task() delegation template", () => {
    // #given one domain restriction
    const input: DomainRestriction[] = [
      {
        domain: "git",
        ownerAgent: "git-owner",
        restrictedTools: ["mcp_bash"],
      },
    ];

    // #when building section
    const result = buildDomainRestrictionSection(input);

    // #then includes task() template
    expect(result).toContain("task(");
  });

  test("includes complete delegation template with load_skills for git-owner", () => {
    // #given one domain restriction with git-owner
    const input: DomainRestriction[] = [
      {
        domain: "git",
        ownerAgent: "git-owner",
        restrictedTools: ["mcp_bash"],
      },
    ];

    // #when building section
    const result = buildDomainRestrictionSection(input);

    // #then includes complete template with git-master skill
    expect(result).toContain('load_skills=["git-master"]');
    expect(result).toContain("run_in_background=false");
    expect(result).toContain('prompt="[describe operation]"');
  });

  test("includes complete delegation template with empty load_skills for non-git-owner", () => {
    // #given one domain restriction with k8s-owner
    const input: DomainRestriction[] = [
      {
        domain: "infrastructure",
        ownerAgent: "k8s-owner",
        restrictedTools: ["kubectl"],
      },
    ];

    // #when building section
    const result = buildDomainRestrictionSection(input);

    // #then includes complete template with empty load_skills
    expect(result).toContain("load_skills=[]");
    expect(result).toContain("run_in_background=false");
    expect(result).toContain('prompt="[describe operation]"');
  });

  test("handles multiple domains without excessive length", () => {
    // #given two domain restrictions
    const input: DomainRestriction[] = [
      {
        domain: "git",
        ownerAgent: "git-owner",
        restrictedTools: ["mcp_bash"],
      },
      {
        domain: "infrastructure",
        ownerAgent: "infra-owner",
        restrictedTools: ["aws_cli", "kubectl"],
      },
    ];

    // #when building section
    const result = buildDomainRestrictionSection(input);

    // #then includes both domains and stays under 1000 chars
    expect(result).toContain("git");
    expect(result).toContain("infrastructure");
    expect(result.length).toBeLessThan(1000);
  });

  test("returns string without trailing newlines", () => {
    // #given one domain restriction
    const input: DomainRestriction[] = [
      {
        domain: "git",
        ownerAgent: "git-owner",
        restrictedTools: ["mcp_bash"],
      },
    ];

    // #when building section
    const result = buildDomainRestrictionSection(input);

    // #then result does not end with newline
    expect(result).not.toMatch(/\n$/);
  });
});

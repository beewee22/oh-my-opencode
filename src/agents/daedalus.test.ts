import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { createDaedalusAgent, DAEDALUS_PROMPT_METADATA } from "./daedalus"
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs"
import { resolve } from "path"
import { tmpdir } from "os"

describe("createDaedalusAgent", () => {
  let testDir: string

  beforeEach(() => {
    // Create temporary directory for test files
    testDir = resolve(tmpdir(), `daedalus-test-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    // Clean up test files
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  test("creates agent with default prompt when no config provided", () => {
    // given
    const model = "anthropic/claude-opus-4-5"
    const config = { model }

    // when
    const agent = createDaedalusAgent(model, config)

    // then
    expect(agent.prompt).toBeDefined()
    expect(agent.prompt).toContain("Daedalus")
    expect(agent.prompt).toContain("DevOps & Infrastructure Owner")
    expect(agent.mode).toBe("primary")
    expect(agent.temperature).toBe(0.3)
  })

  test("creates agent with custom OWNER.md when promptPath provided", () => {
    // given
    const ownerPath = resolve(testDir, "OWNER.md")
    writeFileSync(ownerPath, "# Custom Daedalus\nCustom content for infrastructure")

    const model = "anthropic/claude-opus-4-5"
    const config = {
      model,
      promptPath: ownerPath,
    }

    // when
    const agent = createDaedalusAgent(model, config)

    // then
    expect(agent.prompt).toContain("Custom Daedalus")
    expect(agent.prompt).toContain("Custom content for infrastructure")
  })

  test("loads constraints.yaml into prompt", () => {
    // given
    const constraintsPath = resolve(testDir, "constraints.yaml")
    writeFileSync(constraintsPath, "domain: devops-infra\nowner: daedalus\nsafety: high")

    const model = "anthropic/claude-opus-4-5"
    const config = {
      model,
      constraintsPath,
    }

    // when
    const agent = createDaedalusAgent(model, config)

    // then
    expect(agent.prompt).toContain("Constraints Reference")
    expect(agent.prompt).toContain("domain: devops-infra")
    expect(agent.prompt).toContain("owner: daedalus")
  })

  test("appends knowledge files to system prompt", () => {
    // given
    const knowledgePath = resolve(testDir, "aws-accounts.md")
    writeFileSync(knowledgePath, "# AWS Accounts\n\nProduction: 123456789012\nDevelopment: 987654321098")

    const model = "anthropic/claude-opus-4-5"
    const config = {
      model,
      knowledgePaths: [knowledgePath],
    }

    // when
    const agent = createDaedalusAgent(model, config)

    // then
    expect(agent.prompt).toContain("Company Conventions")
    expect(agent.prompt).toContain("AWS Accounts")
    expect(agent.prompt).toContain("Production: 123456789012")
  })

  test("handles multiple knowledge files in order", () => {
    // given
    const knowledge1Path = resolve(testDir, "aws-accounts.md")
    const knowledge2Path = resolve(testDir, "clusters.md")
    writeFileSync(knowledge1Path, "# AWS Accounts\nFirst knowledge file")
    writeFileSync(knowledge2Path, "# EKS Clusters\nSecond knowledge file")

    const model = "anthropic/claude-opus-4-5"
    const config = {
      model,
      knowledgePaths: [knowledge1Path, knowledge2Path],
    }

    // when
    const agent = createDaedalusAgent(model, config)

    // then
    expect(agent.prompt).toContain("AWS Accounts")
    expect(agent.prompt).toContain("First knowledge file")
    expect(agent.prompt).toContain("EKS Clusters")
    expect(agent.prompt).toContain("Second knowledge file")

    // Verify order: first knowledge file should appear before second
    expect(agent.prompt).toBeDefined()
    if (agent.prompt) {
      const firstIndex = agent.prompt.indexOf("First knowledge file")
      const secondIndex = agent.prompt.indexOf("Second knowledge file")
      expect(firstIndex).toBeLessThan(secondIndex)
    }
  })

  test("handles missing knowledge file gracefully", () => {
    // given
    const missingPath = resolve(testDir, "nonexistent.md")
    const model = "anthropic/claude-opus-4-5"
    const config = {
      model,
      knowledgePaths: [missingPath],
    }

    // when - should not throw
    const agent = createDaedalusAgent(model, config)

    // then - should still create agent with default prompt
    expect(agent.prompt).toBeDefined()
    expect(agent.prompt).toContain("Daedalus")
    // Missing file content should not be in prompt
    expect(agent.prompt).not.toContain("nonexistent")
  })

  test("combines owner, constraints, and knowledge files", () => {
    // given
    const ownerPath = resolve(testDir, "OWNER.md")
    const constraintsPath = resolve(testDir, "constraints.yaml")
    const knowledgePath = resolve(testDir, "conventions.md")

    writeFileSync(ownerPath, "# Custom Owner\nOwner content")
    writeFileSync(constraintsPath, "domain: devops-infra\nConstraints content")
    writeFileSync(knowledgePath, "# Infrastructure Conventions\nKnowledge content")

    const model = "anthropic/claude-opus-4-5"
    const config = {
      model,
      promptPath: ownerPath,
      constraintsPath,
      knowledgePaths: [knowledgePath],
    }

    // when
    const agent = createDaedalusAgent(model, config)

    // then
    expect(agent.prompt).toContain("Custom Owner")
    expect(agent.prompt).toContain("Owner content")
    expect(agent.prompt).toContain("Constraints Reference")
    expect(agent.prompt).toContain("Constraints content")
    expect(agent.prompt).toContain("Company Conventions")
    expect(agent.prompt).toContain("Knowledge content")
  })

  test("has correct mode and metadata", () => {
    // given
    const model = "anthropic/claude-opus-4-5"

    // when
    const agent = createDaedalusAgent(model, { model })

    // then
    expect(createDaedalusAgent.mode).toBe("primary")
    expect(agent.mode).toBe("primary")
    expect(DAEDALUS_PROMPT_METADATA.category).toBe("utility")
    expect(DAEDALUS_PROMPT_METADATA.cost).toBe("EXPENSIVE")
    expect(DAEDALUS_PROMPT_METADATA.promptAlias).toBe("Daedalus")
  })

  test("includes proper description", () => {
    // given
    const model = "anthropic/claude-opus-4-5"

    // when
    const agent = createDaedalusAgent(model, { model })

    // then
    expect(agent.description).toContain("DevOps")
    expect(agent.description).toContain("Infrastructure")
    expect(agent.description).toContain("Daedalus")
  })

   test("initializes decisions.jsonl if missing", () => {
     // given
     const decisionsPath = resolve(testDir, "decisions.jsonl")
     expect(existsSync(decisionsPath)).toBe(false)

     const model = "anthropic/claude-opus-4-5"
     const config = {
       model,
       decisionsPath,
     }

     // when
     createDaedalusAgent(model, config)

     // then
     expect(existsSync(decisionsPath)).toBe(true)
   })

   test("initializes lessons.jsonl if missing", () => {
     // given
     const lessonsPath = resolve(testDir, "lessons.jsonl")
     expect(existsSync(lessonsPath)).toBe(false)

     const model = "anthropic/claude-opus-4-5"
     const config = {
       model,
       lessonsPath,
     }

     // when
     createDaedalusAgent(model, config)

     // then
     expect(existsSync(lessonsPath)).toBe(true)
   })

   test("createDaedalusAgent works without lessonsPath (backward compat)", () => {
     // given
     const model = "anthropic/claude-opus-4-5"
     const config = {
       model,
       // No lessonsPath provided
     }

     // when
     const agent = createDaedalusAgent(model, config)

     // then - should create successfully without lessons
     expect(agent.prompt).toBeDefined()
     expect(agent.prompt).toContain("Daedalus")
     expect(agent.prompt).not.toContain("Lessons Learned")
   })
 })

describe("readRecentDecisions", () => {
  let testDir: string

  beforeEach(() => {
    testDir = resolve(tmpdir(), `daedalus-test-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  test("reads recent N decisions from decisions.jsonl", () => {
    // given
    const decisionsPath = resolve(testDir, "decisions.jsonl")
    const decisions: string[] = []
    for (let i = 1; i <= 25; i++) {
      decisions.push(JSON.stringify({ timestamp: `2026-02-10T10:${i.toString().padStart(2, "0")}:00Z`, operation: `op${i}`, decision: `Decision ${i}` }))
    }
    writeFileSync(decisionsPath, decisions.join("\n"))

    const model = "anthropic/claude-opus-4-5"
    const config = {
      model,
      decisionsPath,
    }

    // when
    const agent = createDaedalusAgent(model, config)

    // then - should include only the most recent 20 decisions
    expect(agent.prompt).toContain("Recent Decisions")
    expect(agent.prompt).toContain("Decision 25") // Most recent
    expect(agent.prompt).toContain("Decision 6") // 20th from end
    expect(agent.prompt).not.toContain("Decision 5") // Should be excluded (21st from end)
  })

  test("returns empty array for empty file", () => {
    // given
    const decisionsPath = resolve(testDir, "decisions.jsonl")
    writeFileSync(decisionsPath, "")

    const model = "anthropic/claude-opus-4-5"
    const config = {
      model,
      decisionsPath,
    }

    // when
    const agent = createDaedalusAgent(model, config)

    // then - should not include Recent Decisions section
    expect(agent.prompt).not.toContain("Recent Decisions")
  })

  test("returns empty array for nonexistent file", () => {
    // given
    const decisionsPath = resolve(testDir, "nonexistent.jsonl")

    const model = "anthropic/claude-opus-4-5"
    const config = {
      model,
      decisionsPath,
    }

    // when - should not throw
    const agent = createDaedalusAgent(model, config)

    // then - should not include Recent Decisions section
    expect(agent.prompt).toBeDefined()
    expect(agent.prompt).not.toContain("Recent Decisions")
  })

  test("skips invalid JSON lines", () => {
    // given
    const decisionsPath = resolve(testDir, "decisions.jsonl")
    const lines = [
      JSON.stringify({ timestamp: "2026-02-10T10:01:00Z", operation: "scale", decision: "Decision 1" }),
      "not json",
      JSON.stringify({ timestamp: "2026-02-10T10:02:00Z", operation: "deploy", decision: "Decision 2" }),
      "",
      JSON.stringify({ timestamp: "2026-02-10T10:03:00Z", operation: "rollback", decision: "Decision 3" }),
      "{ incomplete json",
    ]
    writeFileSync(decisionsPath, lines.join("\n"))

    const model = "anthropic/claude-opus-4-5"
    const config = {
      model,
      decisionsPath,
    }

    // when
    const agent = createDaedalusAgent(model, config)

    // then - should include only valid decisions
    expect(agent.prompt).toContain("Recent Decisions")
    expect(agent.prompt).toContain("Decision 1")
    expect(agent.prompt).toContain("Decision 2")
    expect(agent.prompt).toContain("Decision 3")
    expect(agent.prompt).not.toContain("not json")
    expect(agent.prompt).not.toContain("incomplete json")
  })

  test("returns all when fewer than maxEntries", () => {
    // given
    const decisionsPath = resolve(testDir, "decisions.jsonl")
    const decisions = [
      JSON.stringify({ timestamp: "2026-02-10T10:01:00Z", operation: "scale", decision: "Decision 1" }),
      JSON.stringify({ timestamp: "2026-02-10T10:02:00Z", operation: "deploy", decision: "Decision 2" }),
      JSON.stringify({ timestamp: "2026-02-10T10:03:00Z", operation: "rollback", decision: "Decision 3" }),
      JSON.stringify({ timestamp: "2026-02-10T10:04:00Z", operation: "restart", decision: "Decision 4" }),
      JSON.stringify({ timestamp: "2026-02-10T10:05:00Z", operation: "update", decision: "Decision 5" }),
    ]
    writeFileSync(decisionsPath, decisions.join("\n"))

    const model = "anthropic/claude-opus-4-5"
    const config = {
      model,
      decisionsPath,
    }

    // when
    const agent = createDaedalusAgent(model, config)

    // then - should include all 5 decisions
    expect(agent.prompt).toContain("Recent Decisions")
    expect(agent.prompt).toContain("Decision 1")
    expect(agent.prompt).toContain("Decision 2")
    expect(agent.prompt).toContain("Decision 3")
    expect(agent.prompt).toContain("Decision 4")
    expect(agent.prompt).toContain("Decision 5")
  })
})

describe("readRecentLessons", () => {
  let testDir: string

  beforeEach(() => {
    testDir = resolve(tmpdir(), `daedalus-test-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  test("reads lessons from lessons.jsonl file", () => {
    // given
    const lessonsPath = resolve(testDir, "lessons.jsonl")
    const lessons: string[] = []
    for (let i = 1; i <= 5; i++) {
      lessons.push(JSON.stringify({ timestamp: `2026-02-10T10:${i.toString().padStart(2, "0")}:00Z`, source: "user-feedback", lesson: `Lesson ${i}`, context: `Context ${i}`, confidence: "high" }))
    }
    writeFileSync(lessonsPath, lessons.join("\n"))

    const model = "anthropic/claude-opus-4-5"
    const config = {
      model,
      lessonsPath,
    }

    // when
    const agent = createDaedalusAgent(model, config)

    // then
    expect(agent.prompt).toContain("Lessons Learned")
    expect(agent.prompt).toContain("Lesson 1")
    expect(agent.prompt).toContain("Lesson 5")
  })

  test("returns empty array for empty file", () => {
    // given
    const lessonsPath = resolve(testDir, "lessons.jsonl")
    writeFileSync(lessonsPath, "")

    const model = "anthropic/claude-opus-4-5"
    const config = {
      model,
      lessonsPath,
    }

    // when
    const agent = createDaedalusAgent(model, config)

    // then
    expect(agent.prompt).not.toContain("Lessons Learned")
  })

  test("returns empty array for nonexistent file", () => {
    // given
    const lessonsPath = resolve(testDir, "nonexistent.jsonl")

    const model = "anthropic/claude-opus-4-5"
    const config = {
      model,
      lessonsPath,
    }

    // when
    const agent = createDaedalusAgent(model, config)

    // then
    expect(agent.prompt).toBeDefined()
    expect(agent.prompt).not.toContain("Lessons Learned")
  })

  test("skips invalid JSON lines silently", () => {
    // given
    const lessonsPath = resolve(testDir, "lessons.jsonl")
    const lines = [
      JSON.stringify({ timestamp: "2026-02-10T10:01:00Z", source: "user-feedback", lesson: "Lesson 1", context: "Context 1", confidence: "high" }),
      "not json",
      JSON.stringify({ timestamp: "2026-02-10T10:02:00Z", source: "user-feedback", lesson: "Lesson 2", context: "Context 2", confidence: "high" }),
      "",
      JSON.stringify({ timestamp: "2026-02-10T10:03:00Z", source: "user-feedback", lesson: "Lesson 3", context: "Context 3", confidence: "high" }),
      "{ incomplete json",
    ]
    writeFileSync(lessonsPath, lines.join("\n"))

    const model = "anthropic/claude-opus-4-5"
    const config = {
      model,
      lessonsPath,
    }

    // when
    const agent = createDaedalusAgent(model, config)

    // then
    expect(agent.prompt).toContain("Lessons Learned")
    expect(agent.prompt).toContain("Lesson 1")
    expect(agent.prompt).toContain("Lesson 2")
    expect(agent.prompt).toContain("Lesson 3")
    expect(agent.prompt).not.toContain("not json")
    expect(agent.prompt).not.toContain("incomplete json")
  })

  test("respects maxEntries limit (truncates to last N)", () => {
    // given
    const lessonsPath = resolve(testDir, "lessons.jsonl")
    const lessons: string[] = []
    for (let i = 1; i <= 25; i++) {
      lessons.push(JSON.stringify({ timestamp: `2026-02-10T10:${(i % 60).toString().padStart(2, "0")}:00Z`, source: "user-feedback", lesson: `Lesson ${i}`, context: `Context ${i}`, confidence: "high" }))
    }
    writeFileSync(lessonsPath, lessons.join("\n"))

    const model = "anthropic/claude-opus-4-5"
    const config = {
      model,
      lessonsPath,
    }

    // when
    const agent = createDaedalusAgent(model, config)

    // then - should include only the most recent 20 lessons
    expect(agent.prompt).toContain("Lessons Learned")
    expect(agent.prompt).toContain("Lesson 25") // Most recent
    expect(agent.prompt).toContain("Lesson 6") // 20th from end
    expect(agent.prompt).not.toContain("Lesson 5") // Should be excluded (21st from end)
  })

  test("handles mixed valid/invalid entries", () => {
    // given
    const lessonsPath = resolve(testDir, "lessons.jsonl")
    const lines = [
      JSON.stringify({ timestamp: "2026-02-10T10:01:00Z", source: "user-feedback", lesson: "Valid 1", context: "Context 1", confidence: "high" }),
      "garbage line",
      JSON.stringify({ timestamp: "2026-02-10T10:02:00Z", source: "user-feedback", lesson: "Valid 2", context: "Context 2", confidence: "medium" }),
      "",
      "{ broken",
      JSON.stringify({ timestamp: "2026-02-10T10:03:00Z", source: "user-feedback", lesson: "Valid 3", context: "Context 3", confidence: "low" }),
      "null",
      JSON.stringify({ timestamp: "2026-02-10T10:04:00Z", source: "user-feedback", lesson: "Valid 4", context: "Context 4", confidence: "high" }),
    ]
    writeFileSync(lessonsPath, lines.join("\n"))

    const model = "anthropic/claude-opus-4-5"
    const config = {
      model,
      lessonsPath,
    }

    // when
    const agent = createDaedalusAgent(model, config)

    // then
    expect(agent.prompt).toContain("Lessons Learned")
    expect(agent.prompt).toContain("Valid 1")
    expect(agent.prompt).toContain("Valid 2")
    expect(agent.prompt).toContain("Valid 3")
    expect(agent.prompt).toContain("Valid 4")
    expect(agent.prompt).not.toContain("garbage line")
    expect(agent.prompt).not.toContain("broken")
  })
})

describe("buildSystemPrompt with decisions", () => {
  let testDir: string

  beforeEach(() => {
    testDir = resolve(tmpdir(), `daedalus-test-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  test("includes Recent Decisions section when decisions provided", () => {
    // given
    const decisionsPath = resolve(testDir, "decisions.jsonl")
    const decision = JSON.stringify({ timestamp: "2026-02-10T10:00:00Z", operation: "scale", decision: "Scaled to 5 replicas" })
    writeFileSync(decisionsPath, decision)

    const model = "anthropic/claude-opus-4-5"
    const config = {
      model,
      decisionsPath,
    }

    // when
    const agent = createDaedalusAgent(model, config)

    // then
    expect(agent.prompt).toContain("## Recent Decisions (Auto-loaded)")
    expect(agent.prompt).toContain("최근 기록된 결정 사항입니다")
    expect(agent.prompt).toContain("Scaled to 5 replicas")
  })

  test("omits Recent Decisions section when empty array", () => {
    // given
    const decisionsPath = resolve(testDir, "decisions.jsonl")
    writeFileSync(decisionsPath, "")

    const model = "anthropic/claude-opus-4-5"
    const config = {
      model,
      decisionsPath,
    }

    // when
    const agent = createDaedalusAgent(model, config)

    // then
    expect(agent.prompt).not.toContain("Recent Decisions")
    expect(agent.prompt).not.toContain("최근 기록된 결정 사항입니다")
  })

   test("omits Recent Decisions section when undefined", () => {
     // given
     const model = "anthropic/claude-opus-4-5"
     const config = {
       model,
       // No decisionsPath provided
     }

     // when
     const agent = createDaedalusAgent(model, config)

     // then
     expect(agent.prompt).not.toContain("Recent Decisions")
     expect(agent.prompt).not.toContain("최근 기록된 결정 사항입니다")
   })
 })

 describe("buildSystemPrompt with lessons", () => {
   let testDir: string

   beforeEach(() => {
     testDir = resolve(tmpdir(), `daedalus-test-${Date.now()}`)
     mkdirSync(testDir, { recursive: true })
   })

   afterEach(() => {
     if (existsSync(testDir)) {
       rmSync(testDir, { recursive: true, force: true })
     }
   })

   test("includes Lessons Learned section when lessons provided", () => {
     // given
     const lessonsPath = resolve(testDir, "lessons.jsonl")
     const lesson = JSON.stringify({ timestamp: "2026-02-10T10:00:00Z", source: "user-feedback", lesson: "Always check KEDA before scaling", context: "HPA conflicts", confidence: "high" })
     writeFileSync(lessonsPath, lesson)

     const model = "anthropic/claude-opus-4-5"
     const config = {
       model,
       lessonsPath,
     }

     // when
     const agent = createDaedalusAgent(model, config)

     // then
     expect(agent.prompt).toContain("## Lessons Learned (Auto-loaded)")
     expect(agent.prompt).toContain("사용자 피드백에서 학습한 교훈입니다")
     expect(agent.prompt).toContain("Always check KEDA before scaling")
   })

   test("omits Lessons Learned section when empty array", () => {
     // given
     const lessonsPath = resolve(testDir, "lessons.jsonl")
     writeFileSync(lessonsPath, "")

     const model = "anthropic/claude-opus-4-5"
     const config = {
       model,
       lessonsPath,
     }

     // when
     const agent = createDaedalusAgent(model, config)

     // then
     expect(agent.prompt).not.toContain("Lessons Learned")
     expect(agent.prompt).not.toContain("사용자 피드백에서 학습한 교훈입니다")
   })

   test("includes both decisions and lessons in prompt", () => {
     // given
     const decisionsPath = resolve(testDir, "decisions.jsonl")
     const lessonsPath = resolve(testDir, "lessons.jsonl")

     const decision = JSON.stringify({ timestamp: "2026-02-10T10:00:00Z", operation: "scale", decision: "Scaled to 5 replicas" })
     const lesson = JSON.stringify({ timestamp: "2026-02-10T10:00:00Z", source: "user-feedback", lesson: "Always check KEDA before scaling", context: "HPA conflicts", confidence: "high" })

     writeFileSync(decisionsPath, decision)
     writeFileSync(lessonsPath, lesson)

     const model = "anthropic/claude-opus-4-5"
     const config = {
       model,
       decisionsPath,
       lessonsPath,
     }

     // when
     const agent = createDaedalusAgent(model, config)

     // then
     expect(agent.prompt).toContain("## Recent Decisions (Auto-loaded)")
     expect(agent.prompt).toContain("Scaled to 5 replicas")
     expect(agent.prompt).toContain("## Lessons Learned (Auto-loaded)")
     expect(agent.prompt).toContain("Always check KEDA before scaling")

     // Verify lessons section appears after decisions section
     if (agent.prompt) {
       const decisionsIndex = agent.prompt.indexOf("## Recent Decisions")
       const lessonsIndex = agent.prompt.indexOf("## Lessons Learned")
       expect(decisionsIndex).toBeLessThan(lessonsIndex)
     }
   })
 })

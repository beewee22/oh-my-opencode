# Git Owner 에이전트 등록 문제 해결

**작성일**: 2026-02-09  
**문제**: git-owner 에이전트가 `task(subagent_type="git-owner", ...)` 호출 시 "Unknown agent" 에러 발생  
**상태**: ✅ 해결됨

---

## 문제 분석

### 증상
```typescript
task(subagent_type="git-owner", load_skills=["git-master"], prompt="...")
```
호출 시 다음 에러 발생:
```
Error: Unknown agent: git-owner
Available agents: build, explore, general, librarian, metis, momus, multimodal-looker, oracle, plan, prometheus, sisyphus-junior
```

### 근본 원인

git-owner 에이전트가 OpenCode SDK의 `client.app.agents()` 목록에 나타나지 않았던 이유:

1. **에이전트 등록은 완료됨**:
   - `src/agents/git-owner.ts`: 에이전트 팩토리 함수 구현 ✅
   - `src/agents/builtin-agents.ts`: `agentSources`에 등록 ✅
   - `src/agents/builtin-agents.ts`: `agentMetadata`에 등록 ✅
   - `src/config/schema/agent-names.ts`: 스키마에 추가 ✅
   - `src/agents/types.ts`: 타입에 추가 ✅

2. **모델 요구사항 누락** ❌:
   - `src/shared/model-requirements.ts`의 `AGENT_MODEL_REQUIREMENTS`에 git-owner가 **없었음**
   - `collectPendingBuiltinAgents()` 함수가 각 에이전트에 대해 모델 해상도를 시도
   - 모델 요구사항이 없으면 `applyModelResolution()`이 `null` 반환
   - `if (!resolution) continue` 로직에 의해 에이전트가 **건너뛰어짐**

### 코드 흐름 분석

**`src/agents/builtin-agents/general-agents.ts`의 `collectPendingBuiltinAgents()` 함수**:

```typescript
for (const [name, source] of Object.entries(agentSources)) {
  const agentName = name as BuiltinAgentName
  
  // 특수 에이전트 제외 (sisyphus, hephaestus, atlas는 별도 처리)
  if (agentName === "sisyphus") continue
  if (agentName === "hephaestus") continue
  if (agentName === "atlas") continue
  
  const requirement = AGENT_MODEL_REQUIREMENTS[agentName]  // ← git-owner는 undefined
  
  const resolution = applyModelResolution({
    uiSelectedModel: ...,
    userModel: override?.model,
    requirement,  // ← undefined이면 해상도 실패
    availableModels,
    systemDefaultModel,
  })
  
  if (!resolution) continue  // ← git-owner가 여기서 건너뛰어짐!
  
  // ... 에이전트 설정 생성
  pendingAgentConfigs.set(name, config)
}
```

---

## 해결 방법

### 수정 파일: `src/shared/model-requirements.ts`

git-owner를 `BUILTIN_AGENT_MODEL_REQUIREMENTS`에 추가:

```typescript
const BUILTIN_AGENT_MODEL_REQUIREMENTS: Record<string, ModelRequirement> = {
  // ... 기존 에이전트들 ...
  
  atlas: {
    fallbackChain: [
      { providers: ["kimi-for-coding"], model: "k2p5" },
      { providers: ["opencode"], model: "kimi-k2.5-free" },
      { providers: ["anthropic", "github-copilot", "opencode"], model: "claude-sonnet-4-5" },
      { providers: ["openai", "github-copilot", "opencode"], model: "gpt-5.2" },
      { providers: ["google", "github-copilot", "opencode"], model: "gemini-3-pro" },
    ],
  },
  
  // ✅ 추가됨
  "git-owner": {
    fallbackChain: [
      { providers: ["anthropic", "github-copilot", "opencode"], model: "claude-sonnet-4-5" },
      { providers: ["openai", "github-copilot", "opencode"], model: "gpt-5.2" },
      { providers: ["google", "github-copilot", "opencode"], model: "gemini-3-flash" },
    ],
  },
}
```

### 모델 선택 근거

**Claude Sonnet 4.5** (1순위):
- Git 작업은 정확성이 중요 (커밋 메시지, 브랜치 관리)
- Claude는 지시사항 준수에 강함
- 비용 효율적 (Opus보다 저렴, Haiku보다 정확)

**GPT-5.2** (2순위):
- 범용 작업에 안정적
- Anthropic 모델 사용 불가 시 대체

**Gemini 3 Flash** (3순위):
- 빠르고 저렴한 대체 옵션
- Git 작업은 복잡한 추론이 필요 없으므로 Flash로도 충분

---

## 검증 방법

### 1. 빌드 및 재설치
```bash
cd /Users/jay.jung/sub-project/oh-my-opencode
bun run build
cd .opencode
bun install
```

### 2. OpenCode 재시작
```bash
# OpenCode 완전 종료 후 재시작
```

### 3. 에이전트 목록 확인
git-owner가 사용 가능한 에이전트 목록에 나타나야 함:
```typescript
task(subagent_type="git-owner", load_skills=["git-master"], prompt="...")
// ✅ 이제 작동해야 함
```

### 4. 실제 커밋 테스트
```typescript
task(
  subagent_type="git-owner",
  load_skills=["git-master"],
  prompt="Commit the following files to dev branch:
  - docs/SESSION_SUMMARY_2026-02-09.md
  - docs/DOMAIN_OWNER_DEVELOPMENT_HISTORY.md
  - docs/GIT_COMMIT_GUARD_USER_GUIDE.md
  
  Use conventional commit format."
)
```

---

## 교훈

### 새 에이전트 추가 시 체크리스트

1. ✅ **에이전트 구현**: `src/agents/{agent-name}.ts`
   - `createXXXAgent(model: string): AgentConfig` 팩토리 함수
   - `XXX_PROMPT_METADATA: AgentPromptMetadata` 메타데이터
   - `mode: "subagent" | "primary"` 설정

2. ✅ **타입 시스템 등록**:
   - `src/config/schema/agent-names.ts`: `BuiltinAgentNameSchema`, `OverridableAgentNameSchema`
   - `src/agents/types.ts`: `BuiltinAgentName` 타입

3. ✅ **에이전트 레지스트리 등록**:
   - `src/agents/builtin-agents.ts`: `agentSources`에 팩토리 추가
   - `src/agents/builtin-agents.ts`: `agentMetadata`에 메타데이터 추가

4. ✅ **모델 요구사항 정의** ⭐ **중요!**:
   - `src/shared/model-requirements.ts`: `BUILTIN_AGENT_MODEL_REQUIREMENTS`에 추가
   - 적절한 fallback chain 설정 (최소 1개 이상의 모델)

5. ✅ **빌드 및 테스트**:
   - `bun run build` 성공 확인
   - `.opencode/`에서 `bun install` 재설치
   - OpenCode 재시작 후 에이전트 호출 테스트

### 놓치기 쉬운 부분

**모델 요구사항 누락**이 가장 흔한 실수:
- 에이전트가 코드상으로는 완벽하게 구현되어 있어도
- `AGENT_MODEL_REQUIREMENTS`에 없으면 런타임에서 **무시됨**
- 에러 메시지도 명확하지 않음 ("Unknown agent")
- 디버깅이 어려움 (등록은 되어 있는데 목록에 안 나타남)

---

## 관련 파일

### 수정된 파일
- `src/shared/model-requirements.ts` - git-owner 모델 요구사항 추가

### 이전에 수정된 파일 (이미 완료)
- `src/agents/git-owner.ts` - 에이전트 구현
- `src/config/schema/agent-names.ts` - 스키마 등록
- `src/agents/types.ts` - 타입 정의
- `src/agents/builtin-agents.ts` - 레지스트리 등록
- `src/hooks/claude-code-hooks/handlers/tool-execute-before-handler.ts` - 에이전트 전달 버그 수정

### 참고 파일
- `src/agents/builtin-agents/general-agents.ts` - `collectPendingBuiltinAgents()` 로직
- `src/agents/builtin-agents/model-resolution.ts` - `applyModelResolution()` 로직

---

## 다음 단계

1. ✅ OpenCode 재시작
2. ⏳ git-owner 에이전트 호출 테스트
3. ⏳ 실제 커밋 실행 (3개 문서 파일)
4. ⏳ git-write-enforcement Hook이 다른 에이전트는 여전히 차단하는지 확인
5. ⏳ Domain Owner 시스템 완전성 검증

---

**작성자**: Atlas (Master Orchestrator)  
**검토 필요**: git-owner 에이전트 호출 성공 여부

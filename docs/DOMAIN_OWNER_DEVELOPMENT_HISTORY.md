# Domain Owner 시스템 개발 히스토리

**작성일**: 2026-02-09  
**작성자**: jay.jung  
**저장소**: oh-my-opencode (fork), domain-owners  

---

## 📋 목차

1. [개요](#개요)
2. [왜 Domain Owner가 필요했나?](#왜-domain-owner가-필요했나)
3. [설계 철학](#설계-철학)
4. [아키텍처](#아키텍처)
5. [구현 과정](#구현-과정)
6. [주요 컴포넌트](#주요-컴포넌트)
7. [테스트 전략](#테스트-전략)
8. [배운 점과 개선 사항](#배운-점과-개선-사항)
9. [향후 계획](#향후-계획)

---

## 개요

**Domain Owner 시스템**은 oh-my-opencode 플러그인에서 **도메인별 전문 에이전트**를 등록하고 관리하는 거버넌스 시스템입니다.

### 핵심 개념

- **Exclusive Ownership**: 각 도메인(git, k8s, testing 등)은 하나의 owner 에이전트가 독점적으로 관리
- **Convention Enforcement**: 규칙을 기계 판독 가능한 형태(`constraints.yaml`)로 정의하고 강제 적용
- **Decision Tracking**: 모든 중요한 결정을 `decisions.jsonl`에 기록하여 감사 추적 가능
- **Incident Learning**: 과거 실패 사례를 `incidents.md`에 문서화하여 재발 방지

### 구현 범위

| 도메인 | 상태 | 설명 |
|--------|------|------|
| **git-owner** | ✅ 완료 | Git 작업, 커밋, 브랜치, PR 관리 |
| **k8s-owner** | ✅ 완료 | Kubectl 명령어, 네임스페이스, 리소스 관리 |
| infrastructure-owner | 🔜 계획 | AWS, Kubernetes, 네트워킹 |
| testing-owner | 🔜 계획 | 테스트 전략, 커버리지, CI/CD |
| documentation-owner | 🔜 계획 | 문서 표준, API 문서, 예제 |
| security-owner | 🔜 계획 | 보안 관행, 시크릿, 접근 제어 |

---

## 왜 Domain Owner가 필요했나?

### 문제 상황

oh-my-opencode는 다양한 AI 에이전트(Sisyphus, Atlas, Prometheus 등)를 조율하는 오케스트레이션 시스템입니다. 하지만 **도메인별 전문 지식과 규칙 강제**가 부족했습니다:

#### 1. Git 작업의 무질서

**문제**:
- 에이전트들이 각자 `git commit`, `git push`를 실행
- 커밋 메시지 컨벤션 무시 (Conventional Commits 미준수)
- 시크릿 파일(`.env`, `.pem`) 커밋 위험
- 회사 저장소 규칙(JIRA 티켓, 한국어 메시지) 미적용

**영향**:
- 커밋 히스토리 오염
- 보안 사고 위험
- 팀 협업 혼란

#### 2. Kubernetes 작업의 위험성

**문제**:
- 프로덕션 네임스페이스에 무분별한 `kubectl delete` 실행
- Dry-run 없이 바로 적용
- 리소스 할당 제한 무시

**영향**:
- 프로덕션 장애 위험
- 비용 폭증 가능성

#### 3. 규칙 강제의 어려움

**문제**:
- 에이전트 프롬프트에 규칙을 텍스트로 작성 → 무시되기 쉬움
- 규칙 변경 시 여러 에이전트 프롬프트 수정 필요
- 규칙 위반 감지 불가능

**영향**:
- 일관성 없는 동작
- 유지보수 부담

---

## 설계 철학

### 1. Separation of Concerns

**원칙**: 도메인 지식과 플러그인 코드를 분리

```
oh-my-opencode (fork)
  ↓ 제공
  - 에이전트 등록 API
  - Hook 시스템
  - 스킬 로딩 메커니즘

domain-owners (별도 저장소)
  ↓ 제공
  - 도메인별 지식 (OWNER.md)
  - 규칙 정의 (constraints.yaml)
  - 결정 기록 (decisions.jsonl)
```

**이점**:
- Fork 오염 방지 (도메인 지식이 플러그인 코드와 섞이지 않음)
- 도메인 추가 시 fork 수정 불필요
- 여러 팀이 독립적으로 Domain Owner 관리 가능

---

### 2. Enforcement over Advisory

**원칙**: 조언이 아닌 강제

| 기존 방식 (Advisory) | Domain Owner (Enforcement) |
|---------------------|---------------------------|
| "커밋 메시지는 Conventional Commits를 따르세요" | `git commit` 실행 전 메시지 검증 → 실패 시 차단 |
| "시크릿 파일은 커밋하지 마세요" | `.env`, `.pem` 파일 감지 → 커밋 차단 |
| "프로덕션에서는 dry-run을 사용하세요" | `kubectl apply` 실행 전 `--dry-run` 플래그 확인 → 없으면 차단 |

**구현 방식**:
- **PreToolUse Hook**: 도구 실행 전 인터셉트
- **Validation Pipeline**: 규칙 검증 → 통과 시에만 실행
- **Blocking**: 규칙 위반 시 에러 throw + 실행 차단

---

### 3. Machine-Readable Rules

**원칙**: 규칙을 코드로 표현

**constraints.yaml 예시**:
```yaml
commit_message:
  format: "conventional_commits"
  types: [feat, fix, refactor, docs, test, chore, style, perf, ci, build]
  subject_max_length: 50
  company_repos:
    jira_required: true
    language: "korean"
    co_authored_by_required: true

forbidden_files:
  patterns:
    - "*.env"
    - "*.pem"
    - "*.key"
    - "tmp/**"
    - "*.tfstate"
    - "node_modules/**"
```

**이점**:
- 파싱 가능 → 자동 검증
- 버전 관리 가능 → Git으로 추적
- 테스트 가능 → 규칙 변경 시 회귀 테스트

---

### 4. Decision Tracking

**원칙**: 모든 중요한 결정을 기록

**decisions.jsonl 예시**:
```jsonl
{"timestamp":"2026-02-04T10:30:00Z","agent":"git-owner","operation":"commit","context":"feat: add user authentication","decision":"approved","reason":"follows conventional commits, no secrets detected"}
{"timestamp":"2026-02-04T11:15:00Z","agent":"git-owner","operation":"commit","context":"add .env file","decision":"rejected","reason":"forbidden file pattern: .env"}
```

**이점**:
- 감사 추적 (Audit Trail)
- 디버깅 용이 (왜 차단되었는지 기록)
- 학습 데이터 (미래 개선에 활용)

---

## 아키텍처

### 전체 구조

```
┌─────────────────────────────────────────────────────────────┐
│                     oh-my-opencode                          │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Agent Registration API                     │  │
│  │  - createCustomAgent()                               │  │
│  │  - registerAgent()                                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ↓                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Hook System (PreToolUse)                   │  │
│  │  - git-write-enforcement.ts                          │  │
│  │  - git-commit-validator.ts                           │  │
│  │  - kubectl-enforcement.ts                            │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ↓                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Command Classifiers                        │  │
│  │  - git-command-classifier.ts                         │  │
│  │  - kubectl-command-classifier.ts                     │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                          ↓ loads
┌─────────────────────────────────────────────────────────────┐
│                     domain-owners/                          │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  git-owner/                                          │  │
│  │    - OWNER.md          (시스템 프롬프트)              │  │
│  │    - constraints.yaml  (규칙 정의)                   │  │
│  │    - decisions.jsonl   (결정 기록)                   │  │
│  │    - incidents.md      (실패 사례)                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  k8s-owner/                                          │  │
│  │    - OWNER.md                                        │  │
│  │    - constraints.yaml                                │  │
│  │    - decisions.jsonl                                 │  │
│  │    - incidents.md                                    │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

### 실행 흐름

#### Git 작업 예시: `git commit -m "add feature"`

```
1. 에이전트(Sisyphus)가 bash 도구로 git commit 실행 시도
   ↓
2. PreToolUse Hook 인터셉트
   ↓
3. git-command-classifier.ts
   - 명령어 파싱: "git commit -m 'add feature'"
   - 분류: WRITE 작업
   - 에이전트 확인: "sisyphus" (git-owner 아님)
   ↓
4. git-write-enforcement.ts
   - WRITE 작업 + non-git-owner → 차단
   - 에러 메시지: "Git write blocked. Delegate to git-owner agent."
   ↓
5. Sisyphus가 git-owner에게 위임
   - delegate_task(subagent_type="git-owner", prompt="commit with message: add feature")
   ↓
6. git-owner 에이전트 실행
   - OWNER.md 로드 (시스템 프롬프트)
   - constraints.yaml 로드 (규칙)
   ↓
7. git-commit-validator.ts
   - 커밋 메시지 검증
     - Conventional Commits 형식? ❌ (type 없음)
     - 차단: "Invalid commit message format"
   ↓
8. git-owner가 사용자에게 피드백
   - "커밋 메시지가 Conventional Commits 형식이 아닙니다."
   - "올바른 형식: feat: add feature"
```

---

## 구현 과정

### Phase 1: 기반 구조 (2026-01-28 ~ 2026-01-30)

**목표**: 플러그인에 커스텀 에이전트 등록 API 추가

**작업 내용**:

1. **에이전트 등록 API 설계**
   - `src/agents/utils.ts`에 `createCustomAgent()` 함수 추가
   - `CustomAgentConfig` 타입 정의
   - 모델 폴백 체인 지원

2. **설정 스키마 확장**
   - `src/config/schema/custom-agents.ts` 생성
   - Zod 스키마로 검증
   - `knowledgePaths` 필드 추가 (외부 파일 로딩)

3. **플러그인 로딩 메커니즘 문서화**
   - `docs/PLUGIN_LOADING_MECHANISM.md` 작성
   - 에이전트 등록 패치 포인트 카탈로그화

**커밋**:
- `b69b5f62` — docs: document plugin loading mechanism for oh-my-opencode
- `6f36280e` — docs: catalog all agent registration patch points in oh-my-opencode source
- `996c5ce1` — feat: add generic custom agent registration API for domain owners

---

### Phase 2: Git Owner 구현 (2026-01-31 ~ 2026-02-03)

**목표**: Git 작업을 전담하는 git-owner 에이전트 구현

#### 2.1 Git Owner 에이전트 팩토리

**작업**:
- `src/agents/git-owner.ts` 생성
- `OWNER.md` 파일을 시스템 프롬프트로 로딩
- `constraints.yaml` 파싱 및 적용

**커밋**: `c9fab6e8` — feat: implement git-owner agent factory with config-driven prompt loading

---

#### 2.2 Git Command Classifier

**목적**: Git 명령어를 READ/WRITE로 분류

**구현**:
- `src/hooks/claude-code-hooks/git-command-classifier.ts`
- 정규식 기반 패턴 매칭
- 체인 명령어 지원 (`git add . && git commit`)

**분류 로직**:
```typescript
// WRITE 작업
const WRITE_PATTERNS = [
  /\bgit\s+commit\b/,
  /\bgit\s+push\b/,
  /\bgit\s+merge\b/,
  /\bgit\s+rebase\b/,
  /\bgit\s+reset\s+(--hard|--mixed)\b/,
  /\bgit\s+checkout\s+-b\b/,
  /\bgit\s+branch\s+-[dDm]\b/,
  // ...
];

// READ 작업
const READ_PATTERNS = [
  /\bgit\s+status\b/,
  /\bgit\s+log\b/,
  /\bgit\s+diff\b/,
  /\bgit\s+show\b/,
  // ...
];
```

**커밋**: `2310791c` — feat(git-owner): add git command classifier and agent identity propagation

---

#### 2.3 Git Write Enforcement Hook

**목적**: Non-git-owner 에이전트의 WRITE 작업 차단

**구현**:
- `src/hooks/claude-code-hooks/git-write-enforcement.ts`
- PreToolUse Hook으로 등록
- `context.agent !== "git-owner"` 체크 → 차단

**파이프라인 통합**:
- `src/hooks/claude-code-hooks/pre-tool-use.ts`
- 실행 순서: git-write-enforcement → git-commit-validator → kubectl-enforcement

**커밋**: `258695ce` — feat(git-owner): implement git write enforcement via PreToolUse hook

---

#### 2.4 Git Commit Validator

**목적**: 커밋 메시지 및 파일 검증

**기능**:
1. **커밋 메시지 검증**
   - Conventional Commits 형식 체크
   - 회사 저장소 규칙 (JIRA 티켓, 한국어, Co-authored-by)
   - 개인 저장소는 규칙 면제

2. **시크릿 파일 검증**
   - `.env`, `.pem`, `.key` 등 패턴 매칭
   - 스테이징된 파일 목록 확인

3. **금지 파일 검증**
   - `tmp/`, `node_modules/`, `*.tfstate` 등
   - 13개 패턴 (Phase 3에서 24개로 확장)

**구현**:
- `src/hooks/claude-code-hooks/git-commit-validator.ts`
- `validateGitCommit()` 함수
- `CommandExecutor` 인터페이스로 테스트 가능

**커밋**:
- `0b1966ae` — SNDDEV-0000 feat: git-commit-validator 추가 — 커밋 메시지/시크릿/금지파일 검증
- `e09f83b3` — SNDDEV-0000 feat: git-commit-validator를 PreToolUse 파이프라인에 등록

---

#### 2.5 통합 테스트 및 설정

**작업**:
- E2E 테스트 작성
- `knowledgePaths` 필드 테스트
- 회사 컨벤션 브랜치 규칙 추가

**커밋**:
- `3fe67c3e` — feat(git-owner): complete V2 gatekeeper with integration tests and config
- `7d987ab5` — feat(git-owner): add knowledgePaths support for loading separate convention files
- `b680c529` — test(schema): add comprehensive tests for knowledgePaths field

---

### Phase 3: Git Commit Guard 확장 (2026-02-09)

**목표**: 금지 파일 패턴 확장 + `git add` 인터셉션

**작업 내용**:

1. **금지 파일 패턴 확장** (13개 → 24개)
   - 임시 파일: `tmp/`
   - Terraform: `.tfplan`, `.tfstate`, `.terraform/`
   - 빌드 산출물: `node_modules/`, `__pycache__/`
   - 로그: `*.log`
   - 에디터 스왑: `.swp`, `.swo`
   - 컴파일: `*.pyc`

2. **`git add` 인터셉션**
   - `isGitAdd()`: 명령어 감지
   - `extractGitAddFiles()`: 파일 목록 추출 (와일드카드 해석)
   - `validateGitAdd()`: 금지 파일 검증
   - 파이프라인 통합

3. **Think-mode 리팩토링**
   - 모델 ID 변경 방식 제거
   - Provider options 사용

**커밋**:
- `045199ca` — feat(git-owner): expand forbidden file patterns (tmp, terraform, node_modules, logs, swap)
- `6dca036b` — feat(git-owner): add git add interception to block staging of forbidden files
- `4a18f19e` — refactor(think-mode): remove model ID switching, use provider options instead

**테스트 결과**: 47/47 통과

---

### Phase 4: K8s Owner 구현 (2026-02-04 ~ 2026-02-05)

**목표**: Kubectl 작업을 전담하는 k8s-owner 에이전트 구현

#### 4.1 Kubectl Command Classifier

**구현**:
- `src/hooks/claude-code-hooks/kubectl-command-classifier.ts`
- READ/WRITE 분류
- Helm, dry-run, port-forward 감지

**분류 로직**:
```typescript
// WRITE 작업
const WRITE_PATTERNS = [
  /\bkubectl\s+(apply|create|delete|patch|replace)\b/,
  /\bkubectl\s+scale\b/,
  /\bkubectl\s+rollout\s+(restart|undo)\b/,
  /\bhelm\s+(install|upgrade|uninstall)\b/,
  // ...
];

// READ 작업
const READ_PATTERNS = [
  /\bkubectl\s+(get|describe|logs|top)\b/,
  /\bkubectl\s+port-forward\b/,  // 재분류: READ로 간주
  /\bhelm\s+(list|status|history)\b/,
  // ...
];
```

**특수 케이스**:
- `kubectl port-forward`: WRITE로 분류되지만 안전 → READ로 재분류
- `kubectl apply --dry-run`: WRITE이지만 실제 변경 없음 → 허용
- `helm install --dry-run`: 동일

**커밋**: `cbc22278` — feat(k8s-owner): enhance classifier with helm/dry-run/cp/attach detection and port-forward reclassification

---

#### 4.2 Kubectl Enforcement Hook

**구현**:
- `src/hooks/claude-code-hooks/kubectl-enforcement.ts`
- PreToolUse Hook으로 등록
- `context.agent !== "k8s-owner"` 체크 → 차단

**커밋**: `d80aa592` — feat(k8s-owner): implement kubectl enforcement hook and agent

---

#### 4.3 K8s Owner 지식 베이스

**작업**:
- `domain-owners/k8s-owner/OWNER.md` 작성
- Helm, 네임스페이스, Karpenter, 모니터링 지식 추가
- 리소스 할당 가이드라인

**커밋**: `b5e9629` — feat(k8s-owner): enhance knowledge base with helm, namespace, karpenter, monitoring, and resource allocation knowledge

---

### Phase 5: 회사 컨벤션 강화 (2026-02-04)

**목표**: 무신사 저장소 규칙 정합성 확보

**작업 내용**:

1. **OWNER.md 전면 재작성**
   - 회사 저장소 감지 로직 명확화
   - JIRA 티켓 강제화
   - 한국어 커밋 메시지 규칙
   - Co-authored-by 푸터 필수

2. **constraints.yaml 보강**
   - 커밋 규칙 상세화
   - 브랜치 네이밍 규칙
   - PR 규칙 (한국어 제목/본문)

3. **긴급 예외 처리**
   - `[URGENT]` 태그로 JIRA 티켓 면제
   - 프로덕션 장애 대응 시나리오

**커밋**:
- `3b24817` — fix: OWNER.md Convention Enforcement 전면 재작성 — 무신사 컨벤션 정합성 확보
- `4b79b05` — fix: constraints.yaml 커밋/브랜치/PR 규칙 전면 보강 — JIRA, 한국어, Co-authored-by
- `9972812` — fix: company-conventions 브랜치 JIRA 강제화, PR 한국어 규칙, 긴급 예외 추가

---

## 주요 컴포넌트

### 1. Agent Registration API

**파일**: `src/agents/utils.ts`

**함수**: `createCustomAgent(config: CustomAgentConfig)`

**기능**:
- 커스텀 에이전트 생성
- 모델 폴백 체인 설정
- 외부 지식 파일 로딩 (`knowledgePaths`)

**예시**:
```typescript
const gitOwner = createCustomAgent({
  name: "git-owner",
  description: "Git operations domain owner",
  model: "anthropic/claude-sonnet-4-5",
  fallbackChain: ["kimi-k2.5", "gpt-5.2"],
  knowledgePaths: [
    "/path/to/domain-owners/git-owner/OWNER.md",
    "/path/to/domain-owners/git-owner/constraints.yaml"
  ],
  temperature: 0.1
});
```

---

### 2. Command Classifiers

**목적**: 명령어를 READ/WRITE로 분류하여 권한 체크

#### Git Command Classifier

**파일**: `src/hooks/claude-code-hooks/git-command-classifier.ts`

**함수**:
- `classifyGitCommand(command: string): "read" | "write" | "unknown"`
- `isGitCommand(command: string): boolean`

**테스트**: 체인 명령어, 복합 명령어, 플래그 처리

---

#### Kubectl Command Classifier

**파일**: `src/hooks/claude-code-hooks/kubectl-command-classifier.ts`

**함수**:
- `classifyKubectlCommand(command: string): "read" | "write" | "unknown"`
- `isKubectlCommand(command: string): boolean`

**특수 로직**:
- `--dry-run` 플래그 감지 → WRITE를 READ로 재분류
- `port-forward` → READ로 간주

---

### 3. Enforcement Hooks

**목적**: PreToolUse Hook으로 명령어 실행 전 권한 체크

#### Git Write Enforcement

**파일**: `src/hooks/claude-code-hooks/git-write-enforcement.ts`

**로직**:
```typescript
if (isGitCommand(command) && classifyGitCommand(command) === "write") {
  if (context.agent !== "git-owner") {
    throw new Error("Git write blocked. Delegate to git-owner agent.");
  }
}
```

---

#### Kubectl Enforcement

**파일**: `src/hooks/claude-code-hooks/kubectl-enforcement.ts`

**로직**:
```typescript
if (isKubectlCommand(command) && classifyKubectlCommand(command) === "write") {
  if (context.agent !== "k8s-owner") {
    throw new Error("Kubectl write blocked. Delegate to k8s-owner agent.");
  }
}
```

---

### 4. Validators

**목적**: 명령어 내용 검증 (메시지 형식, 파일 패턴 등)

#### Git Commit Validator

**파일**: `src/hooks/claude-code-hooks/git-commit-validator.ts`

**함수**:
- `validateGitCommit()`: 커밋 메시지 + 파일 검증
- `validateGitAdd()`: git add 파일 검증
- `checkForbiddenFiles()`: 금지 파일 패턴 매칭
- `checkSecrets()`: 시크릿 파일 감지

**검증 항목**:
1. Conventional Commits 형식
2. 회사 저장소 규칙 (JIRA, 한국어, Co-authored-by)
3. 금지 파일 패턴 (24개)
4. 시크릿 파일 패턴 (13개)

---

### 5. Pipeline Integration

**파일**: `src/hooks/claude-code-hooks/pre-tool-use.ts`

**실행 순서**:
```typescript
// 1. Git write enforcement
if (isGitCommand(command) && classifyGitCommand(command) === "write") {
  enforceGitWriteRestriction(context);
}

// 2. Git commit validation (git-owner만)
if (context.agent === "git-owner" && isGitCommit(command)) {
  const result = validateGitCommit(context, config);
  if (result.blocked) throw new Error(result.reason);
}

// 3. Git add validation (git-owner만)
if (context.agent === "git-owner" && isGitAdd(command)) {
  const result = validateGitAdd(context, config);
  if (result.blocked) throw new Error(result.reason);
}

// 4. Kubectl enforcement
if (isKubectlCommand(command) && classifyKubectlCommand(command) === "write") {
  enforceKubectlWriteRestriction(context);
}
```

---

## 테스트 전략

### TDD (Test-Driven Development)

**원칙**: RED-GREEN-REFACTOR

모든 기능은 테스트를 먼저 작성한 후 구현:

1. **RED**: 실패하는 테스트 작성
2. **GREEN**: 최소한의 구현으로 테스트 통과
3. **REFACTOR**: 코드 정리 (테스트는 계속 통과)

---

### 테스트 커버리지

#### Git Commit Validator

**파일**: `src/hooks/claude-code-hooks/git-commit-validator.test.ts`

**테스트 수**: 47개

**커버리지**:
- Conventional Commits 형식 검증 (10개)
- 회사 저장소 규칙 (8개)
- 금지 파일 패턴 (24개)
- 시크릿 파일 패턴 (13개)
- `git add` 인터셉션 (10개)
- Edge cases (체인 명령어, 플래그, 인터랙티브 모드)

**BDD 스타일**:
```typescript
test("should block commit with .env file", async () => {
  //#given - .env 파일이 스테이징됨
  const mockExecutor = (cmd: string) => {
    if (cmd.includes("git diff --staged --name-only")) {
      return ".env\napp.ts";
    }
    return "";
  };

  //#when - git commit 실행
  const result = validateGitCommit(context, config, mockExecutor);

  //#then - 차단됨
  expect(result.blocked).toBe(true);
  expect(result.reason).toContain("Forbidden file");
});
```

---

#### Rate Limit Cache

**파일**: `src/shared/rate-limit-cache.test.ts`

**테스트 수**: 7개

**커버리지**:
- TTL 만료 동작
- 동시성 (여러 provider)
- 리셋 기능
- Edge cases (음수 TTL, 0 TTL)

---

#### Model Suggestion Retry

**파일**: `src/shared/model-suggestion-retry.test.ts`

**테스트 수**: 31개

**커버리지**:
- Anthropic → Bedrock 폴백
- OpenAI → OpenRouter 폴백
- 캐시 히트/미스 시나리오
- 에러 감지 로직

---

### E2E 테스트

**파일**: `domain-owners/tests/e2e-test.sh`

**시나리오**:
1. Git-owner 에이전트 로드
2. 금지 파일 커밋 시도 → 차단 확인
3. 올바른 커밋 → 성공 확인
4. K8s-owner 에이전트 로드
5. 프로덕션 네임스페이스 삭제 시도 → 차단 확인

---

## 배운 점과 개선 사항

### 배운 점

#### 1. Separation of Concerns의 중요성

**문제**: 초기에는 도메인 지식을 플러그인 코드에 직접 작성
- 에이전트 프롬프트에 규칙 텍스트 하드코딩
- 규칙 변경 시 여러 파일 수정 필요

**해결**: domain-owners 저장소 분리
- 플러그인은 메커니즘만 제공
- 도메인 지식은 외부 파일로 관리
- 규칙 변경 시 OWNER.md만 수정

**효과**:
- 유지보수 부담 감소
- 여러 팀이 독립적으로 Domain Owner 추가 가능

---

#### 2. Machine-Readable Rules의 힘

**문제**: 텍스트 규칙은 무시되기 쉬움
- "커밋 메시지는 Conventional Commits를 따르세요" → 에이전트가 무시

**해결**: constraints.yaml로 규칙 정의 + 코드로 강제
- 파싱 가능한 형태로 규칙 정의
- PreToolUse Hook으로 실행 전 검증
- 위반 시 차단

**효과**:
- 규칙 준수율 100%
- 일관성 있는 동작

---

#### 3. Fail-Open vs Fail-Closed

**원칙**: 서브프로세스 에러 시 fail-open (허용)

**이유**:
- `git diff --staged --name-only` 실패 시 차단하면 정상 작업도 막힘
- 에러 로그 남기고 허용 → 사용자가 판단

**구현**:
```typescript
try {
  const files = executor("git diff --staged --name-only", cwd);
  return checkForbiddenFiles(files);
} catch (error) {
  log("Failed to get staged files, allowing commit (fail-open)");
  return { blocked: false };
}
```

---

#### 4. 테스트 격리의 중요성

**문제**: 전역 상태(캐시)로 인한 테스트 간섭
- Rate limit 캐시가 테스트 간 공유됨
- 테스트 순서에 따라 결과 달라짐

**해결**: `__resetRateLimitCache()` export
- 각 테스트 전에 캐시 리셋
- 테스트 격리 보장

**패턴**:
```typescript
beforeEach(() => {
  __resetRateLimitCache();
});
```

---

### 개선 사항

#### 1. Git Add 인터셉션 추가

**배경**: 기존에는 `git commit` 시점에만 검증
- 금지 파일이 이미 스테이징된 후 차단
- 사용자 경험 저하

**개선**: `git add` 시점에 사전 차단
- 스테이징 전에 검증
- 더 빠른 피드백

---

#### 2. Think-mode 리팩토링

**배경**: 모델 ID를 `-high` suffix로 변경
- Provider 호환성 문제 발생 가능
- 비표준 방식

**개선**: Provider options 사용
- `thinking: { type: "enabled", budget_tokens: 10000 }`
- 표준 방식으로 전환

---

#### 3. 금지 파일 패턴 확장

**배경**: 13개 패턴으로는 부족
- Terraform 파일 (`.tfstate`) 누락
- 빌드 산출물 (`node_modules/`) 누락

**개선**: 24개 패턴으로 확장
- 임시 파일, Terraform, 빌드 산출물, 로그, 스왑 파일 추가

---

## 향후 계획

### 단기 (1-2주)

#### 1. Infrastructure Owner 구현

**목표**: AWS, Kubernetes, 네트워킹 작업 전담

**기능**:
- Terraform 작업 검증
- AWS CLI 명령어 분류 및 강제
- 프로덕션 리소스 보호

---

#### 2. Testing Owner 구현

**목표**: 테스트 전략, 커버리지, CI/CD 관리

**기능**:
- 테스트 커버리지 임계값 강제
- CI/CD 파이프라인 검증
- 테스트 네이밍 컨벤션 강제

---

### 중기 (1-2개월)

#### 3. Documentation Owner 구현

**목표**: 문서 표준, API 문서, 예제 관리

**기능**:
- API 문서 자동 생성
- 예제 코드 검증
- 문서 스타일 가이드 강제

---

#### 4. Security Owner 구현

**목표**: 보안 관행, 시크릿, 접근 제어 관리

**기능**:
- 시크릿 스캐닝 강화
- 접근 제어 정책 검증
- 보안 취약점 자동 감지

---

### 장기 (3-6개월)

#### 5. Decision Analytics

**목표**: decisions.jsonl 데이터 분석

**기능**:
- 차단 패턴 분석 (어떤 규칙이 자주 위반되는가?)
- 에이전트 행동 분석 (어떤 에이전트가 규칙을 자주 위반하는가?)
- 규칙 개선 제안 (불필요한 규칙 식별)

---

#### 6. Multi-Tenant Support

**목표**: 여러 팀이 독립적으로 Domain Owner 관리

**기능**:
- 팀별 domain-owners 저장소
- 팀별 규칙 격리
- 팀 간 규칙 공유 메커니즘

---

## 참고 자료

### 문서

| 문서 | 경로 |
|------|------|
| Domain Owners README | `domain-owners/README.md` |
| Git Owner 시스템 프롬프트 | `domain-owners/git-owner/OWNER.md` |
| Git Owner 규칙 | `domain-owners/git-owner/constraints.yaml` |
| K8s Owner 시스템 프롬프트 | `domain-owners/k8s-owner/OWNER.md` |
| 플러그인 로딩 메커니즘 | `oh-my-opencode/docs/PLUGIN_LOADING_MECHANISM.md` |
| 전체 작업 요약 | `oh-my-opencode/docs/SESSION_SUMMARY_2026-02-09.md` |

---

### 코드

| 컴포넌트 | 파일 |
|----------|------|
| Agent Registration API | `src/agents/utils.ts` |
| Git Command Classifier | `src/hooks/claude-code-hooks/git-command-classifier.ts` |
| Git Write Enforcement | `src/hooks/claude-code-hooks/git-write-enforcement.ts` |
| Git Commit Validator | `src/hooks/claude-code-hooks/git-commit-validator.ts` |
| Kubectl Classifier | `src/hooks/claude-code-hooks/kubectl-command-classifier.ts` |
| Kubectl Enforcement | `src/hooks/claude-code-hooks/kubectl-enforcement.ts` |
| Pipeline Integration | `src/hooks/claude-code-hooks/pre-tool-use.ts` |
| Rate Limit Cache | `src/shared/rate-limit-cache.ts` |
| Model Suggestion Retry | `src/shared/model-suggestion-retry.ts` |

---

### 테스트

| 테스트 스위트 | 파일 | 테스트 수 |
|--------------|------|----------|
| Git Commit Validator | `src/hooks/claude-code-hooks/git-commit-validator.test.ts` | 47 |
| Rate Limit Cache | `src/shared/rate-limit-cache.test.ts` | 7 |
| Model Suggestion Retry | `src/shared/model-suggestion-retry.test.ts` | 31 |

---

## 메타데이터

**작성일**: 2026-02-09  
**작성자**: jay.jung  
**문서 버전**: 1.0  
**마지막 업데이트**: 2026-02-09  
**관련 커밋**: `be77363f` (feat/domain-owner-system 병합)  

# Git Commit Guard 사용자 가이드

**버전**: 1.0  
**최종 업데이트**: 2026-02-09  
**대상**: oh-my-opencode 사용자  

---

## 📋 목차

1. [개요](#개요)
2. [주요 기능](#주요-기능)
3. [금지 파일 패턴](#금지-파일-패턴)
4. [사용 예시](#사용-예시)
5. [에러 메시지 해석](#에러-메시지-해석)
6. [FAQ](#faq)
7. [문제 해결](#문제-해결)

---

## 개요

**Git Commit Guard**는 oh-my-opencode의 **git-owner** 에이전트가 제공하는 보안 기능으로, 위험한 파일이 Git 저장소에 커밋되는 것을 사전에 차단합니다.

### 왜 필요한가?

AI 에이전트가 코드를 작성하다 보면 실수로 다음과 같은 파일을 커밋할 수 있습니다:
- 시크릿 파일 (`.env`, API 키, 인증서)
- 임시 파일 (`tmp/`, 로그 파일)
- 빌드 산출물 (`node_modules/`, `*.pyc`)
- 인프라 상태 파일 (`.tfstate`)

Git Commit Guard는 이러한 파일을 **자동으로 감지하고 차단**하여 보안 사고를 예방합니다.

---

## 주요 기능

### 1. 이중 차단 시스템

Git Commit Guard는 **두 단계**에서 위험한 파일을 차단합니다:

```
git add .env
   ↓
[1단계] git add 인터셉션
   ↓ 차단!
   ✗ "Forbidden file in git add: .env"

(만약 1단계를 우회했다면)

git commit -m "add config"
   ↓
[2단계] git commit 검증
   ↓ 차단!
   ✗ "Forbidden file in commit: .env"
```

**이점**:
- **빠른 피드백**: `git add` 시점에 즉시 차단
- **이중 안전망**: `git commit` 시점에 한 번 더 검증

---

### 2. 24가지 금지 파일 패턴

Git Commit Guard는 다음 카테고리의 파일을 차단합니다:

| 카테고리 | 패턴 수 | 예시 |
|----------|---------|------|
| **시크릿 파일** | 13개 | `.env`, `.pem`, `.key`, `credentials.json` |
| **임시 파일** | 1개 | `tmp/` (모든 depth) |
| **Terraform** | 4개 | `.tfplan`, `.tfstate`, `.terraform/` |
| **빌드 산출물** | 2개 | `node_modules/`, `__pycache__/` |
| **로그 파일** | 1개 | `*.log` |
| **에디터 스왑** | 2개 | `.swp`, `.swo` |
| **컴파일 파일** | 1개 | `*.pyc` |

---

### 3. 와일드카드 해석

`git add .` 또는 `git add -A` 같은 와일드카드 명령어도 안전하게 처리합니다:

```bash
# 현재 디렉토리에 .env 파일이 있다면
git add .
   ↓
[내부 동작] git ls-files로 실제 파일 목록 확인
   ↓
.env 파일 감지
   ↓ 차단!
   ✗ "Forbidden file in git add: .env"
```

---

### 4. 회사 저장소 규칙 강제

회사 저장소 (`github.com/musinsa/*`)에서는 추가 규칙이 적용됩니다:

| 규칙 | 설명 | 예시 |
|------|------|------|
| **JIRA 티켓** | 커밋 메시지에 JIRA 티켓 번호 필수 | `SYSTEM-1234 feat: 사용자 인증 추가` |
| **한국어 메시지** | 커밋 메시지 본문은 한국어로 작성 | `feat: 사용자 인증 추가` (O) / `feat: add user auth` (X) |
| **Co-authored-by** | AI 도구 사용 시 푸터 필수 | `Co-authored-by: Claude <claude@anthropic.com>` |

**개인 저장소** (`github.com/beewee22/*`)는 규칙 면제됩니다.

---

## 금지 파일 패턴

### 시크릿 파일 (13개)

| 패턴 | 설명 | 예시 |
|------|------|------|
| `*.env` | 환경 변수 파일 | `.env`, `.env.local`, `config.env` |
| `*.pem` | PEM 인증서 | `server.pem`, `client.pem` |
| `*.key` | 개인 키 파일 | `private.key`, `server.key` |
| `*.p12` | PKCS#12 인증서 | `cert.p12` |
| `*.pfx` | PFX 인증서 | `cert.pfx` |
| `id_rsa` | SSH 개인 키 | `~/.ssh/id_rsa` |
| `id_dsa` | DSA SSH 키 | `~/.ssh/id_dsa` |
| `id_ecdsa` | ECDSA SSH 키 | `~/.ssh/id_ecdsa` |
| `id_ed25519` | Ed25519 SSH 키 | `~/.ssh/id_ed25519` |
| `credentials.json` | 인증 정보 | `credentials.json` |
| `service-account.json` | GCP 서비스 계정 | `service-account.json` |
| `*.keystore` | Java 키스토어 | `app.keystore` |
| `*.jks` | Java 키스토어 | `keystore.jks` |

---

### 임시 파일 (1개)

| 패턴 | 설명 | 예시 |
|------|------|------|
| `tmp/` | 임시 디렉토리 (모든 depth) | `tmp/`, `src/tmp/`, `build/tmp/` |

**주의**: 시스템 `/tmp/`뿐만 아니라 **프로젝트 내 모든 `tmp/` 디렉토리**가 차단됩니다.

**권장 사항**: 임시 파일은 `.gitignore`에 추가하거나 `tmp` 대신 다른 이름 사용 (예: `temp`, `scratch`)

---

### Terraform (4개)

| 패턴 | 설명 | 예시 |
|------|------|------|
| `*.tfplan` | Terraform 플랜 파일 | `plan.tfplan` |
| `*.tfstate` | Terraform 상태 파일 (시크릿 포함!) | `terraform.tfstate` |
| `*.tfstate.backup` | Terraform 상태 백업 | `terraform.tfstate.backup` |
| `.terraform/` | Terraform 플러그인 디렉토리 | `.terraform/providers/` |

**중요**: `.tfstate` 파일에는 인프라 시크릿이 평문으로 저장되므로 **절대 커밋 금지**

---

### 빌드 산출물 (2개)

| 패턴 | 설명 | 예시 |
|------|------|------|
| `node_modules/` | Node.js 의존성 | `node_modules/express/` |
| `__pycache__/` | Python 캐시 | `__pycache__/module.cpython-39.pyc` |

**이유**: 빌드 산출물은 저장소 크기를 불필요하게 증가시키고, 재현 가능성을 해칩니다.

---

### 로그 파일 (1개)

| 패턴 | 설명 | 예시 |
|------|------|------|
| `*.log` | 로그 파일 | `app.log`, `error.log`, `debug.log` |

**이유**: 로그 파일은 크기가 크고, 민감한 정보가 포함될 수 있습니다.

---

### 에디터 스왑 파일 (2개)

| 패턴 | 설명 | 예시 |
|------|------|------|
| `*.swp` | Vim 스왑 파일 | `.app.js.swp` |
| `*.swo` | Vim 스왑 오버플로우 | `.app.js.swo` |

**이유**: 에디터 임시 파일은 저장소에 불필요합니다.

---

### 컴파일 파일 (1개)

| 패턴 | 설명 | 예시 |
|------|------|------|
| `*.pyc` | Python 바이트코드 | `module.pyc` |

**이유**: 컴파일된 파일은 소스 코드에서 재생성 가능합니다.

---

## 사용 예시

### 예시 1: 시크릿 파일 차단

```bash
# .env 파일을 스테이징하려고 시도
$ git add .env

[git-owner] Forbidden file in git add: .env
[git-owner] Avoid staging sensitive/unnecessary files (tmp/, .env, .tfstate, etc.)

Error: Git add blocked by git-owner
```

**해결 방법**:
1. `.env` 파일을 `.gitignore`에 추가
2. `.env.example` 파일을 대신 커밋 (실제 값 제거)

---

### 예시 2: 와일드카드 차단

```bash
# 현재 디렉토리에 .env와 app.ts가 있음
$ git add .

[git-owner] Checking files: .env, app.ts
[git-owner] Forbidden file detected: .env

Error: Git add blocked by git-owner
```

**해결 방법**:
```bash
# 안전한 파일만 명시적으로 추가
$ git add app.ts
```

---

### 예시 3: Terraform 상태 파일 차단

```bash
$ git add terraform.tfstate

[git-owner] Forbidden file in git add: terraform.tfstate
[git-owner] Terraform state files contain secrets in plaintext!

Error: Git add blocked by git-owner
```

**해결 방법**:
1. `.gitignore`에 `*.tfstate` 추가
2. Terraform 백엔드 설정 (S3, Terraform Cloud 등)

---

### 예시 4: 회사 저장소 커밋 메시지 검증

```bash
# 회사 저장소 (github.com/musinsa/*)
$ git commit -m "add user authentication"

[git-owner] Company repository detected: github.com/musinsa/project
[git-owner] JIRA ticket number required in commit message

Error: Invalid commit message format
```

**해결 방법**:
```bash
# JIRA 티켓 번호 + 한국어 메시지
$ git commit -m "SYSTEM-1234 feat: 사용자 인증 기능 추가"
```

---

### 예시 5: 개인 저장소는 규칙 면제

```bash
# 개인 저장소 (github.com/beewee22/*)
$ git commit -m "add feature"

[git-owner] Personal repository detected: github.com/beewee22/my-project
[git-owner] No enforcement - user has full freedom

✓ Commit successful
```

---

## 에러 메시지 해석

### "Forbidden file in git add: {파일명}"

**의미**: 스테이징하려는 파일이 금지 패턴에 해당합니다.

**원인**:
- 시크릿 파일 (`.env`, `.pem` 등)
- 임시 파일 (`tmp/`)
- 빌드 산출물 (`node_modules/`)

**해결**:
1. 파일을 `.gitignore`에 추가
2. 파일을 삭제하거나 다른 위치로 이동
3. 파일 이름 변경 (예: `tmp/` → `temp/`)

---

### "Forbidden file in commit: {파일명}"

**의미**: 이미 스테이징된 파일이 금지 패턴에 해당합니다.

**원인**:
- `git add` 차단을 우회했거나
- 이전에 스테이징된 파일

**해결**:
```bash
# 스테이징 취소
$ git reset HEAD {파일명}

# 또는 전체 스테이징 취소
$ git reset HEAD
```

---

### "Invalid commit message format"

**의미**: 커밋 메시지가 Conventional Commits 형식이 아닙니다.

**원인**:
- Type 누락 (feat, fix, refactor 등)
- 콜론(`:`) 누락
- 회사 저장소에서 JIRA 티켓 누락

**해결**:
```bash
# 올바른 형식
$ git commit -m "feat: 새 기능 추가"

# 회사 저장소
$ git commit -m "SYSTEM-1234 feat: 새 기능 추가"
```

---

### "Git write blocked. Delegate to git-owner agent."

**의미**: 다른 에이전트가 Git 쓰기 작업을 시도했습니다.

**원인**:
- Sisyphus, Atlas 등 다른 에이전트가 직접 `git commit` 실행

**해결**:
- 자동으로 git-owner 에이전트에게 위임됩니다.
- 사용자 개입 불필요

---

## FAQ

### Q1. 금지 파일 패턴을 수정할 수 있나요?

**A**: 현재는 하드코딩되어 있어 수정 불가능합니다. 향후 버전에서 설정 파일로 커스터마이징 가능하도록 개선 예정입니다.

**임시 해결책**: 정말 필요한 경우 `git-owner` 에이전트를 비활성화하고 수동으로 커밋할 수 있습니다. (권장하지 않음)

---

### Q2. 개인 저장소에서도 규칙이 적용되나요?

**A**: 아니요. 개인 저장소 (`github.com/beewee22/*`)는 **모든 규칙이 면제**됩니다. 금지 파일 패턴만 적용됩니다.

---

### Q3. `tmp/` 디렉토리를 사용하고 싶은데 차단됩니다.

**A**: `tmp/` 디렉토리는 보안상 차단됩니다. 다음 대안을 사용하세요:
- `.gitignore`에 `tmp/` 추가 (추천)
- 다른 이름 사용 (예: `temp/`, `scratch/`, `working/`)

---

### Q4. `.env.example` 파일도 차단되나요?

**A**: 아니요. `*.env` 패턴은 `.env`로 **끝나는** 파일만 매칭합니다. `.env.example`은 허용됩니다.

**허용**: `.env.example`, `.env.template`, `sample.env`  
**차단**: `.env`, `.env.local`, `.env.production`, `config.env`

---

### Q5. 긴급 상황에서 규칙을 우회할 수 있나요?

**A**: 네. 커밋 메시지에 `[URGENT]` 태그를 추가하면 JIRA 티켓 검증이 면제됩니다:

```bash
$ git commit -m "[URGENT] fix: 프로덕션 장애 긴급 수정"
```

**주의**: 금지 파일 패턴은 여전히 적용됩니다.

---

### Q6. `git add -p` (인터랙티브 모드)는 어떻게 되나요?

**A**: 인터랙티브 모드는 **fail-open** 정책으로 허용됩니다. 파일 목록을 미리 알 수 없기 때문입니다.

**권장**: 인터랙티브 모드 사용 후 `git status`로 스테이징된 파일 확인

---

### Q7. 에러가 발생했는데 로그는 어디서 확인하나요?

**A**: oh-my-opencode 로그 파일을 확인하세요:

```bash
# 로그 위치 (macOS)
~/.opencode/logs/

# 최근 로그 확인
tail -f ~/.opencode/logs/latest.log
```

---

## 문제 해결

### 문제 1: "git add ."가 항상 차단됩니다

**증상**: 안전한 파일만 있는데도 차단됨

**원인**: 숨겨진 금지 파일이 있을 수 있음

**해결**:
```bash
# 스테이징될 파일 목록 확인
$ git ls-files --others --modified --exclude-standard

# 금지 파일 찾기
$ git ls-files --others --modified --exclude-standard | grep -E '\.(env|pem|key|log)$'

# 금지 파일을 .gitignore에 추가
$ echo ".env" >> .gitignore
$ echo "*.log" >> .gitignore
```

---

### 문제 2: 커밋 메시지 형식이 맞는데도 차단됩니다

**증상**: Conventional Commits 형식인데 "Invalid commit message format" 에러

**원인**: 회사 저장소에서 JIRA 티켓 누락

**해결**:
```bash
# 저장소 타입 확인
$ git remote -v
origin  https://github.com/musinsa/project.git (fetch)

# 회사 저장소라면 JIRA 티켓 추가
$ git commit -m "SYSTEM-1234 feat: 기능 추가"
```

---

### 문제 3: git-owner 에이전트가 응답하지 않습니다

**증상**: "Delegate to git-owner agent" 메시지 후 멈춤

**원인**: 에이전트 로딩 실패 또는 설정 오류

**해결**:
```bash
# oh-my-opencode 설정 확인
$ cat ~/.opencode/config.json

# git-owner 에이전트 활성화 확인
{
  "agents": {
    "git-owner": {
      "enabled": true
    }
  }
}

# 플러그인 재시작
$ opencode restart
```

---

### 문제 4: 테스트 중 금지 파일을 커밋해야 합니다

**증상**: 테스트 목적으로 `.env` 파일을 커밋해야 하는데 차단됨

**해결**:
```bash
# 옵션 1: .env.test 파일 사용 (권장)
$ cp .env .env.test
$ git add .env.test

# 옵션 2: git-owner 일시 비활성화 (권장하지 않음)
# ~/.opencode/config.json에서 git-owner.enabled = false
```

---

## 추가 자료

### 관련 문서

| 문서 | 설명 |
|------|------|
| [Domain Owner 개발 히스토리](./DOMAIN_OWNER_DEVELOPMENT_HISTORY.md) | 시스템 설계 및 구현 과정 |
| [전체 작업 요약](./SESSION_SUMMARY_2026-02-09.md) | 최근 작업 내역 |
| [Git Owner 시스템 프롬프트](../../domain-owners/git-owner/OWNER.md) | git-owner 에이전트 상세 규칙 |
| [Git Owner 규칙](../../domain-owners/git-owner/constraints.yaml) | 기계 판독 가능한 규칙 정의 |

---

### 코드 참조

| 컴포넌트 | 파일 |
|----------|------|
| 금지 파일 패턴 | `src/hooks/claude-code-hooks/git-commit-validator.ts` (line 15-38) |
| git add 검증 | `src/hooks/claude-code-hooks/git-commit-validator.ts` (line 115-180) |
| git commit 검증 | `src/hooks/claude-code-hooks/git-commit-validator.ts` (line 31-87) |
| 파이프라인 통합 | `src/hooks/claude-code-hooks/pre-tool-use.ts` (line 43-60) |

---

### 테스트

Git Commit Guard의 동작을 확인하려면 테스트를 실행하세요:

```bash
# Git Commit Validator 테스트 (47개)
$ bun test src/hooks/claude-code-hooks/git-commit-validator.test.ts

# 전체 claude-code-hooks 테스트
$ bun test src/hooks/claude-code-hooks/
```

---

## 피드백 및 기여

### 버그 리포트

Git Commit Guard에서 문제를 발견하셨나요?

1. GitHub Issues에 버그 리포트 작성
2. 다음 정보 포함:
   - 에러 메시지 전문
   - 실행한 명령어
   - 저장소 타입 (회사/개인)
   - oh-my-opencode 버전

---

### 기능 제안

새로운 금지 파일 패턴이나 규칙을 제안하고 싶으신가요?

1. GitHub Discussions에 제안 작성
2. 다음 정보 포함:
   - 제안하는 패턴/규칙
   - 왜 필요한지 (use case)
   - 예상되는 영향 범위

---

## 메타데이터

**문서 버전**: 1.0  
**최종 업데이트**: 2026-02-09  
**작성자**: jay.jung  
**관련 커밋**: `045199ca`, `6dca036b`, `4a18f19e`  
**테스트 커버리지**: 47/47 통과  

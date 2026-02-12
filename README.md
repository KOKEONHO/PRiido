# PRiido

<br>

## 개요

<br>

PRiido는 GitHub PR 정보를 기반으로 비개발자(경영진)가 이해하기 쉬운 개발 보고서를 자동으로 생성하는 서비스입니다.

<br>

## 배경

<br>

매주 여러 저장소에서 병합된 PR을 확인하고 핵심 변경사항을 요약하는 작업은 필요 이상의 시간이 투입됩니다.

또한 PR은 개발자 관점으로 작성되는 경우가 많아, 경영진에게 공유할 때는 추가적인 정리가 필요합니다.

<br>

## 목표

<br>

PRiido는 다음 과정을 자동화합니다.

- GitHub API로 병합된 PR을 수집합니다.
- PR의 제목, 본문, 작성자, 병합 날짜, 변경 파일 수 등의 핵심 정보를 정리합니다.
- Claude API를 통해 비개발자도 이해하기 쉬운 보고서를 생성합니다.
- 보고서는 마크다운 형태로 제공됩니다.

<br>

## 의존성

<br>

- **`@nestjs/config`**

  환경 변수(`.env`) 로드 및 설정 관리를 위한 모듈

<br>

- **`@nestjs/passport`, `passport`**

  NestJS에서 인증 로직을 Guard/Strategy 기반으로 구성하기 위한 라이브러리

<br>

- **`passport-github2`**

  GitHub OAuth 로그인을 구현하기 위한 Passport 전략

<br>

- **`@nestjs/jwt`, `passport-jwt`**

  자체 JWT 발급/검증 및 인증 처리를 위한 라이브러리

<br>

- **`cookie-parser`**

  쿠키 기반으로 토큰을 전달하기 위해 사용

<br>

- **`class-validator`, `class-transformer`**

  요청 DTO 검증 및 입력 데이터 변환을 위해 사용

<br>

- **`@nestjs/typeorm`, `typeorm`, `pg`**

  PostgreSQL 연동 및 데이터 저장을 위한 드라이버와 ORM

<br>

- **`ioredis`**

  Redis 클라이언트

<br>

- **`nanoid`**

  충돌 가능성이 낮은 랜덤 UUID 생성을 위한 라이브러리

<br>

- **`@anthropic-ai/sdk`**

  Claude API 호출을 위한 공식 SDK

<br>

## 실행 방법

<br>

### 1. 배포 환경

<br>

1. **[PRiido](https://priido.cloud) 접속**

   https://priido.cloud

   배포 중인 도메인입니다.

<br>

2. **`GitHub 로그인` 버튼을 클릭하여 로그인**

<br>

3. **메인에 보이는 접근 가능한 조직 중 하나(본인 계정 포함) 선택**

<br>

4. **하단에서 해당 조직(또는 본인 계정)의 저장소를 확인 가능**

<br>

5. **등록할 저장소를 선택(단일, 복수)하고 `선택한 저장소 등록` 버튼을 클릭**

<br>

6. **`등록된 저장소` 섹션에서 특정 저장소를 클릭하여 진입**

   최초 진입 시, PRiido에서 해당 저장소의 PR을 30개씩 병합 시점 내림차순으로 가져옵니다.

   PRiido에 반영되지 않은 신규 PR이 병합됐을 경우, `PR 가져오기` 버튼을 클릭하여 새로 가져올 수 있습니다.

   이미 가져온 PR에서 수정 이력이 발생했을 경우, PR에 개별로 할당된 새로고침 버튼을 클릭하여 stale한 이전 값들을 신규 값들로 업데이트 할 수 있습니다.

<br>

7. **보고서로 작성할 내용의 PR을 선택**

<br>

8. **`보고서 만들기` 클릭하여 보고서 작성**

<br>

### 2. 로컬 환경

<br>

1. **프론트엔드 저장소와 백엔드 저장소 clone**
   - 프론트엔드 저장소: https://github.com/KOKEONHO/PRiido-Front
   - 백엔드 저장소: https://github.com/KOKEONHO/PRiido

<br>

2. **프론트엔드와 백엔드 의존성 설치**

   ```
   # PRiido-Front
   npm install

   # PRiido
   pnpm install
   ```

<br>

3. **GitHub OAuth App 생성 및 설정**

   GitHub OAuth는 본인 계정으로 OAuth App을 생성해서 Cliend ID/Secret을 발급 받아야 합니다.

   보안상 저장소에 제 키를 포함하지 않았습니다.
   - Homepage URL: `http://localhost:5173`
   - Authorization callback URL: `http://localhost:3000/api/auth/github/callback`

<br>

4. **백엔드 프로젝트 루트에 `.env` 생성**

   아래와 같은 `.env` 파일이 필요합니다.

   ```
   PORT=3000
   NODE_ENV=local

   # Dev
   FRONT_ORIGIN=http://localhost:5173

   # DB
   DB_HOST=localhost
   DB_PORT=5432
   DB_USERNAME=postgres
   DB_PASSWORD=postgres
   DB_NAME=priido

   DB_SSL_ENABLED=false

   # Redis
   REDIS_HOST=localhost
   REDIS_PORT=6379
   REDIS_PASSWORD=
   REDIS_DB=0

   # GitHub OAuth (직접 OAuth App 생성 후 입력)
   GITHUB_CLIENT_ID=
   GITHUB_CLIENT_SECRET=
   GITHUB_CALLBACK_URL=http://localhost:3000/api/auth/github/callback

   # JWT
   JWT_SECRET=

   # expires in seconds
   JWT_AT_EXPIRES_SEC=900
   JWT_RT_EXPIRES_SEC=1209600

   # Cookie
   RT_COOKIE_NAME=priido_rt
   COOKIE_SECURE=false
   COOKIE_SAMESITE=lax

   # Claude (직접 발급 후 입력)
   ANTHROPIC_API_KEY=
   CLAUDE_MODEL=claude-opus-4-6
   ```

<br>

5. **PostgreSQL / Redis 실행**
   - PostgreSQL: `5432`
   - Redis: `6379`

<br>

6. **백엔드 서버 실행**

   ```
   # PRiido
   pnpm start:dev
   ```

<br>

7. **프론트엔드 서버 실행**

   ```
   # PRiido-Front
   npm run dev
   ```

<br>

8. **브라우저에서 `http://localhost:5173` 접속 후 동작 확인**

<br>

## 기술 스택

<br>

- **언어**: TypeScript
- **프레임워크**: NestJS
- **데이터베이스**: PostgreSQL, Redis
- **AI**: Claude API
- **Cloud**: AWS
- **CI/CD**: GitHub Actions, Elastic Container Registry, CodeDeploy

<br>

## 기술 스택 선정 이유

<br>

`NestJS`, `TypeScript`, `PostgreSQL`은 스위그 팀에서 실제로 사용하는 백엔드 스택과 일치하기 때문에 선택했습니다.

과제 요구사항을 "구현만 빠르게 끝내는 것"보다, **실제 협업 환경에서 바로 적용 가능한 형태로 문제를 정의하고 설계 근거를 남기는 것**이 더 중요하다고 판단했고, 그래서 스위그의 컨텍스트에 맞춰 진행하는 편이 적합하다고 생각했습니다.

배포는 가장 많이 다뤄본 클라우드 컴퓨팅 서비스인 `AWS`를 채택했습니다.

CI/CD는 백엔드 기준으로 `GitHub Actions`에서 `Docker` 이미지를 구워서 `Elastic Container Registry`에 push한 뒤, `CodeDeploy`로 배포가 진행되도록 구성했습니다.

<br>

## 아키텍처

<br>

![PRiido_architecture](./images/PRiido_architecture.png)

PRiido는 AWS VPC 내에서 Nginx + NestJS API 서버를 중심으로 동작하며, 외부로는 GitHub와 Claude API와 연동됩니다.

<br>

- **Nginx**

  프론트 정적 리소스 서빙 및 리버스 프록시 역할을 합니다.

  `/api` 프리픽스가 붙은 요청을 NestJS로 전달합니다.

<br>

- **NestJS**

  핵심 비즈니스 로직을 담당합니다.

  GitHub OAuth 로그인 및 GitHub API 호출을 통해 사용자의 계정, 조직, 저장소, PR을 수집합니다.

<br>

- **Redis**

  현재는 자체 Refresh Token의 저장에 사용되고 있습니다.

<br>

- **PostgreSQL**

  외부에서 직접 접근할 수 없도록 Private Subnet에 두고 NestJS만 접근하도록 구성했습니다.

<br>

## ERD

<br>

![PRiido ERD](./images/priido_erd.png)

<!-- TODO: ERD 수정한거 반영해야 함 -->

<br>

## 기능 정의

<br>

### MVP

<br>

저는 이번 과제의 핵심을 '여러 저장소의 PR 중 보고서에 필요한 PR을 안정적으로 수집하고, 비개발자도 이해 가능한 보고서를 생성, 저장, 조회 가능하게 만드는 것"으로 정의했습니다.

따라서 MVP에서는 **보고서 생성까지의 플로우**를 우선 구현했습니다.

<br>

1. **GitHub OAuth 로그인으로 유저 데이터 확보**

2. **저장소 선택/등록 및 PR 병합된 PR 가져오기**

3. **선택한 PR로 비개발자도 이해하기 쉬운 보고서 생성 및 저장**

4. **보고서 목록 & 상세 조회**

<br>

### 고도화

<br>

MVP를 구현하고 나니 "요구사항을 만족했다"는 것과 "서비스로서 자연스럽게 굴러간다"는 것은 확연히 다르다는 것을 바로 체감했습니다.

과제 요구사항을 그대로 따르면 구현은 깔끔하고 단순했습니다.

하지만 실제 사용자는 PRiido를 사용하고 싶어도 사용할 수 없는 문제가 발생한다는 것을 깨달았고, 그 순간부터 고도화는 이를 개선하기 위한 방향으로 진행됐습니다.

과제를 하면서 재미있었던 점은, 하나를 고치면 다음 문제가 자연스레 튀어나왔다는 것입니다.

그래서 이번 고도화는 "기능 추가"보다는 **문제 해결 → 다른 문제 발생 → 트레이드 오프 비교 → 설계 수정**의 반복이었습니다.

그 흐름을 아래와 같이 정리해봤습니다.

<br>

#### 1. 정적인 기간의 한계

<br>

![static_term](./images/static_term.png)

과제 테스트의 요구사항에는 '지난 주'에 병합된 PR 정보를 수집하라고 나와있습니다.

하지만 서비스 관점에서 정적인 기간만으로는 한계가 명확했습니다.

가령 지난 주에 병합된 PR이 없는 저장소라면, 사용자는 보고서를 만들기 위한 PR을 아예 확보하지 못합니다.

그래서 '지난 주 PR만 수집'이 아니라 **기간에 국한되지 않고 PR을 누적해서 확인하고 선택할 수 있는 형태**가 서비스 목적에 더 부합한다고 판단했습니다.

결과적으로 사용자가 저장소를 등록하면 PRiido는 해당 저장소의 PR을 기간에 상관 없이 가져와서 사용자가 이 중 보고서 생성에 쓸 PR을 선택하도록 했습니다.

<br>

#### 2. 한 번에 가져올 PR 개수

<br>

기간 제한을 없애고 PR을 누적해서 보여주기로 하니, 자연스럽게 "한 번에 몇 개를 보여줄 것인가"를 결정해야 했습니다.

GitHub API는 한 요청에서 가져올 수 있는 PR 개수에 상한(100ㄱ개)이 존재하기 때문에, 결국 **페이지 크기를 어떻게 잡을지**가 핵심이었습니다.

PRiido의 목적은 "전체 PR 탐색"이 아니라 **보고서 생성에 사용할 PR을 고르는 것**이기 때문에, PR을 100개씩 가져오는 것은 낭비입니다.

또한 가져온 100개의 PR 모두가 사용자에게 필요했던 PR일 확률도 낮습니다.

결정적으로, 현재 PR을 가져오는 흐름이 '파일 수정 개수' 같은 필드를 위해서는 PR마다 별도의 API를 또 호출해야하는 구조라 100개의 PR은 서버에 오버헤드가 클 것이라 판단했습니다.

그래서 페이지 크기를 **30개**로 잡았고, **무한 스크롤** 방식으로 구현했습니다.

<br>

#### 3. Pulls API 기반 오프셋 페이지네이션의 한계

<br>

PR을 30개 단위로 끊어서 가져오기로 정한 뒤, 초기 구현은 GitHub Pulls API를 사용했습니다.

Pulls API는 PR 자체를 직접 내려주기 때문에 PR의 메타데이터(본문, 작성자, 상태 등)도 가져올 수 있어 빠르게 MVP를 구성하기에는 적합했습니다.

하지만, 서비스 관점에서 저장소는 "임계 구역"이기 때문에 PR을 가져오는 중에 신규 PR이 추가되거나 아니면 기존 PR이 삭제되는 경우가 발생할 수 있습니다.

Pulls API는 오프셋 페이지네이션이라 이런 변동에 취약하다는 단점이 있습니다.

가령, PR을 가져오는 도중 신규 PR이 추가되면, 기존에 1페이지에 있던 항목이 2페이지로 밀려서 이미 가져온 PR이 다음 페이지에서 다시 가져와지는 현상이 발생할 수 있습니다.

뿐만 아니라 가져온 PR이 저장소에서 삭제되는 경우, 3페이지를 통해서 가져와야할 PR이 당겨져서 2페이지에 위치하게되어 PR이 누락되는 현상도 발생할 수 있습니다.

<!-- TODO: 실제 테스트 결과 넣기 -->

이 문제를 해결하기 위해 API를 기존 Pulls API에서 Search API로 전환하는 것을 고려했습니다.

두 API는 반환하는 데이터가 다른데, Pulls API는 상기했듯이 PR 리소스를 직접 반환하여 가져온 PR에 대한 정보를 추가적인 API 요청 없이 바로 보여줄 수 있었습니다.

Search API는 검색이 PR 전용이 아니기 때문에 PR 전용 메타데이터가 제한적으로 제공됩니다.

하지만 Search API에서는 PR을 가져올 때 `mergedAt`을 기준으로 범위를 잘라가며 PR을 가져오는 형태로 구현할 수 있기 때문에 누락, 중복을 구조적으로 완화할 수 있다고 판단했습니다.

종합적으로 고려해봤을 때, PRiido 서비스에 더 치명적인 것은 **PR의 누락**이라는 생각이 들었습니다.

PRiido는 특정 기간 동안 병합된 PR을 기반으로 보고서를 생성해주는데, 특정 PR이 누락되면 사용자는 어떤 PR이 누락됐는지를 인지하기 어렵고, 그 결과 보고서에 결함이 생길 수도 있기 때문입니다.

최종적으로 Search API로 리팩터링을 했고, PR 단건에 대해 연관된 커밋과 수정된 파일 데이터를 가져오는 API가 추가로 날아가는 구조가 되었습니다.

<br>

#### 4. 매번 GitHub API를 요청하는 구조의 한계

<br>

Search API로 전환하면서 누락/중복 리스크는 회피할 수 있었지만, 곧바로 **느린 PR 가져오기 속도**가 발목을 잡았습니다.

기존 Pulls API를 사용했을 때는 PR의 메타데이터를 한 번에 받아왔기 때문에 PR 30건을 가져온다고 치면 API 요청도 30회 정도 였습니다.

하지만 Search API로 전환한 뒤에는 PR 단건당 2건(commit, file)이 추가로 날아가기 때문에 서버에서 처리해야하는 API 요청이 급격히 증가했습니다.

서버 부하 뿐만 아니라 사용자에게 PR 목록이 제공되는 시간도 많이 느려졌습니다.

그래서 조회 성능과 서버 부하를 줄이기 위해 설계를 바꿨습니다.

GitHub API는 실시간 조회용이 아닌 **DB 적재용**으로 사용하고, 사용자가 보는 PR 목록 및 PR 상세 정보는 DB를 통해 제공하도록 전환했습니다.

한 번에 보여주는 PR의 개수를 30개로 정했으니 DB에 31개를 먼저 조회하고, 부족한 경우에만 GitHu에 Search API로 가져와서 DB에 채워넣은 뒤 재조회하는 흐름인 것입니다.

이로써 외부 API 호출에 덜 의존적이고, 같은 저장소를 등록한 사용자들끼리 DB의 내용을 공유하여 API 호출이 불필요하게 사용자마다 반복되지 않게 되었습니다.

<br>

#### 5. DB에 적재한 PR의 stale 가능성

<br>

PR을 DB에 적재하면서 속도와 서버 부하는 개선됐습니다.

하지만, 아무리 병합된 PR이라 하더라도 수정, 삭제가 가능하기 때문에 DB에 적재된 PR들은 stale해질 수 있었습니다.

DB에 적재된 PR은 어디까지나 **Search API로 가져온 시점의 스냅샷**이기 때입니다.

<br>

## 트러블 슈팅

<br>

### GitHub Search API로 전환 시 저장소를 덜 가져오는 문제 발생

<br>

## 시연 영상

<br>

### 1. MVP 구현 후 시연 영상

기본적인 고도화 이전의 시연 영상입니다.

https://youtu.be/fgoc-tAD9Q4

<br>

### 2. 1차 '저장소 가져오기' 플로우 개선 후 시연 영상

'저장소 가져오기' 플로우를 사용자 조직 별로 저장소를 가져오도록 개선한 이후의 시연 영상입니다.

https://youtu.be/sxuB5osFPLE

<br>

### 3. '저장소 가져오기'에 GraphQL 도입 및 'PR 가져오기' 고도화 후 시연 영상

기존에는 REST 기반으로 구현했던 '저장소 가져오기'를 GraphQL 커서 기반 페이지네이션으로 전환하고, 'PR 가져오기'는 SSE를 적용해 동기화 진행상황을 클라이언트단에서 실시간으로 보여주도록 UX를 개선한 뒤의 시연 영상입니다.

https://youtu.be/zVHu3-uJBGk

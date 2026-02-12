# PRiido

<br>

## 개요

PRiido는 GitHub PR 정보를 기반으로 비개발자(경영진)가 이해하기 쉬운 개발 보고서를 자동으로 생성하는 서비스입니다.

<br>

## 배경

매주 여러 저장소에서 병합된 PR을 확인하고 핵심 변경사항을 요약하는 작업은 필요 이상의 시간이 투입됩니다.

또한 PR은 개발자 관점으로 작성되는 경우가 많아, 경영진에게 공유할 때는 추가적인 정리가 필요합니다.

<br>

## 목표

PRiido는 다음 과정을 자동화합니다.

- GitHub API로 병합된 PR을 수집합니다.
- PR의 제목, 본문, 작성자, 병합 날짜, 변경 파일 수 등의 핵심 정보를 정리합니다.
- Claude API를 통해 비개발자도 이해하기 쉬운 보고서를 생성합니다.
- 보고서는 마크다운 형태로 제공됩니다.

<br>

## 실행 방법

### 1. 배포 환경

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

- **언어**: TypeScript
- **프레임워크**: NestJS
- **데이터베이스**: PostgreSQL, Redis
- **AI**: Claude API
- **Cloud**: AWS
- **CI/CD**: GitHub Actions, Elastic Container Registry, Code Deploy

<br>

## 기술 스택 선정 이유

`NestJS`, `TypeScript`, `PostgreSQL`은 스위그 팀에서 실제로 사용하는 백엔드 스택이기 때문에 선택했습니다.

최초에는 과제 테스트처럼 제한 시간 내에 요구사항을 구현해야하는 상황에서 익숙한 Spring Boot를 사용하는 것이 낫지 않을까 고민했습니다.

하지만 과제 테스트의 목적이 구현보다도 **문제 정의**, **선택과 근거**, **고민과 트레이드오프**, **트러블 슈팅** 쪽에 무게를 더 두기 때문에, 기술 스택을 맞춘 상태에서 해당 지표들을 챙기는 쪽이 더 유리할 것이라 판단했습니다.

배포는 AWS를 클라우드 컴퓨팅 서비스 중 가장 많이 사용해봤기 때문에 선택했습니다.

CI/CD도 백엔드의 경우에는 GitHub Actions에서 Docker 이미지를 빌드해 Elastic Container Registry에 push한 뒤, Code Deploy를 통해 배포가 진행되도록 구성했습니다.

<br>

## 아키텍처

![PRiido_architecture](./images/PRiido_architecture.png)

<br>

## 의존성

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

## ERD

![PRiido ERD](./images/priido_erd.png)

<!-- TODO: ERD 수정한거 반영해야 함 -->

<br>

## 문제 정의

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

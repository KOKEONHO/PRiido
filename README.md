# PRiido

<br>

## 개요

**PRiido**는 GitHub PR 정보를 기반으로 비개발자(경영진)가 이해하기 쉬운 개발 보고서를 자동으로 생성하는 서비스입니다.

<br>

## 배경

매주 여러 저장소에서 병합된 PR을 확인하고 핵심 변경사항을 요약하는 작업은 필요 이상의 시간이 투입됩니다.

또한 PR은 개발자 관점으로 작성되는 경우가 많아, 경영진에게 공유할 때는 추가적인 정리가 필요합니다.

<br>

## 목표

**PRiido**는 다음 과정을 자동화합니다.

- GitHub API로 병합된 PR을 수집합니다.
- PR의 제목, 본문, 작성자, 병합 날짜, 변경 파일 수 등의 핵심 정보를 정리합니다.
- Claude API를 통해 비개발자도 이해하기 쉬운 보고서를 생성합니다.
- 보고서는 Markdown 형태로 제공됩니다.

<br>

## 사용 기술 스택

- 언어: TypeScript
- 프레임워크: NestJS
- 데이터베이스: PostgreSQL
- AI: Claude

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

## ERD

![PRiido ERD](./images/priido_erd.png)

#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/home/ec2-user/app/.env"
DOCKER_NETWORK="${DOCKER_NETWORK:-priido-net}"

if [ ! -f "${ENV_FILE}" ]; then
  echo "[start] ERROR: env file not found: ${ENV_FILE}" >&2
  exit 1
fi

set -a
. "${ENV_FILE}"
set +a

: "${AWS_REGION:?AWS_REGION is required in .env}"
: "${ECR_REPOSITORY:?ECR_REPOSITORY is required in .env}"
: "${CONTAINER_NAME:?CONTAINER_NAME is required in .env}"
: "${PORT:?PORT is required in .env}"

HOST_PORT="${HOST_PORT:-$PORT}"
CONTAINER_PORT="${CONTAINER_PORT:-$PORT}"

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
IMAGE_URI="${ECR_REGISTRY}/${ECR_REPOSITORY}:latest"

# ===== DB SSL (RDS CA mount) =====
DB_SSL_ENABLED="${DB_SSL_ENABLED:-true}"

CA_HOST_PATH="${DB_SSL_CA_HOST_PATH:-/etc/ssl/rds-ca/global-bundle.pem}"
CA_CONTAINER_PATH="${DB_SSL_CA_PATH:-/run/secrets/rds-ca.pem}"

DOCKER_SSL_ARGS=()
if [ "${DB_SSL_ENABLED}" = "true" ] || [ "${DB_SSL_ENABLED}" = "TRUE" ]; then
  if [ ! -f "${CA_HOST_PATH}" ]; then
    echo "[start] ERROR: DB_SSL_ENABLED=true but CA file not found on host: ${CA_HOST_PATH}" >&2
    echo "[start]        Download it first, e.g.:" >&2
    echo "[start]        sudo mkdir -p /etc/ssl/rds-ca" >&2
    echo "[start]        sudo curl -fsSL -o /etc/ssl/rds-ca/global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem" >&2
    echo "[start]        sudo chmod 0644 /etc/ssl/rds-ca/global-bundle.pem" >&2
    exit 1
  fi

  DOCKER_SSL_ARGS+=(
    "-e" "DB_SSL_CA_PATH=${CA_CONTAINER_PATH}"
    "-v" "${CA_HOST_PATH}:${CA_CONTAINER_PATH}:ro"
  )
fi

# ===== Ensure docker network exists =====
if ! docker network inspect "${DOCKER_NETWORK}" >/dev/null 2>&1; then
  echo "[start] docker network not found: ${DOCKER_NETWORK}. creating..."
  docker network create "${DOCKER_NETWORK}" >/dev/null
fi

echo "[start] login to ecr: ${ECR_REGISTRY}"
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${ECR_REGISTRY}"

echo "[start] pull image: ${IMAGE_URI}"
docker pull "${IMAGE_URI}"

echo "[start] replace container: ${CONTAINER_NAME}"
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  docker rm -f "${CONTAINER_NAME}" || true
fi

docker run -d \
  --name "${CONTAINER_NAME}" \
  --network "${DOCKER_NETWORK}" \
  --env-file "${ENV_FILE}" \
  "${DOCKER_SSL_ARGS[@]}" \
  -p "${HOST_PORT}:${CONTAINER_PORT}" \
  --restart unless-stopped \
  "${IMAGE_URI}"

echo "[start] done."
docker ps --filter "name=${CONTAINER_NAME}"

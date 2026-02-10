#!/usr/bin/env bash
set -euo pipefail

echo "[before_install] ensure docker/awscli/curl..."

# Amazon Linux 2 기준
yum update -y
yum install -y docker awscli curl

systemctl enable docker
systemctl start docker

echo "[before_install] docker: $(docker --version)"
echo "[before_install] aws: $(aws --version)"

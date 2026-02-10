#!/usr/bin/env bash
set -euo pipefail

echo "[before_install] ensure docker/awscli..."

dnf -y update
dnf -y install docker awscli

systemctl enable docker
systemctl start docker

chmod +x /home/ec2-user/app/scripts/*.sh || true

echo "[before_install] docker: $(docker --version)"
echo "[before_install] aws: $(aws --version)"

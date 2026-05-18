#!/usr/bin/env bash
set -euo pipefail

if ! command -v curl >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y curl
fi

if ! command -v k3s >/dev/null 2>&1; then
  curl -sfL https://get.k3s.io | sh -
fi

sudo systemctl enable k3s
sudo systemctl restart k3s

sudo mkdir -p /etc/rancher/k3s
sudo chmod 755 /etc/rancher/k3s

echo "K3s single-node ready"
echo "Kubeconfig: /etc/rancher/k3s/k3s.yaml"

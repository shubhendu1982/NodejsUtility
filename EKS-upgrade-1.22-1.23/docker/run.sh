#!/usr/bin/env bash

set -eu

check_required_variables() {
  local required_env="${1}"

  for reqvar in $required_env
  do
    if [ -z "${!reqvar}" ]
    then
      echo "[ERROR] missing environment variable ${reqvar}!"
      return 1
    fi
  done
}

CURRENT_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

check_required_variables "GH_TOKEN"

mkdir -p .kube && cp ~/.kube/config .kube

docker build -t eks-upgrader -f $CURRENT_SCRIPT_DIR/Dockerfile .

cd ..

docker run -it --rm \
  --platform linux/amd64 \
  --volume ${HOME}/.aws:/root/.aws \
  --volume ${HOME}/.ssh:/root/.ssh \
  --volume ${HOME}/.gitconfig:/etc/gitconfig \
  --volume $CURRENT_SCRIPT_DIR/../bin:/root/bin \
  -e GH_TOKEN=$GH_TOKEN \
  -e SSH_PASS=$SSH_PASS \
  eks-upgrader \
  bash

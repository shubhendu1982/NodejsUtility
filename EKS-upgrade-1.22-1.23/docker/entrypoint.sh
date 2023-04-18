#!/bin/sh

gh auth login --hostname gitHub.com

eval `ssh-agent -s`
DISPLAY=1 SSH_ASKPASS=./echo_pass.sh ssh-add ~/.ssh/id_rsa < /dev/null

exec "$@"

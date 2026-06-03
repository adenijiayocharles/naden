#!/bin/sh
set -e
echo "root:${ROOT_PASSWORD:-secret}" | chpasswd
exec /usr/sbin/sshd -D -e

FROM alpine:3.21

RUN apk add --no-cache openssh bash && \
    ssh-keygen -A && \
    printf 'PermitRootLogin yes\nPasswordAuthentication yes\nPubkeyAuthentication no\nAllowTcpForwarding yes\n' \
        > /etc/ssh/sshd_config

# Root password is set at container start via entrypoint so it can be
# overridden per-service with the ROOT_PASSWORD env var.
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 22
ENTRYPOINT ["/entrypoint.sh"]

FROM alpine:3.21

RUN apk add --no-cache openssh bash && \
    ssh-keygen -A && \
    echo "PasswordAuthentication yes" >> /etc/ssh/sshd_config && \
    echo "PermitRootLogin yes"        >> /etc/ssh/sshd_config

# Root password is set at container start via entrypoint so it can be
# overridden per-service with the ROOT_PASSWORD env var.
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 22
ENTRYPOINT ["/entrypoint.sh"]

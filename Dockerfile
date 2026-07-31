# Build plakar using a lightweight Debian base
# This is a custom Dockerfile for building plakar images
# Source code is expected in the plakar-src directory
# Integrations are expected in integrations-k8s and integrations-rclone directories

# Stage 1: Build plakar binary
FROM golang:1.25-bookworm AS plakar-builder

WORKDIR /src

# Cache dependency downloads from plakar-src
COPY plakar-src/go.mod plakar-src/go.sum ./
RUN go mod download

# Copy full source from plakar-src
COPY plakar-src/ .

# Build static binary matching goreleaser configuration
RUN CGO_ENABLED=0 go build -trimpath -v -o /plakar .

# Stage 2: Build integration packages using plakar
FROM golang:1.25-bookworm AS pkg-builder

# Install CA certificates, git, and make
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git make && \
    rm -rf /var/lib/apt/lists/*

# Copy plakar binary from previous stage
COPY --from=plakar-builder /plakar /usr/local/bin/plakar

# Build arguments for integration versions
ARG K8S_VERSION
ARG RCLONE_VERSION

# Copy integrations source
COPY integrations-k8s/k8s /integrations/k8s
COPY integrations-rclone/rclone /integrations/rclone

# Build packages - build each integration with make, then create package
WORKDIR /integrations/k8s
RUN make && \
    plakar pkg create /integrations/k8s/manifest.yaml ${K8S_VERSION}

WORKDIR /integrations/rclone
RUN make && \
    plakar pkg create /integrations/rclone/manifest.yaml ${RCLONE_VERSION}

# Stage 3: Runtime - using lightweight Debian
FROM debian:bookworm-slim

ARG PLAKAR_UID=10001
ARG PLAKAR_GID=10001

# Install CA certificates for HTTPS connections
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Create a stable non-root identity shared with the Kubernetes security context.
RUN groupadd --gid "${PLAKAR_GID}" plakar && \
    useradd --uid "${PLAKAR_UID}" --gid plakar --create-home --home-dir /home/plakar --shell /usr/sbin/nologin plakar

COPY --from=pkg-builder /usr/local/bin/plakar /usr/local/bin/plakar
ARG K8S_VERSION
ARG RCLONE_VERSION
COPY --from=pkg-builder --chown=plakar:plakar /integrations/k8s/k8s_${K8S_VERSION}_linux_amd64.ptar /tmp/plakar-packages/
COPY --from=pkg-builder --chown=plakar:plakar /integrations/rclone/rclone_${RCLONE_VERSION}_linux_amd64.ptar /tmp/plakar-packages/

USER plakar
WORKDIR /home/plakar
RUN plakar pkg add /tmp/plakar-packages/k8s_${K8S_VERSION}_linux_amd64.ptar && \
    plakar pkg add /tmp/plakar-packages/rclone_${RCLONE_VERSION}_linux_amd64.ptar && \
    rm -rf /tmp/plakar-packages

ENTRYPOINT ["plakar"]

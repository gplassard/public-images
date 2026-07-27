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

# Add packages to plakar
WORKDIR /
RUN plakar pkg add ./k8s_*_linux_amd64.ptar && \
    plakar pkg add ./rclone_*_linux_amd64.ptar

# Stage 3: Runtime - using lightweight Debian
FROM debian:bookworm-slim

# Install CA certificates for HTTPS connections
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r plakar && useradd -r -g plakar -d /home/plakar -s /bin/false plakar

COPY --from=pkg-builder /usr/local/bin/plakar /usr/local/bin/plakar

USER plakar
WORKDIR /home/plakar

ENTRYPOINT ["plakar"]

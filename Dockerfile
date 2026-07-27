# Build plakar using a lightweight Debian base
# This is a custom Dockerfile for building plakar images
# Source code is expected in the plakar-src directory

# Stage 1: Build
FROM golang:1.25-bookworm AS builder

WORKDIR /src

# Cache dependency downloads from plakar-src
COPY plakar-src/go.mod plakar-src/go.sum ./
RUN go mod download

# Copy full source from plakar-src
COPY plakar-src/ .

# Build static binary matching goreleaser configuration
RUN CGO_ENABLED=0 go build -trimpath -v -o /plakar .

# Stage 2: Runtime - using lightweight Debian
FROM debian:bookworm-slim

# Install CA certificates for HTTPS connections
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r plakar && useradd -r -g plakar -d /home/plakar -s /bin/false plakar

COPY --from=builder /plakar /usr/local/bin/plakar

USER plakar
WORKDIR /home/plakar

ENTRYPOINT ["plakar"]

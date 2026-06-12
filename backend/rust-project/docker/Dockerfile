# QVAC Provider Daemon - Dockerfile
# Multi-stage build for minimal production image

# Build stage
FROM rust:1.82-slim AS builder

# Install system dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    libclang-dev \
    build-essential \
    cmake \
    && rm -rf /var/lib/apt/lists/*

# Install Firecracker dependencies
RUN apt-get update && apt-get install -y \
    libkvm-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Copy Cargo files first for better caching
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY config ./config

# Build release binary
RUN cargo build --release --locked

# Runtime stage
FROM debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    libgcc-s1 \
    libstdc++6 \
    iproute2 \
    iptables \
    kmod \
    systemd \
    && rm -rf /var/lib/apt/lists/*

# Install Firecracker
RUN ARCH=$(uname -m) && \
    curl -L -o /tmp/firecracker.tgz \
    "https://github.com/firecracker-microvm/firecracker/releases/download/v1.7.0/firecracker-v1.7.0-${ARCH}.tgz" && \
    tar -xzf /tmp/firecracker.tgz -C /usr/local/bin/ && \
    rm /tmp/firecracker.tgz

# Install gVisor (runsc)
RUN ARCH=$(uname -m) && \
    curl -L -o /tmp/runsc \
    "https://storage.googleapis.com/gvisor/releases/release/latest/${ARCH}/runsc" && \
    chmod +x /tmp/runsc && \
    mv /tmp/runsc /usr/local/bin/runsc

# Install NVIDIA container toolkit (for GPU passthrough)
RUN curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg && \
    curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
    sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
    tee /etc/apt/sources.list.d/nvidia-container-toolkit.list && \
    apt-get update && apt-get install -y nvidia-container-toolkit && \
    rm -rf /var/lib/apt/lists/*

# Create qvac user
RUN useradd -r -s /bin/bash -m -d /home/qvac qvac

# Create directories
RUN mkdir -p /home/qvac/config /home/qvac/models /home/qvac/logs /var/lib/qvac && \
    chown -R qvac:qvac /home/qvac /var/lib/qvac

# Copy binary from builder
COPY --from=builder /build/target/release/qvac-provider /usr/local/bin/qvac-provider

# Copy default config
COPY config/qvac.config.json /home/qvac/config/qvac.config.json
RUN chown qvac:qvac /home/qvac/config/qvac.config.json

# Copy systemd unit
COPY systemd/qvac-provider.service /etc/systemd/system/qvac-provider.service

# Set up entrypoint
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Switch to qvac user
USER qvac
WORKDIR /home/qvac

# Expose metrics port
EXPOSE 9090

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:9090/metrics || exit 1

# Entrypoint
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["start", "--config", "/home/qvac/config/qvac.config.json"]
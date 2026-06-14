#!/bin/bash

# Build script for QVAC-Pear Miner Node Docker image

set -e

IMAGE_NAME="qvac-pear-miner"
IMAGE_TAG="latest"
CONTAINER_NAME="qvac-pear-miner-node"

echo "🐳 Building QVAC-Pear Miner Node Docker image..."
echo "Image: ${IMAGE_NAME}:${IMAGE_TAG}"

# Build the Docker image
docker build -t ${IMAGE_NAME}:${IMAGE_TAG} .

echo "✅ Build completed successfully!"
echo ""
echo "To run the container:"
echo "  docker run -d -p 3000:3000 -v \$(pwd)/data:/app/data --name ${CONTAINER_NAME} ${IMAGE_NAME}:${IMAGE_TAG}"
echo ""
echo "Or use Docker Compose:"
echo "  docker-compose up -d"
echo ""
echo "To view logs:"
echo "  docker logs -f ${CONTAINER_NAME}"
echo ""
echo "To stop the container:"
echo "  docker stop ${CONTAINER_NAME}"
echo "  docker rm ${CONTAINER_NAME}"

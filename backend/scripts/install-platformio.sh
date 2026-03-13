#!/bin/bash
# Install PlatformIO CLI for on-demand firmware builds
# Run from the project root: bash backend/scripts/install-platformio.sh

set -e

VENV_DIR="backend/venv"

if [ ! -d "$VENV_DIR" ]; then
    echo "Error: Backend venv not found at $VENV_DIR"
    echo "Run from the project root directory."
    exit 1
fi

echo "Installing PlatformIO CLI in backend venv..."
"$VENV_DIR/bin/pip" install platformio

echo "Installing ESP32 platform..."
"$VENV_DIR/bin/pio" platform install espressif32

echo "Installing ESP8266 platform..."
"$VENV_DIR/bin/pio" platform install espressif8266

echo ""
echo "PlatformIO installed successfully."
"$VENV_DIR/bin/pio" --version
echo "Supported boards: ESP32-S3, ESP32-C3, ESP8266"

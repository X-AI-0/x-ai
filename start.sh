#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "========================================"
echo " Ollama Multi-Model Discussion System"
echo "========================================"
echo

# Set NVIDIA GPU environment variables for Ollama
echo -e "${BLUE}[0/5] Setting NVIDIA GPU configuration...${NC}"
export CUDA_VISIBLE_DEVICES=0
export NVIDIA_VISIBLE_DEVICES=0
export CUDA_DEVICE_ORDER=PCI_BUS_ID
export OLLAMA_NUM_GPU=1
export OLLAMA_GPU_LAYERS=-1
export OLLAMA_FORCE_GPU=1
export OLLAMA_LLM_LIBRARY=cuda
export OLLAMA_SKIP_CPU_GENERATE=1
export OLLAMA_HOST=127.0.0.1:11434
echo -e "${GREEN}GPU environment variables set for NVIDIA acceleration${NC}"
echo

echo -e "${BLUE}[1/5] Checking Node.js installation...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}ERROR: Node.js is not installed${NC}"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi
echo -e "${GREEN}Node.js found!${NC}"

echo
echo -e "${BLUE}[2/5] Checking and starting Ollama service...${NC}"

# Check if local Ollama exists
if [ -f "ollama/ollama" ]; then
    echo -e "${GREEN}Found local Ollama installation${NC}"
    
    # Stop any existing Ollama processes first
    echo "Stopping existing Ollama processes..."
    pkill -f ollama 2>/dev/null || true
    sleep 2
    
    # Set models directory for local installation
    export OLLAMA_MODELS="$(pwd)/ollama/models"
    
    echo "Starting Ollama service with GPU acceleration..."
    echo "GPU Config: CUDA_VISIBLE_DEVICES=$CUDA_VISIBLE_DEVICES"
    echo "GPU Layers: OLLAMA_GPU_LAYERS=$OLLAMA_GPU_LAYERS"
    echo "Models Dir: $OLLAMA_MODELS"
    
    # Start Ollama service in background
    nohup ./ollama/ollama serve > ollama.log 2>&1 &
    
    echo "Waiting for Ollama service to start..."
    sleep 5
    
    # Verify Ollama is running
    if ./ollama/ollama ps &>/dev/null; then
        echo -e "${GREEN}✅ Ollama service started successfully!${NC}"
    else
        echo -e "${YELLOW}⚠️  Ollama service may not be fully ready yet${NC}"
    fi
elif command -v ollama &> /dev/null; then
    echo -e "${GREEN}Found system Ollama installation${NC}"
    
    # Stop any existing Ollama processes first
    echo "Stopping existing Ollama processes..."
    pkill -f ollama 2>/dev/null || true
    sleep 2
    
    echo "Starting system Ollama service with GPU acceleration..."
    echo "GPU Config: CUDA_VISIBLE_DEVICES=$CUDA_VISIBLE_DEVICES"
    echo "GPU Layers: OLLAMA_GPU_LAYERS=$OLLAMA_GPU_LAYERS"
    
    # Start system Ollama service in background
    nohup ollama serve > ollama.log 2>&1 &
    
    echo "Waiting for Ollama service to start..."
    sleep 5
    
    # Verify Ollama is running
    if ollama ps &>/dev/null; then
        echo -e "${GREEN}✅ Ollama service started successfully!${NC}"
    else
        echo -e "${YELLOW}⚠️  Ollama service may not be fully ready yet${NC}"
    fi
else
    echo -e "${YELLOW}ℹ️  Ollama not found - you can install it from the Models page${NC}"
fi

echo
echo -e "${BLUE}[3/5] Cleaning up ports 3000 and 3001...${NC}"

# Function to kill processes using specific ports
cleanup_port() {
    local port=$1
    echo "Checking port $port..."
    
    # Find and kill processes using the port
    local pids=$(lsof -ti:$port 2>/dev/null)
    if [ ! -z "$pids" ]; then
        echo "Killing processes using port $port: $pids"
        echo $pids | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
}

cleanup_port 3000
cleanup_port 3001

# Also kill any remaining Node.js processes for safety
echo "Cleaning up any remaining Node.js processes..."
pkill -f "node.*dev" 2>/dev/null || true

echo "Waiting for ports to be fully released..."
sleep 3

echo -e "${GREEN}Port cleanup completed!${NC}"

echo
echo -e "${BLUE}[4/5] Installing/updating dependencies...${NC}"
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies for the first time..."
    npm install
else
    echo "Dependencies already installed, skipping..."
fi

echo
echo -e "${BLUE}[5/5] Starting the application...${NC}"
echo
echo "========================================"
echo " Application Information"
echo "========================================"
echo "Frontend: http://localhost:3000"
echo "Backend:  http://localhost:3001"
echo "GPU:      NVIDIA GPU Acceleration ENABLED"
echo "Ollama:   Service started with GPU support"
echo
echo "Note: If Ollama is not installed, you can install it from the Models page"
echo "Starting servers and opening browser..."
echo "Press Ctrl+C to stop the application"
echo "========================================"
echo

# Open browser after delay (macOS/Linux)
(sleep 8 && {
    if command -v xdg-open &> /dev/null; then
        xdg-open http://localhost:3000
    elif command -v open &> /dev/null; then
        open http://localhost:3000
    fi
}) &

# Start the development servers (this will keep running)
npm run dev 
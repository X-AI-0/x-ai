#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================"
echo -e " Port Cleanup Tool (3000 & 3001)"
echo -e "========================================${NC}"
echo

echo "This script will forcefully kill all processes using ports 3000 and 3001"
echo
read -p "Press Enter to continue or Ctrl+C to cancel..."

echo
echo "Starting port cleanup..."
echo

# Function to kill processes using specific ports
cleanup_port() {
    local port=$1
    local step=$2
    echo -e "${YELLOW}[$step/4] Checking port $port...${NC}"
    local found=false
    
    # Find processes using the port
    if command -v lsof &> /dev/null; then
        # Use lsof if available (most Unix systems)
        local pids=$(lsof -ti:$port 2>/dev/null)
        if [ ! -z "$pids" ]; then
            found=true
            for pid in $pids; do
                echo "Found process $pid using port $port"
                kill -9 $pid 2>/dev/null
                if [ $? -eq 0 ]; then
                    echo -e "${GREEN}✓ Successfully killed process $pid${NC}"
                else
                    echo -e "${RED}✗ Failed to kill process $pid${NC}"
                fi
            done
        fi
    elif command -v netstat &> /dev/null; then
        # Fallback to netstat
        local pids=$(netstat -tlnp 2>/dev/null | grep ":$port " | awk '{print $7}' | cut -d'/' -f1)
        if [ ! -z "$pids" ]; then
            found=true
            for pid in $pids; do
                if [ "$pid" != "-" ] && [ ! -z "$pid" ]; then
                    echo "Found process $pid using port $port"
                    kill -9 $pid 2>/dev/null
                    if [ $? -eq 0 ]; then
                        echo -e "${GREEN}✓ Successfully killed process $pid${NC}"
                    else
                        echo -e "${RED}✗ Failed to kill process $pid${NC}"
                    fi
                fi
            done
        fi
    else
        echo -e "${YELLOW}⚠ Cannot check ports (lsof and netstat not available)${NC}"
        return
    fi
    
    if [ "$found" = false ]; then
        echo -e "${GREEN}✓ Port $port is already free${NC}"
    fi
}

# Clean up ports
cleanup_port 3000 1
echo
cleanup_port 3001 2

echo
echo -e "${YELLOW}[3/4] Cleaning up Node.js processes...${NC}"
local node_killed=false
if pkill -f "node" 2>/dev/null; then
    echo -e "${GREEN}✓ Killed remaining Node.js processes${NC}"
    node_killed=true
else
    echo -e "${GREEN}✓ No Node.js processes found${NC}"
fi

echo
echo -e "${YELLOW}[4/4] Waiting for ports to be released...${NC}"
sleep 3

echo
echo "Final verification:"
if command -v lsof &> /dev/null; then
    if lsof -ti:3000 &> /dev/null; then
        echo -e "${RED}✗ Port 3000 is still in use${NC}"
    else
        echo -e "${GREEN}✓ Port 3000 is free${NC}"
    fi
    
    if lsof -ti:3001 &> /dev/null; then
        echo -e "${RED}✗ Port 3001 is still in use${NC}"
    else
        echo -e "${GREEN}✓ Port 3001 is free${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Cannot verify ports (lsof not available)${NC}"
fi

echo
echo -e "${BLUE}========================================"
echo -e " Cleanup completed!"
echo -e "========================================${NC}"
echo
echo "You can now run ./start.sh to start the application."
echo 
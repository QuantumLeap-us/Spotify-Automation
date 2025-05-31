#!/bin/bash

# Spotify Stealth Automation Startup Script
# Usage: ./scripts/start.sh [sessions] [mode]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
DEFAULT_SESSIONS=3
DEFAULT_MODE="docker"

# Parse arguments
SESSIONS=${1:-$DEFAULT_SESSIONS}
MODE=${2:-$DEFAULT_MODE}

echo -e "${BLUE}🎵 Spotify Stealth Automation System${NC}"
echo -e "${BLUE}====================================${NC}"
echo ""

# Validate session count
if ! [[ "$SESSIONS" =~ ^[0-9]+$ ]] || [ "$SESSIONS" -lt 1 ] || [ "$SESSIONS" -gt 1000 ]; then
    echo -e "${RED}❌ Error: Session count must be between 1 and 1000${NC}"
    exit 1
fi

# Function to check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        echo -e "${RED}❌ Error: Docker is not running${NC}"
        echo -e "${YELLOW}Please start Docker and try again${NC}"
        exit 1
    fi
}

# Function to check if config files exist
check_config() {
    if [ ! -f "config/accounts.yaml" ]; then
        echo -e "${RED}❌ Error: config/accounts.yaml not found${NC}"
        echo -e "${YELLOW}Please create the configuration file with your accounts${NC}"
        exit 1
    fi
    
    # Check if accounts.yaml has actual accounts
    if ! grep -q "email:" config/accounts.yaml; then
        echo -e "${RED}❌ Error: No accounts found in config/accounts.yaml${NC}"
        echo -e "${YELLOW}Please add your Spotify accounts to the configuration${NC}"
        exit 1
    fi
}

# Function to create necessary directories
create_directories() {
    echo -e "${BLUE}📁 Creating directories...${NC}"
    mkdir -p logs sessions temp
    echo -e "${GREEN}✅ Directories created${NC}"
}

# Function to start in Docker mode
start_docker() {
    echo -e "${BLUE}🐳 Starting Docker containers...${NC}"
    echo -e "${YELLOW}Sessions: $SESSIONS${NC}"
    echo ""
    
    # Build the image
    echo -e "${BLUE}🔨 Building Docker image...${NC}"
    docker-compose build
    
    # Start the services
    echo -e "${BLUE}🚀 Starting services...${NC}"
    docker-compose up -d --scale session=$SESSIONS
    
    echo ""
    echo -e "${GREEN}✅ Docker containers started successfully!${NC}"
    echo -e "${BLUE}📊 Container status:${NC}"
    docker-compose ps
    
    echo ""
    echo -e "${BLUE}📝 To view logs:${NC}"
    echo -e "${YELLOW}  docker-compose logs -f session${NC}"
    echo ""
    echo -e "${BLUE}🛑 To stop:${NC}"
    echo -e "${YELLOW}  docker-compose down${NC}"
}

# Function to start in local mode
start_local() {
    echo -e "${BLUE}💻 Starting in local mode...${NC}"
    echo -e "${YELLOW}Sessions: $SESSIONS${NC}"
    echo ""
    
    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        echo -e "${BLUE}📦 Installing dependencies...${NC}"
        npm install
    fi
    
    # Install Playwright browsers if needed
    if [ ! -d "node_modules/playwright/.local-browsers" ]; then
        echo -e "${BLUE}🌐 Installing Playwright browsers...${NC}"
        npx playwright install chromium
    fi
    
    # Start the application
    echo -e "${BLUE}🚀 Starting application...${NC}"
    SESSION_COUNT=$SESSIONS node src/index.js
}

# Function to show usage
show_usage() {
    echo -e "${BLUE}Usage: $0 [sessions] [mode]${NC}"
    echo ""
    echo -e "${YELLOW}Arguments:${NC}"
    echo -e "  sessions    Number of concurrent sessions (1-1000, default: $DEFAULT_SESSIONS)"
    echo -e "  mode        Execution mode: 'docker' or 'local' (default: $DEFAULT_MODE)"
    echo ""
    echo -e "${YELLOW}Examples:${NC}"
    echo -e "  $0                    # Start 3 sessions in Docker"
    echo -e "  $0 10                 # Start 10 sessions in Docker"
    echo -e "  $0 5 local            # Start 5 sessions locally"
    echo -e "  $0 100 docker         # Start 100 sessions in Docker"
    echo ""
    echo -e "${YELLOW}Docker Commands:${NC}"
    echo -e "  docker-compose logs -f session    # View session logs"
    echo -e "  docker-compose ps                 # Check container status"
    echo -e "  docker-compose down               # Stop all containers"
    echo -e "  docker-compose up -d --scale session=50  # Scale to 50 sessions"
}

# Main execution
main() {
    # Show help if requested
    if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
        show_usage
        exit 0
    fi
    
    echo -e "${BLUE}🔍 Checking prerequisites...${NC}"
    
    # Check configuration
    check_config
    
    # Create directories
    create_directories
    
    # Execute based on mode
    case $MODE in
        "docker")
            check_docker
            start_docker
            ;;
        "local")
            start_local
            ;;
        *)
            echo -e "${RED}❌ Error: Invalid mode '$MODE'${NC}"
            echo -e "${YELLOW}Valid modes: docker, local${NC}"
            exit 1
            ;;
    esac
    
    echo ""
    echo -e "${GREEN}🎉 Startup completed!${NC}"
    echo -e "${BLUE}Monitor the logs to see the automation in action.${NC}"
}

# Run main function
main "$@"

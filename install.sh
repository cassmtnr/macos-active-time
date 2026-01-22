#!/bin/bash
set -e

echo "==================================="
echo "  Work Tracker Installer"
echo "==================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check for Bun
if ! command -v bun &> /dev/null; then
    echo -e "${RED}Error: Bun is not installed.${NC}"
    echo "Install Bun first: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

echo -e "${GREEN}✓${NC} Bun found: $(bun --version)"

# Directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$HOME/.work-tracker"
DATA_DIR="$INSTALL_DIR"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST_NAME="com.worktracker.daemon.plist"

# Create directories
echo ""
echo "Creating directories..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$LAUNCH_AGENTS_DIR"

# Install dependencies
echo "Installing dependencies..."
cd "$SCRIPT_DIR"
bun install

# Build executables
echo "Building executables..."
bun build --compile --outfile="$INSTALL_DIR/work-tracker" src/cli.ts
bun build --compile --outfile="$INSTALL_DIR/work-tracker-daemon" src/daemon.ts

echo -e "${GREEN}✓${NC} Built executables"

# Create symlink in /usr/local/bin for easy access
if [ -d "/usr/local/bin" ]; then
    echo "Creating symlink in /usr/local/bin..."
    ln -sf "$INSTALL_DIR/work-tracker" /usr/local/bin/work-tracker 2>/dev/null || {
        echo -e "${YELLOW}Note: Could not create symlink in /usr/local/bin (may need sudo)${NC}"
        echo "You can manually run: sudo ln -sf $INSTALL_DIR/work-tracker /usr/local/bin/work-tracker"
    }
fi

# Install LaunchAgent
echo "Installing LaunchAgent..."
sed -e "s|__INSTALL_PATH__|$INSTALL_DIR|g" \
    -e "s|__HOME__|$HOME|g" \
    "$SCRIPT_DIR/config/$PLIST_NAME" > "$LAUNCH_AGENTS_DIR/$PLIST_NAME"

echo -e "${GREEN}✓${NC} LaunchAgent installed"

# Load the LaunchAgent
echo "Starting daemon..."
launchctl unload "$LAUNCH_AGENTS_DIR/$PLIST_NAME" 2>/dev/null || true
launchctl load "$LAUNCH_AGENTS_DIR/$PLIST_NAME"

echo -e "${GREEN}✓${NC} Daemon started"

echo ""
echo "==================================="
echo -e "${GREEN}  Installation Complete!${NC}"
echo "==================================="
echo ""
echo "The work tracker daemon is now running and will start automatically at login."
echo ""
echo "Usage:"
echo "  work-tracker status    - Show current session"
echo "  work-tracker today     - Show today's summary"
echo "  work-tracker report    - Show weekly report"
echo "  work-tracker export    - Export to CSV"
echo ""
echo "Data location: $DATA_DIR"
echo "Logs: $DATA_DIR/daemon.log"
echo ""

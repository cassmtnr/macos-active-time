#!/bin/bash
set -e

echo "==================================="
echo "  Work Tracker Uninstaller"
echo "==================================="
echo ""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

INSTALL_DIR="$HOME/.work-tracker"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST_NAME="com.worktracker.daemon.plist"

# Stop the daemon
echo "Stopping daemon..."
launchctl unload "$LAUNCH_AGENTS_DIR/$PLIST_NAME" 2>/dev/null || true
echo -e "${GREEN}✓${NC} Daemon stopped"

# Remove LaunchAgent
echo "Removing LaunchAgent..."
rm -f "$LAUNCH_AGENTS_DIR/$PLIST_NAME"
echo -e "${GREEN}✓${NC} LaunchAgent removed"

# Remove symlink
if [ -L "/usr/local/bin/work-tracker" ]; then
    echo "Removing symlink..."
    rm -f /usr/local/bin/work-tracker 2>/dev/null || {
        echo -e "${YELLOW}Note: Could not remove symlink (may need sudo)${NC}"
    }
fi

# Ask about data
echo ""
echo -e "${YELLOW}Do you want to remove your work tracking data?${NC}"
echo "Data location: $INSTALL_DIR"
read -p "Remove data? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -rf "$INSTALL_DIR"
    echo -e "${GREEN}✓${NC} Data removed"
else
    # Only remove executables, keep data
    rm -f "$INSTALL_DIR/work-tracker"
    rm -f "$INSTALL_DIR/work-tracker-daemon"
    rm -f "$INSTALL_DIR/event-watcher"
    rm -f "$INSTALL_DIR/event-watcher.swift"
    echo -e "${GREEN}✓${NC} Executables removed (data preserved)"
fi

echo ""
echo "==================================="
echo -e "${GREEN}  Uninstall Complete!${NC}"
echo "==================================="
echo ""

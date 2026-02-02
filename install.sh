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

# Check for Bun and install if needed
if ! command -v bun &> /dev/null; then
    echo -e "${YELLOW}Bun not found. Installing...${NC}"
    curl -fsSL https://bun.sh/install | bash

    # Source the shell profile to make bun available
    if [ -f "$HOME/.bashrc" ]; then
        source "$HOME/.bashrc"
    fi
    if [ -f "$HOME/.zshrc" ]; then
        source "$HOME/.zshrc" 2>/dev/null || true
    fi
    # Also check the default bun location
    if [ -f "$HOME/.bun/bin/bun" ]; then
        export BUN_INSTALL="$HOME/.bun"
        export PATH="$BUN_INSTALL/bin:$PATH"
    fi

    # Verify installation
    if ! command -v bun &> /dev/null; then
        echo -e "${RED}Error: Bun installation failed.${NC}"
        echo "Please install manually: curl -fsSL https://bun.sh/install | bash"
        echo "Then restart your terminal and run this script again."
        exit 1
    fi
    echo -e "${GREEN}✓${NC} Bun installed: $(bun --version)"
else
    echo -e "${GREEN}✓${NC} Bun found: $(bun --version)"
fi

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
SYMLINK_CREATED=false
if [ -d "/usr/local/bin" ]; then
    echo "Creating symlink in /usr/local/bin..."
    if ln -sf "$INSTALL_DIR/work-tracker" /usr/local/bin/work-tracker 2>/dev/null; then
        SYMLINK_CREATED=true
        echo -e "${GREEN}✓${NC} Symlink created"
    fi
fi

# If symlink failed, add to PATH in shell profile
if [ "$SYMLINK_CREATED" = false ]; then
    echo "Adding ~/.work-tracker to PATH..."

    # Determine shell profile
    SHELL_PROFILE=""
    if [ -n "$ZSH_VERSION" ] || [ "$SHELL" = "/bin/zsh" ]; then
        SHELL_PROFILE="$HOME/.zshrc"
    elif [ -n "$BASH_VERSION" ] || [ "$SHELL" = "/bin/bash" ]; then
        SHELL_PROFILE="$HOME/.bashrc"
    fi

    if [ -n "$SHELL_PROFILE" ] && [ -f "$SHELL_PROFILE" ]; then
        # Check if already in profile
        if ! grep -q 'export PATH="$HOME/.work-tracker:$PATH"' "$SHELL_PROFILE" 2>/dev/null; then
            echo '' >> "$SHELL_PROFILE"
            echo '# Work Tracker' >> "$SHELL_PROFILE"
            echo 'export PATH="$HOME/.work-tracker:$PATH"' >> "$SHELL_PROFILE"
            echo -e "${GREEN}✓${NC} Added to PATH in $SHELL_PROFILE"
            echo -e "${YELLOW}Note: Run 'source $SHELL_PROFILE' or restart your terminal for the PATH change to take effect${NC}"
        else
            echo -e "${GREEN}✓${NC} PATH already configured in $SHELL_PROFILE"
        fi
    else
        echo -e "${YELLOW}Note: Could not determine shell profile${NC}"
        echo "Add this to your shell profile: export PATH=\"\$HOME/.work-tracker:\$PATH\""
    fi
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

if [ "$SYMLINK_CREATED" = false ]; then
    echo ""
    echo -e "${YELLOW}Important: Restart your terminal or run:${NC}"
    echo "  source ~/.zshrc"
    echo ""
    echo "Then 'work-tracker' will be available."
fi
echo ""

#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

OUTPUT_DIR="${1:-./claude-code-rhel8}"
CLAUDE_VERSION="${2:-latest}"

echo "==> Building @anthropic-ai/claude-code for RHEL 8..."
echo "    Output directory: $OUTPUT_DIR"
echo "    Version: $CLAUDE_VERSION"

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

echo "==> Cross-compiling Claude Code for RHEL 8 (glibc 2.28)..."
docker run --rm -v "$PWD/$OUTPUT_DIR:/out" rockylinux:8 bash -c '
  set -e

  echo "==> Installing Node.js 22 and build tools..."
  curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
  dnf install -y nodejs gcc-c++ make python39 git
  alternatives --set python3 /usr/bin/python3.9

  echo "==> Installing Claude Code globally..."
  mkdir -p /build && cd /build

  if [ "'"$CLAUDE_VERSION"'" = "latest" ]; then
    npm install -g @anthropic-ai/claude-code
  else
    npm install -g @anthropic-ai/claude-code@"'"$CLAUDE_VERSION"'"
  fi

  echo "==> Locating Claude Code installation..."
  CLAUDE_PATH=$(npm root -g)/@anthropic-ai/claude-code

  if [ ! -d "$CLAUDE_PATH" ]; then
    echo "ERROR: Claude Code not found at $CLAUDE_PATH"
    exit 1
  fi

  echo "==> Rebuilding native modules for RHEL 8..."
  cd "$CLAUDE_PATH"

  # Rebuild all native modules to ensure compatibility with glibc 2.28
  if [ -f package.json ]; then
    npm rebuild
  fi

  echo "==> Copying Claude Code to output directory..."
  echo "    Original size: $(du -sh "$CLAUDE_PATH" | cut -f1)"
  cp -r "$CLAUDE_PATH" /out/claude-code

  # Copy the global bin if it exists (Linux only, exclude Windows files)
  if [ -d "$(npm root -g)/../bin" ]; then
    mkdir -p /out/bin
    cp -r $(npm root -g)/../bin/claude* /out/bin/ 2>/dev/null || true
    # Remove Windows executables
    find /out/bin -type f \( -name "*.exe" -o -name "*.cmd" -o -name "*.bat" -o -name "*.ps1" \) -delete 2>/dev/null || true
  fi

  echo "==> Optimizing build size..."
  cd /out/claude-code

  # Remove development dependencies
  npm prune --production 2>/dev/null || true

  # Remove common unnecessary files
  find . -type f -name "*.md" ! -name "package.json" -delete 2>/dev/null || true
  find . -type f -name "*.ts" ! -name "*.d.ts" -delete 2>/dev/null || true
  find . -type f -name "*.map" -delete 2>/dev/null || true
  find . -type d -name "test" -exec rm -rf {} + 2>/dev/null || true
  find . -type d -name "tests" -exec rm -rf {} + 2>/dev/null || true
  find . -type d -name "__tests__" -exec rm -rf {} + 2>/dev/null || true
  find . -type d -name "docs" -exec rm -rf {} + 2>/dev/null || true
  find . -type d -name "examples" -exec rm -rf {} + 2>/dev/null || true
  find . -type d -name ".github" -exec rm -rf {} + 2>/dev/null || true
  find . -type f -name "*.spec.js" -delete 2>/dev/null || true
  find . -type f -name "*.test.js" -delete 2>/dev/null || true
  find . -type f -name ".npmignore" -delete 2>/dev/null || true
  find . -type f -name ".gitignore" -delete 2>/dev/null || true
  find . -type f -name "tsconfig.json" -delete 2>/dev/null || true
  find . -type f -name ".eslintrc*" -delete 2>/dev/null || true
  find . -type f -name ".prettierrc*" -delete 2>/dev/null || true

  # Remove Windows-specific files
  find . -type f \( -name "*.exe" -o -name "*.dll" -o -name "*.cmd" -o -name "*.bat" -o -name "*.ps1" \) -delete 2>/dev/null || true
  find . -type d -name "win32" -exec rm -rf {} + 2>/dev/null || true

  # Remove license files (optional - comment out if you need them)
  # find . -type f -name "LICENSE*" -delete 2>/dev/null || true

  # Remove build artifacts and caches
  find . -type d -name ".cache" -exec rm -rf {} + 2>/dev/null || true
  find . -type d -name "*.tsbuildinfo" -exec rm -rf {} + 2>/dev/null || true
  find . -name "node_modules" -type d -prune -exec sh -c '\''
    cd "{}" && find . \( -name "*.node" -o -name "*.so" \) | \
    while read f; do
      # Keep only the Linux binaries, remove build artifacts
      dir=$(dirname "$f")
      [ -d "$dir/build" ] && rm -rf "$dir/build" 2>/dev/null || true
      [ -d "$dir/src" ] && [ -f "$f" ] && rm -rf "$dir/src" 2>/dev/null || true
    done
  '\'' \; 2>/dev/null || true

  FINAL_SIZE=$(du -sh /out/claude-code | cut -f1)
  echo "==> Build size after optimization: $FINAL_SIZE"

  echo "==> Build information:"
  echo "    Node.js: $(node --version)"
  echo "    npm: $(npm --version)"
  echo "    Architecture: $(uname -m)"
  echo "    glibc: $(ldd --version 2>&1 | head -1 | grep -oP "[\d.]+$")"
  echo "    Claude Code path: $CLAUDE_PATH"
'

echo ""
echo "==> Creating deployment package..."

# Create launcher script
cat > "$OUTPUT_DIR/claude" << 'EOF'
#!/bin/bash
# Claude Code launcher for CloudLinux/RHEL 8

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Run Claude Code
exec node "$SCRIPT_DIR/claude-code/cli.js" "$@"
EOF
chmod +x "$OUTPUT_DIR/claude"

cat > "$OUTPUT_DIR/README.md" << 'EOF'
# Claude Code for RHEL 8

This package contains Claude Code compiled for RHEL 8 (glibc 2.28).

## Quick Start

```bash
./claude --version
```

## Installation

1. **Copy this directory to your RHEL 8/CloudLinux system**

2. **Install Node.js 18+** (if not already installed):
   ```bash
   curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
   yum install -y nodejs
   ```

3. **Choose installation method**:

   **Option A: Add to PATH** (recommended for shared hosting)
   ```bash
   echo 'export PATH="'$(pwd)':$PATH"' >> ~/.bashrc
   source ~/.bashrc
   ```

   **Option B: System-wide** (requires root)
   ```bash
   sudo cp claude /usr/local/bin/
   sudo cp -r claude-code /usr/local/lib/
   ```

   **Option C: Symlink**
   ```bash
   mkdir -p ~/.local/bin
   ln -s $(pwd)/claude ~/.local/bin/claude
   export PATH="$HOME/.local/bin:$PATH"
   ```

## Requirements

- RHEL 8 / CloudLinux / Rocky Linux 8 / AlmaLinux 8
- Node.js 18+
- glibc 2.28+ (included in RHEL 8)

## Verification

```bash
claude --version
claude --help
```

## Files

- `claude` - Launcher script
- `claude-code/` - Full installation with native modules
EOF

echo "==> ✅ Build complete!"
echo ""
echo "Output: $OUTPUT_DIR"
echo ""
echo "To deploy to RHEL 8:"
echo "  1. Copy $OUTPUT_DIR to your RHEL 8 system"
echo "  2. Ensure Node.js 18+ is installed"
echo "  3. Add to PATH or create symlink (see $OUTPUT_DIR/README.md)"
echo ""

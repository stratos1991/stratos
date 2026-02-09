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

## CloudLinux Users

See `CLOUDLINUX.md` for specific instructions including:
- CageFS compatibility
- Shared hosting setup
- LVE resource limits

## Files

- `claude` - Launcher script
- `claude-code/` - Full installation with native modules

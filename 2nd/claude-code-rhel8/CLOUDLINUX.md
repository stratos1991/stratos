# Running Claude Code on CloudLinux

CloudLinux is binary-compatible with RHEL, so this RHEL 8 build works perfectly.

## Prerequisites

1. **Install Node.js 18+** (if not already installed):
   ```bash
   curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
   yum install -y nodejs
   ```

2. **Verify Node.js installation**:
   ```bash
   node --version  # Should show v22.x or v18+
   npm --version
   ```

## Quick Start

The package includes a `claude` launcher script. Just run:

```bash
cd /path/to/claude-code-rhel8
./claude --version
```

## Installation Options

### Option 1: System-wide installation (requires root)

```bash
# Copy launcher to system bin
sudo cp claude /usr/local/bin/claude
sudo cp -r claude-code /usr/local/lib/claude-code

# Update the launcher to point to the new location
sudo sed -i 's|SCRIPT_DIR=".*"|SCRIPT_DIR="/usr/local/lib"|' /usr/local/bin/claude

# Test it
claude --version
```

### Option 2: User-level installation (no root required) - RECOMMENDED

```bash
# Copy to your home directory
cp -r claude-code-rhel8 ~/

# Add to PATH in ~/.bashrc
echo 'export PATH="$HOME/claude-code-rhel8:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Test it
claude --version
```

### Option 3: Direct symlink

```bash
# Create local bin directory if it doesn't exist
mkdir -p ~/.local/bin

# Create symlink to the launcher
ln -s ~/claude-code-rhel8/claude ~/.local/bin/claude

# Add to PATH if not already there
if ! grep -q '.local/bin' ~/.bashrc; then
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
  source ~/.bashrc
fi

# Test it
claude --version
```

## CloudLinux-Specific Considerations

### CageFS Users

If you're in a CageFS environment:

```bash
# Install in your home directory (Option 2 or 3 above)
# Make sure Node.js is available in your cage

# Check if Node.js is accessible
which node
node --version
```

### LVE (Lightweight Virtual Environment) Limits

Claude Code may need adequate resources:
- **Memory**: At least 512MB (1GB+ recommended)
- **CPU**: No specific limit, but AI operations may be resource-intensive
- Check your LVE limits: `cloudlinux-limits`

### Shared Hosting Environment

If on shared hosting with CloudLinux:

1. Install in your home directory (no sudo access)
2. Use Option 2 or 3 above
3. Set up API key in `~/.claude/config.json`:
   ```bash
   mkdir -p ~/.claude
   cat > ~/.claude/config.json << 'EOF'
   {
     "anthropicApiKey": "your-api-key-here"
   }
   EOF
   chmod 600 ~/.claude/config.json
   ```

## Verification

```bash
# Test the installation
claude --version

# Test API connectivity
claude --help

# Run in a project directory
cd ~/your-project
claude
```

## Troubleshooting

### "Cannot find module" errors

```bash
# Set NODE_PATH explicitly
export NODE_PATH="/full/path/to/claude-code-rhel8/claude-code/node_modules"
```

### Permission issues in shared hosting

```bash
# Ensure all files are executable
chmod -R u+rx ~/claude-code-rhel8/
chmod +x ~/claude-code-rhel8/bin/claude
```

### CageFS missing dependencies

Contact your hosting provider to ensure these are available in CageFS:
- Node.js 18+
- Required system libraries (libstdc++, glibc 2.28+)

## Performance Tips

1. **Reduce memory usage**: Use smaller AI models if API supports it
2. **Disk I/O limits**: Be aware of I/O limits in shared hosting
3. **Network limits**: Some CloudLinux hosts limit outbound connections

## Support

- Claude Code issues: [GitHub Issues](https://github.com/anthropics/claude-code/issues)
- CloudLinux-specific hosting issues: Contact your hosting provider

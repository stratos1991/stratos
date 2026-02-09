#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "==> Building app..."
npm run build

echo "==> Cross-compiling node-pty for RHEL 8 (glibc 2.28)..."
docker run --rm -v "$PWD/dist:/out" rockylinux:8 bash -c '
  set -e
  curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
  dnf install -y nodejs gcc-c++ make python39
  alternatives --set python3 /usr/bin/python3.9
  mkdir -p /build && cd /build
  npm init -y
  npm install node-pty --production

  # Clean up node_modules - keep only runtime essentials
  rm -rf /out/node_modules
  mkdir -p /out/node_modules/node-pty

  # Copy only necessary node-pty files
  cp -r /build/node_modules/node-pty/{lib,build} /out/node_modules/node-pty/ 2>/dev/null || true
  cp /build/node_modules/node-pty/package.json /out/node_modules/node-pty/

  # Remove build artifacts, keep only .node binaries
  find /out/node_modules/node-pty/build -type f ! -name "*.node" -delete 2>/dev/null || true

  echo "node-pty built successfully for $(uname -m) glibc $(ldd --version 2>&1 | head -1 | grep -oP "[\d.]+$")"
'

echo "==> dist/ is ready for deployment"

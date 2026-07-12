# Headless acceptance-test runner (see acceptance/README.md).
#
# Runs the Gherkin + VS Code acceptance suite inside a Linux container under Xvfb
# (a virtual framebuffer), so the real VS Code window renders to an off-machine
# display and never appears on the developer's desktop. This is how the suite
# runs without flashing a window on macOS — where VS Code cannot truly headless —
# and how it runs in CI.
#
# NOTE: Docker is used here only to RUN the GUI tests headlessly. The manual
# generator (Astro + Playwright PDF) stays native TypeScript and runs on the host.
#
# The base image ships Node, the Playwright browsers, their shared libraries, and
# Xvfb. We add the extra libraries VS Code's Electron needs beyond Chromium, plus
# the toolchain to build this repo's native node modules (koffi, keytar).
FROM mcr.microsoft.com/playwright:v1.61.1-noble

RUN apt-get update && apt-get install -y --no-install-recommends \
      libsecret-1-0 \
      libsecret-1-dev \
      libgbm1 \
      libgtk-3-0 \
      libnss3 \
      libasound2t64 \
      build-essential \
      python3 \
      unzip \
      curl \
      git \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Extension dependencies first, keyed only on the manifests so source edits don't
# bust the (slow) npm ci layer. All workspace manifests are needed for the
# workspace-aware install (which also builds the Linux native modules).
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
COPY mcp-server/package.json ./mcp-server/
RUN npm ci

# The acceptance harness is a standalone package with its own lockfile.
COPY acceptance/package.json acceptance/package-lock.json ./acceptance/
RUN cd acceptance && npm ci

# Install GemStone (arm64 Linux, ~450 MB) into the acceptance stone-cache at the
# path provision-stone.sh expects, so the @stone chapters can provision a stone
# without downloading at run time. Keyed on client/bin so source edits don't
# bust this (slow) layer.
COPY client/bin ./client/bin
RUN mkdir -p /app/acceptance/.stone-cache \
 && cd /app/acceptance/.stone-cache \
 && bash /app/client/bin/gs-install.sh 3.7.5

COPY . .

# VS Code loads Jasper from source, so the extension must be built — both the
# client (the extension) AND the server (the LSP the extension forks). Building
# only the client left server/out/server.js absent, so the language server
# crash-looped ("crashed 5 times… will not be restarted") on every launch. Build
# from source here rather than relying on a copied host build (server/out is
# gitignored and platform-specific).
RUN npm run compile:client && npm run compile:server

# Pre-create the mount points so their bind mounts inherit pwuser ownership, then
# run as the non-root pwuser the base image provides.
RUN mkdir -p /app/.vscode-test /app/acceptance/cucumber-report /app/acceptance/test-results \
 && chown -R pwuser:pwuser /app
USER pwuser

# `xvfb-run` gives every run a virtual X display; VS Code renders there. As the
# entrypoint it wraps whatever command is given, so overriding CMD (e.g. to run
# `npm run test:download`) still gets a display.
ENTRYPOINT ["xvfb-run", "-a", "--server-args=-screen 0 1920x1080x24"]
CMD ["bash", "-lc", "cd acceptance && npm test"]

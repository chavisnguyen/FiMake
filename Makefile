# Unified entrypoint for the mcp server and the Figma plugin.
# Usage: `make <target>` — every target runs in both packages.
.PHONY: help install test typecheck lint build check dev-mcp dev-plugin package-plugin release clean

help:
	@echo "install    Install dependencies (mcp + plugin)"
	@echo "test       Run vitest suites (mcp + plugin)"
	@echo "typecheck  Typecheck sources and tests (mcp + plugin)"
	@echo "lint       Forbid explicit any and friends (mcp + plugin)"
	@echo "build      Production builds (mcp + plugin)"
	@echo "check      typecheck + lint + test + build (pre-push gate)"
	@echo "release    Verify versions, run check, push + create GitHub Release (usage: make release V=1.0.33)"
	@echo "dev-mcp    Watch + restart the MCP server"
	@echo "dev-plugin Watch + rebuild the plugin (re-run it in Figma to reload)"
	@echo "package-plugin Zip the sideload plugin (manifest.json + dist/) for GitHub Releases"
	@echo "clean      Remove build outputs and coverage"

install:
	pnpm install

test:
	cd mcp && pnpm test
	cd plugin && pnpm test

typecheck:
	cd mcp && pnpm test:typecheck
	cd plugin && pnpm tsc

lint:
	cd mcp && pnpm lint
	cd plugin && pnpm lint

build:
	cd mcp && pnpm build
	cd plugin && pnpm build

check: typecheck lint test build

dev-mcp:
	cd mcp && pnpm dev

dev-plugin:
	cd plugin && pnpm dev

# Sideload bundle for GitHub Releases: import the zip's manifest.json in Figma.
package-plugin: build
	rm -f fimake-plugin.zip
	cd plugin && zip -r ../fimake-plugin.zip manifest.json dist -x 'dist/*.map'

# Publish a release: `make release V=1.0.33`
# Version bumps are manual (mcp/package.json, plugin/package.json,
# mcp/server.json must all equal V — the release.yml gate asserts the same).
# This target re-verifies that invariant, runs the full gate, pushes,
# then creates the GitHub Release (which triggers binary builds + tap bump).
# Never delete/recreate a published release: the Homebrew tap points at it.
release:
	@test -n "$(V)" || (echo "usage: make release V=1.0.33" && exit 1)
	@git diff --quiet || (echo "error: working tree dirty" && exit 1)
	@git diff --cached --quiet || (echo "error: staged changes present" && exit 1)
	@test "$$(python3 -c "import json; print(json.load(open('mcp/package.json'))['version'])")" = "$(V)" || (echo "error: mcp/package.json version != $(V)" && exit 1)
	@test "$$(python3 -c "import json; print(json.load(open('plugin/package.json'))['version'])")" = "$(V)" || (echo "error: plugin/package.json version != $(V)" && exit 1)
	@test "$$(grep -o '"version": "[^"]*"' mcp/server.json | sort -u)" = '"version": "$(V)"' || (echo "error: mcp/server.json versions != $(V)" && exit 1)
	@if git rev-parse "v$(V)" >/dev/null 2>&1; then echo "error: tag v$(V) already exists"; exit 1; fi
	@$(MAKE) check
	@git fetch --tags --quiet origin
	@git push origin master
	@PREV_TAG=$$(git describe --tags --abbrev=0 2>/dev/null || echo ""); \
	if [ -n "$$PREV_TAG" ]; then NOTES=$$(git log "$$PREV_TAG..HEAD" --pretty=format:'- %s'); else NOTES="Release v$(V)."; fi; \
	gh release create "v$(V)" --target master --title "v$(V)" --notes "$$NOTES"

clean:
	rm -rf mcp/dist mcp/coverage plugin/dist plugin/coverage

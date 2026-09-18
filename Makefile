# Unified entrypoint for the mcp server and the Figma plugin.
# Usage: `make <target>` — every target runs in both packages.
.PHONY: help install test typecheck lint build check dev-mcp dev-plugin clean

help:
	@echo "install    Install dependencies (mcp + plugin)"
	@echo "test       Run vitest suites (mcp + plugin)"
	@echo "typecheck  Typecheck sources and tests (mcp + plugin)"
	@echo "lint       Forbid explicit any and friends (mcp + plugin)"
	@echo "build      Production builds (mcp + plugin)"
	@echo "check      typecheck + lint + test (pre-push gate)"
	@echo "dev-mcp    Watch + restart the MCP server"
	@echo "dev-plugin Watch + rebuild the plugin (re-run it in Figma to reload)"
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

clean:
	rm -rf mcp/dist mcp/coverage plugin/dist plugin/coverage

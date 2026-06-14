# Contributing to Naden

Thanks for your interest in contributing! This guide covers how to get set up and what we expect from pull requests.

## Getting Started

1. Install prerequisites: [Rust toolchain](https://rustup.rs/) (see `rust-version` in `src-tauri/Cargo.toml`) and Node.js ≥ 20
2. Install dependencies: `npm install`
3. Run the app in dev mode: `npm run tauri dev`

## Development Commands

| Task | Command |
|---|---|
| Dev (full app) | `npm run tauri dev` |
| Frontend only | `npm run dev` |
| Build | `npm run tauri build` |
| Type-check | `npm run typecheck` |
| Test (frontend) | `npx vitest run` (single file: `npx vitest run src/tests/foo.test.ts`) |
| Test (Rust) | `cargo test` (filter: `cargo test vault`) |
| Lint (Rust) | `cargo clippy -- -D warnings` |
| Format check | `cargo fmt --check` |

## Before Opening a PR

- Run the relevant test suite and `npm run typecheck` for any frontend changes
- Run `cargo clippy -- -D warnings` and `cargo fmt --check` for any Rust changes
- Keep PRs focused — one fix or feature per PR

## Project Conventions

- All Tauri IPC calls go through `src/lib/tauriCommands.ts` — that's the single frontend–backend boundary
- Never edit existing `.sql` files in `src-tauri/src/db/migrations/` — always add a new migration
- Credentials are stored in the OS keychain, never in SQLite or plaintext — don't introduce new credential storage paths

## Reporting Bugs / Requesting Features

Open a [GitHub issue](https://github.com/adenijiayocharles/naden/issues) with:
- For bugs: steps to reproduce, expected vs. actual behavior, OS version
- For features: the problem you're trying to solve, not just the desired solution

## Security Issues

Please do **not** open a public issue for security vulnerabilities. Email adenijiayocharles@gmail.com with details and we'll respond as soon as possible.

## Code of Conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). Please be respectful and constructive in all interactions.

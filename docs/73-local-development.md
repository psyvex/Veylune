# Local development

## Required runtime

Veylune targets Node.js 24.21.0 or newer and pnpm 10.17.1 or newer. The repository declares the package manager in `package.json` and the workspace layout in `pnpm-workspace.yaml`.

## Clean install

After changing Node versions, remove the existing `node_modules` trees and reinstall from the repository root. Do not reuse a dependency tree created under an older Node runtime or a different package manager.

For pnpm development, install from the repository root so workspace packages share one consistent dependency graph.

## Native bundler dependencies

Vite uses native Rolldown bindings. A missing platform binding usually indicates a partial or incompatible dependency installation rather than an application error. Reinstalling dependencies with the supported Node and pnpm versions restores the platform-specific optional dependency set.

## Browser development

Run the web development script from the repository root after the clean install. Camera features require a secure browser context and explicit user permission.

# Dependencies Guide

The authoritative source of installed package versions is `Packages/manifest.json`. This document lists what the project actually depends on and why - so nobody has to guess whether a package is load-bearing.

Maintenance rules:

- When a package is added, removed, or changes purpose: update `Packages/manifest.json`, let `Packages/packages-lock.json` regenerate, and update this file in the same change.
- Before removing a package, search the project for real references.
- Do not add production dependencies without explicit approval.

## Format

One entry per dependency, grouped by area. Replace the example:

```markdown
## Core
- **<Package display name>**: <one line: what it does for this project and which module uses it>.
  - `<package.id>` - <version>
```

## Core

- (fill in from Packages/manifest.json)

## Editor / Tooling

- (fill in; include dev-only tools such as MCP bridges and test frameworks)

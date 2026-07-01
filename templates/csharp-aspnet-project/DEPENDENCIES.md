# Dependencies Guide

The authoritative sources of package versions are the `.csproj` files and `Directory.Packages.props` (when central package management is used). This document lists what the project actually depends on and why - so nobody has to guess whether a package is load-bearing.

Maintenance rules:

- When a package is added, removed, or changes purpose: update the project files and this document in the same change.
- Before removing a package, search the solution for real references.
- Do not add production dependencies without explicit approval.
- Run `dotnet list package --vulnerable` when touching dependency versions.

## Format

One entry per dependency, grouped by area. Replace the example:

```markdown
## Core
- **<Package name>**: <one line: what it does for this project and which layer uses it>.
  - `<Package.Id>` - <version>
```

## Core

- (fill in from csproj / Directory.Packages.props)

## Tooling / Tests

- (fill in; include analyzers, test frameworks, containers)

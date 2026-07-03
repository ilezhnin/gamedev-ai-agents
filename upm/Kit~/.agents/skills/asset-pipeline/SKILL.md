---
name: asset-pipeline
description: Source, generate, and integrate Unity game assets with provenance and validation. Use when a task needs placeholder art, concept art, sprites, textures, icons, UI images, material references, graybox level support, local asset discovery, public/CC0 asset sourcing, generated images, or Unity import/setup of approved assets.
---

# Asset Pipeline

## Goal

Move an asset need from intent to usable Unity content without blocking implementation on missing art, unknown licenses, broken imports, or hidden provenance gaps.

Use this skill for asset work only. Code behavior still routes through `$unity-implement`; editor automation still routes through `$unity-mcp`; game scope and milestone acceptance still route through `$gdd`, `$planning`, and `$game-pipeline`.

## Workflow

1. Read the user request, `AGENTS.md`, the GDD or plan when present, project art/content roots, and nearby `docs/authoring/` guidance.
2. Choose the smallest useful path:
   - **Reuse**: existing project asset, package sample, primitive, ProBuilder shape, material, prefab, or graybox kit.
   - **Source**: public asset with clear license/provenance and acceptable import cost.
   - **Generate**: placeholder or concept asset using the available image-generation capability.
   - **Integrate**: import, configure, wire, and validate an already approved asset.
3. For delegated work, assign the matching role:
   - `asset-scout` for local/public search, license checks, and candidate comparison.
   - `asset-creator` for generation prompts and generated raster/source outputs.
   - `unity-asset-integrator` for Unity import settings, materials, prefabs, scene wiring, Addressables labels, and validation.
   - `researcher` only when asset sourcing depends on current external source behavior, marketplace terms, or documentation.
4. Write or update the asset brief in `.agents/plans/asset-brief.md` when the work is non-trivial, delegated, or affects a milestone.
5. Import only approved assets into project-owned roots. Keep placeholder/prototype assets separated from final art when the project layout supports it.
6. Validate import and usage: preserve `.meta`, refresh the AssetDatabase when needed, check console/import errors, inspect scenes or prefabs, and capture PlayMode evidence for milestone-visible assets.

Read `references/asset-workflow.md` for the asset brief format, license/provenance requirements, generation handoff, import checklist, and stop conditions.

## Rules

- Search local project assets before sourcing or generating new ones.
- Never import an asset with unclear license, missing provenance, or terms incompatible with the project.
- Do not overwrite, delete, move, or rename existing art or `.meta` files without explicit approval.
- Record generation prompts and source URLs even for throwaway placeholders.
- Keep asset polish proportional to the milestone; graybox and placeholder tasks should not become final-art production.
- If no image-generation or web-search capability is available, produce the exact blocked handoff rather than pretending the asset was created or sourced.

## Exit Criteria

Report: selected path, created/sourced/imported assets, provenance and license status, changed Unity files, validation evidence, and remaining replacement or approval risks.

# Asset Workflow Reference

## Asset Brief

Write `.agents/plans/asset-brief.md` for delegated or milestone asset work:

```markdown
# Asset Brief - <Task or Milestone>

## Need
- Asset:
- Purpose: placeholder | concept | graybox | prototype | production candidate
- Game context:
- Target platform and budget:
- Destination root:

## Candidates
| Status | Asset | Source | License | Fit | Risk |
| --- | --- | --- | --- | --- | --- |
| keep/drop | name | local path or URL | license/terms | why it fits | risk |

## Generation
- Prompt:
- Negative prompt:
- Dimensions:
- Style references:
- Tool/model/settings:
- Date:
- Intended use:

## Integration
- Unity destination:
- Import settings:
- Materials/prefabs/scenes:
- Addressables labels or catalogs:
- Validation:

## Open Risks
- License/provenance:
- Replacement path:
- Approval needed:
```

## Source Ladder

1. Reuse project-owned assets already in the repository.
2. Use primitives, ProBuilder, simple materials, or existing graybox kits for gameplay validation.
3. Use public assets only when the license is explicit and compatible with the project.
4. Generate concepts or placeholders when sourcing would take longer than the milestone allows.
5. Stop for approval before importing paid assets, restricted-license assets, trademarked content, or anything with unclear rights.

## Provenance

For every sourced or generated asset, record:

- Local path or URL.
- Source name and author when known.
- License or terms, including attribution requirements.
- Access date or generation date.
- Intended use in the project.
- Any transformation performed before import.

Unknown license means blocked, not "best effort".

## Generation Handoff

When using image generation, prefer specific, reusable prompts:

- Subject, camera/view, silhouette, material, color constraints, mood, and game genre.
- Exact dimensions, transparency need, tileability, sprite-sheet or single-image shape.
- Negative constraints for text, logos, extra limbs, noise, UI artifacts, or photorealism when inappropriate.
- Style references from project-owned art when available.

If no image tool is available, write the prompt and required output spec into the asset brief and mark generation blocked.

## Unity Import Checklist

- Place files under project-owned art/prototype roots, not vendor or generated package roots.
- Keep `.meta` files paired with assets and preserve existing GUIDs.
- Set texture type, sprite mode, pixels per unit, compression, max size, alpha, normal map, sRGB, model scale, rig, and material settings intentionally.
- Keep placeholders clearly named and easy to replace.
- Refresh the AssetDatabase when the editor is open but unfocused.
- Inspect Unity Console import errors before claiming success.
- For visible milestone assets, enter PlayMode or capture a scene screenshot when Unity MCP is available.

## Stop Conditions

Stop and ask when:

- The asset license, attribution, or ownership is unclear.
- The requested asset implies new paid packages, marketplace downloads, or credentials.
- Import requires ProjectSettings, render pipeline, shader, Addressables, or package changes not approved in the plan.
- The task would overwrite or replace existing production art.
- The asset decision changes game scope, art direction, platform budget, or milestone acceptance criteria.

# Rendering Failure Triage

## Pink / Magenta Materials

Magenta means the shader failed to load or compile. Check in order:

1. Wrong pipeline: Built-in shader on URP/HDRP project (or vice versa). Check the active Render Pipeline Asset in `ProjectSettings/GraphicsSettings.asset` and the material's shader.
2. Shader compile error: open the shader in the inspector and read the error; check the Console after reimport.
3. Missing shader reference: material's shader GUID no longer resolves (deleted package, broken .meta).
4. Build-only magenta: the shader variant was stripped - see Variant Stripping below.

Fixes for pipeline mismatch: use the pipeline's upgrade menu (Edit > Rendering > Materials) rather than editing materials one by one, and review the churn before committing.

## Shader Compile Errors

- Read the first error line, not the cascade; fix include paths and pragma targets before logic.
- Platform-specific failures: check `#pragma target`, missing platform keywords, and API-specific intrinsics.
- After editing includes, force a reimport of dependent shaders (right-click > Reimport).

## SRP Batcher Breaks

- A material/shader is SRP Batcher incompatible when its per-material data is not in a `UnityPerMaterial` CBUFFER; check the shader inspector's compatibility line.
- Symptoms: draw call spikes after a shader edit, inconsistent batching in Frame Debugger.
- MaterialPropertyBlock breaks SRP Batcher batching on URP - prefer per-material properties or instancing where measured.

## Variant Stripping (Build-Only Failures)

- Works in editor, magenta or wrong rendering in build: the variant was stripped.
- Check Graphics settings' shader stripping options, `ShaderVariantCollection` coverage, and always-included shaders.
- Keywords enabled only at runtime (never in any scene/material at build time) get stripped; add the variant to a collection or an always-included list deliberately.

## Render Pipeline Asset Misconfiguration

- Feature missing at runtime (shadows, SSAO, decals): confirm the feature is enabled on the active pipeline asset and quality level, not only in the scene.
- Multiple quality levels can point at different pipeline assets - check the asset per quality level actually used on the target platform.

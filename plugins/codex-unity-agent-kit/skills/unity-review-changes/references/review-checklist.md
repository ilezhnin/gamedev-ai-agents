# Unity Review Checklist

## Correctness

- Does changed code run in the correct Unity lifecycle method?
- Are object references valid across scene load, disable, destroy, and domain reload?
- Does the change work in both editor and player builds?
- Are platform defines and asmdef include/exclude platforms correct?
- Does the implementation match the stated task or plan without adding unrelated behavior?
- Are edge cases, invalid states, and error paths handled rather than only the happy path?

## Serialization and Assets

- Were serialized fields renamed without migration?
- Did prefab, scene, ScriptableObject, or asset YAML change unexpectedly?
- Were `.meta` files preserved for moved or created assets?
- Are GUID references stable?

## Gameplay and UI

- Are physics changes applied in `FixedUpdate` or through the correct API?
- Does input code match the active input system?
- Are UI updates throttled or event-driven when needed?
- Are save, economy, inventory, or progression data migrations handled?

## Performance

- Any new allocations in hot paths?
- Any repeated `Find`, `GetComponent`, resource loads, addressable loads, or LINQ in frequent loops?
- Any new logging in hot paths?

## Tests

- Is there an EditMode test for pure logic?
- Is there a PlayMode test for scene/lifecycle behavior?
- Did asmdef or package changes get compile coverage?
- If no tests exist, is the manual validation path clear?

## Review Hygiene

- Is the diff one coherent change rather than mixed feature/refactor/format churn?
- Are new dependencies or package changes justified and approved?
- Is there newly dead code or obsolete tests left behind?
- Are findings classified by severity and backed by file/line evidence?
- Are validation claims supported by actual commands, Unity console checks, or explicit blockers?

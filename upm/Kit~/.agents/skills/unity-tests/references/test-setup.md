# Unity Test Setup

`MyGame.Runtime` below stands for the asmdef under test. Match the project's existing naming if any tests already exist.

## Folder Layout

```
Assets/
  Scripts/
    MyGame.Runtime.asmdef          (runtime code under test)
  Tests/
    EditMode/
      MyGame.Tests.EditMode.asmdef
      HealthModelTests.cs
    PlayMode/
      MyGame.Tests.PlayMode.asmdef
      ProjectileLifetimeTests.cs
```

## EditMode Test Asmdef

`Assets/Tests/EditMode/MyGame.Tests.EditMode.asmdef`:

```json
{
    "name": "MyGame.Tests.EditMode",
    "rootNamespace": "",
    "references": [
        "MyGame.Runtime",
        "UnityEngine.TestRunner",
        "UnityEditor.TestRunner"
    ],
    "includePlatforms": [
        "Editor"
    ],
    "excludePlatforms": [],
    "allowUnsafeCode": false,
    "overrideReferences": true,
    "precompiledReferences": [
        "nunit.framework.dll"
    ],
    "autoReferenced": false,
    "defineConstraints": [
        "UNITY_INCLUDE_TESTS"
    ],
    "versionDefines": [],
    "noEngineReferences": false
}
```

## PlayMode Test Asmdef

`Assets/Tests/PlayMode/MyGame.Tests.PlayMode.asmdef` is identical except `name` and an empty `includePlatforms` (the assembly must be loadable outside the Editor to run in play mode):

```json
{
    "name": "MyGame.Tests.PlayMode",
    "references": [
        "MyGame.Runtime",
        "UnityEngine.TestRunner",
        "UnityEditor.TestRunner"
    ],
    "includePlatforms": [],
    "overrideReferences": true,
    "precompiledReferences": [
        "nunit.framework.dll"
    ],
    "autoReferenced": false,
    "defineConstraints": [
        "UNITY_INCLUDE_TESTS"
    ]
}
```

Non-obvious rules:

- `overrideReferences: true` plus precompiled `nunit.framework.dll` is required; without it NUnit types do not resolve.
- `defineConstraints: ["UNITY_INCLUDE_TESTS"]` strips test assemblies from player builds. Do not omit it, especially on the PlayMode asmdef, which targets all platforms.
- Test asmdefs can only reference code that lives in an asmdef assembly. Code in predefined Assembly-CSharp is unreachable from tests; moving it into a new asmdef changes assembly layout and needs approval.
- `autoReferenced: false` on the runtime asmdef does not block the explicit reference above; asmdef-to-asmdef references ignore that flag.

## Manifest and Testables

- `com.unity.test-framework` must be listed in `Packages/manifest.json` `dependencies`. Modern templates include it by default. If it is missing, adding it is a package change: surface it explicitly and get approval first. Use the version the project's Unity editor resolves, not an arbitrary pin.
- The `testables` array is only needed to show tests that live inside local or embedded packages in the Test Runner:

```json
{
    "dependencies": {
        "com.unity.test-framework": "1.4.5"
    },
    "testables": [
        "com.mycompany.mypackage"
    ]
}
```

## Minimal EditMode Test

```csharp
using NUnit.Framework;

public class HealthModelTests
{
    [Test]
    public void ApplyDamage_ClampsAtZero()
    {
        var model = new HealthModel(max: 50f);

        model.ApplyDamage(80f);

        Assert.AreEqual(0f, model.Current);
        Assert.IsTrue(model.IsDead);
    }
}
```

## Minimal PlayMode Test

```csharp
using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

public class ProjectileLifetimeTests
{
    [UnityTest]
    public IEnumerator Projectile_DestroysItself_AfterLifetime()
    {
        var go = new GameObject("projectile");
        var projectile = go.AddComponent<Projectile>();
        projectile.Lifetime = 0.1f;

        yield return new WaitForSeconds(0.2f);

        // Destroyed objects compare equal to null only via Unity's overloaded ==.
        // Assert.IsNull uses reference equality and fails on Unity fake-null.
        Assert.IsTrue(go == null);
    }
}
```

PlayMode tests share editor state across the run: destroy every object a test creates (teardown or in-test) so leftovers do not leak into the next test.

## Humble Object: Before and After

Before: logic locked inside a MonoBehaviour, only reachable via PlayMode with scene wiring.

```csharp
public class HealthBar : MonoBehaviour
{
    [SerializeField] private Image fill;
    [SerializeField] private float maxHealth = 100f;

    private float current;

    private void Awake() => current = maxHealth;

    public void ApplyDamage(float amount)
    {
        current = Mathf.Max(0f, current - amount);
        fill.fillAmount = current / maxHealth;
        if (current <= 0f)
            Destroy(gameObject);
    }
}
```

After: pure logic in a plain C# class (EditMode-testable, no UnityEngine dependency); the MonoBehaviour is a thin adapter.

```csharp
public class HealthModel
{
    public float Max { get; }
    public float Current { get; private set; }
    public bool IsDead => Current <= 0f;

    public HealthModel(float max)
    {
        Max = max;
        Current = max;
    }

    public void ApplyDamage(float amount) =>
        Current = System.Math.Max(0f, Current - amount);
}

public class HealthBar : MonoBehaviour
{
    [SerializeField] private Image fill;             // name and type unchanged
    [SerializeField] private float maxHealth = 100f; // name and type unchanged

    private HealthModel model;

    private void Awake() => model = new HealthModel(maxHealth);

    public void ApplyDamage(float amount)
    {
        model.ApplyDamage(amount);
        fill.fillAmount = model.Current / model.Max;
        if (model.IsDead)
            Destroy(gameObject);
    }
}
```

Extraction rules:

- Serialized fields keep their exact names and types so existing scenes, prefabs, and assets deserialize unchanged. If the extraction would force a serialized shape change, stop and ask.
- The extracted class takes plain data, not UnityEngine components. If it needs a Unity value (position, deltaTime), pass it in as an argument.
- After extraction the MonoBehaviour holds no branching logic worth testing; it only forwards. Do not write tests for the forwarding.

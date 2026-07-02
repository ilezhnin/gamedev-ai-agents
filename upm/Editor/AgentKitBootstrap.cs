using System;
using UnityEditor;
using UnityEngine;

namespace GamedevAgentKit.Editor
{
    /// <summary>
    /// Opens the setup window once per editor session when the kit is not
    /// installed in the project yet or is older than the package payload.
    /// </summary>
    [InitializeOnLoad]
    internal static class AgentKitBootstrap
    {
        private const string SessionKey = "GamedevAgentKit.SetupPromptShown";

        static AgentKitBootstrap()
        {
            EditorApplication.delayCall += PromptIfNeeded;
        }

        private static void PromptIfNeeded()
        {
            if (Application.isBatchMode || SessionState.GetBool(SessionKey, false))
            {
                return;
            }

            if (AgentKitPaths.PayloadRoot == null)
            {
                return;
            }

            var manifest = KitManifest.Load(AgentKitPaths.ManifestPath);
            if (manifest != null && !IsOlder(manifest.KitVersion, AgentKitPaths.PackageVersion))
            {
                return;
            }

            SessionState.SetBool(SessionKey, true);
            AgentKitWindow.Open();
        }

        private static bool IsOlder(string installed, string packaged)
        {
            if (!Version.TryParse(installed, out var installedVersion) || !Version.TryParse(packaged, out var packagedVersion))
            {
                return false;
            }

            return installedVersion < packagedVersion;
        }
    }
}

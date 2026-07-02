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

        // Per-project, persisted across editor restarts: a user who deliberately
        // declined the kit must not be prompted again every session.
        internal static string DontAutoOpenKey => "GamedevAgentKit.DontAutoOpen:" + AgentKitPaths.ProjectRoot;

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

            if (EditorPrefs.GetBool(DontAutoOpenKey, false))
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
            if (!TryParseVersion(installed, out var installedVersion) || !TryParseVersion(packaged, out var packagedVersion))
            {
                return false;
            }

            return installedVersion < packagedVersion;
        }

        private static bool TryParseVersion(string text, out Version version)
        {
            version = null;
            if (string.IsNullOrEmpty(text))
            {
                return false;
            }

            // System.Version cannot parse semver prerelease/build suffixes
            // ("0.4.0-preview.1"); compare on the numeric core.
            var end = text.IndexOfAny(new[] { '-', '+' });
            var core = end >= 0 ? text.Substring(0, end) : text;
            return Version.TryParse(core, out version);
        }
    }
}

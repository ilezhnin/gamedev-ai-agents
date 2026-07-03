using System;
using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEditor.PackageManager;
using UnityEngine;

namespace GamedevAgentKit.Editor
{
    /// <summary>
    /// Keeps installed kit files current after Package Manager updates and
    /// opens the setup window once per editor session when the kit is missing.
    /// Re-adding the package resets the once-per-session latch, so a remove
    /// and re-add within one editor session prompts again.
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
            EditorApplication.delayCall += UpdateOrPromptIfNeeded;
            Events.registeredPackages += OnRegisteredPackages;
        }

        private static void OnRegisteredPackages(PackageRegistrationEventArgs args)
        {
            // A fresh add or package update must run even when the window was
            // already shown earlier in this editor session: SessionState
            // survives domain reloads, so without the reset a remove + re-add
            // stays silent until the editor restarts.
            if (!IncludesThisPackage(args.added) && !IncludesThisPackage(args.changedTo))
            {
                return;
            }

            SessionState.SetBool(SessionKey, false);
            UpdateOrPromptIfNeeded();
        }

        private static bool IncludesThisPackage(IEnumerable<UnityEditor.PackageManager.PackageInfo> packages)
        {
            return packages != null && packages.Any(package => package.name == AgentKitPaths.PackageName);
        }

        private static void UpdateOrPromptIfNeeded()
        {
            if (Application.isBatchMode)
            {
                return;
            }

            if (AgentKitPaths.PayloadRoot == null)
            {
                return;
            }

            var manifest = KitManifest.Load(AgentKitPaths.ManifestPath);
            if (manifest == null)
            {
                PromptIfAllowed();
                return;
            }

            if (!IsOlder(manifest.KitVersion, AgentKitPaths.PackageVersion))
            {
                return;
            }

            var report = AgentKitInstaller.Run(KitInstallMode.Update, false);
            if (report.Failed)
            {
                Debug.LogError("[Agent Kit] Automatic update failed: " + report.Summary());
                PromptIfAllowed();
                return;
            }

            if (KitGitExclude.BlockExists(AgentKitPaths.ProjectRoot))
            {
                var updatedManifest = KitManifest.Load(AgentKitPaths.ManifestPath);
                if (updatedManifest != null)
                {
                    KitGitExclude.Write(AgentKitPaths.ProjectRoot, updatedManifest.Files.Keys, report, false);
                }
            }

            Debug.Log("[Agent Kit] Automatically updated installed kit files after package update. " + report.Summary());
        }

        private static void PromptIfAllowed()
        {
            if (SessionState.GetBool(SessionKey, false) || EditorPrefs.GetBool(DontAutoOpenKey, false))
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

using System.Linq;
using UnityEditor;
using UnityEditor.PackageManager;
using UnityEngine;

namespace GamedevAgentKit.Editor
{
    /// <summary>
    /// Removes the installed kit files when the package itself is removed
    /// through the Package Manager. Subscribes to registeringPackages because
    /// it is raised before the package assemblies unload - after the removal
    /// completes this code no longer exists in the project. The window's
    /// "Remove Package Reference" (portable flow) sets a session flag so that
    /// path keeps the installed files.
    /// </summary>
    [InitializeOnLoad]
    internal static class AgentKitPackageCleanup
    {
        // SessionState survives the domain reloads around a package operation
        // but not an editor restart - the lifetime of a pending removal.
        internal static string KeepFilesKey => "GamedevAgentKit.KeepFilesOnRemove:" + AgentKitPaths.ProjectRoot;

        static AgentKitPackageCleanup()
        {
            Events.registeringPackages += OnRegisteringPackages;
        }

        private static void OnRegisteringPackages(PackageRegistrationEventArgs args)
        {
            if (!args.removed.Any(package => package.name == AgentKitPaths.PackageName))
            {
                return;
            }

            if (SessionState.GetBool(KeepFilesKey, false))
            {
                SessionState.SetBool(KeepFilesKey, false);
                return;
            }

            if (KitManifest.Load(AgentKitPaths.ManifestPath) == null)
            {
                return;
            }

            // Batch mode must not delete project files on an automated package
            // operation; point at the manual paths instead.
            if (Application.isBatchMode)
            {
                Debug.Log("[Agent Kit] Package removed in batch mode; the installed kit files were left in place. Remove them with scripts/uninstall-project-template.ps1, or re-add the package and use Uninstall.");
                return;
            }

            var removeFiles = EditorUtility.DisplayDialog(
                "Agent Kit",
                "The Gamedev AI Agents Kit package is being removed.\n\nAlso remove the kit files it installed into the project (AGENTS.md, .agents/, .claude/, .codex/, .cursor/)? Locally modified files are kept.",
                "Remove kit files",
                "Keep files");
            if (!removeFiles)
            {
                return;
            }

            var report = AgentKitInstaller.Uninstall(false);
            if (!report.Failed)
            {
                KitGitExclude.Remove(AgentKitPaths.ProjectRoot, report, false);
            }

            if (report.Failed)
            {
                Debug.LogError("[Agent Kit] Uninstall on package removal failed: " + report.Summary());
            }
            else
            {
                Debug.Log("[Agent Kit] Kit files removed with the package. " + report.Summary());
            }
        }
    }
}

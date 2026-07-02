using UnityEditor;
using UnityEditor.PackageManager;
using UnityEngine;

namespace GamedevAgentKit.Editor
{
    /// <summary>
    /// Setup window for the kit: shows the installed vs packaged kit version and
    /// runs install, update, force reinstall, and uninstall with an optional dry
    /// run. Portable mode git-excludes every kit file, and the package reference
    /// itself can be removed so a portable install leaves no trace in the repo.
    /// </summary>
    internal sealed class AgentKitWindow : EditorWindow
    {
        private Vector2 _scroll;
        private KitOperationReport _lastReport;
        private KitManifest _manifest;
        private bool _dryRun;
        private bool _portable;

        // Resolved once per refresh instead of per OnGUI repaint: package info
        // and payload lookup hit the Package Manager and the file system.
        private string _packageVersion;
        private string _projectRoot;
        private bool _payloadPresent;

        [MenuItem("Window/Agent Kit/Setup")]
        internal static void Open()
        {
            var window = GetWindow<AgentKitWindow>("Agent Kit");
            window.minSize = new Vector2(420f, 320f);
            window.Show();
        }

        [MenuItem("Window/Agent Kit/Documentation")]
        private static void OpenDocumentation()
        {
            Application.OpenURL(AgentKitPaths.DocumentationUrl);
        }

        private void OnEnable()
        {
            RefreshManifest();
            // Initialized once, not on every focus: the toggle carries the user's
            // intent for the next operation and must not snap back to disk state.
            _portable = KitGitExclude.BlockExists(_projectRoot);
        }

        private void OnFocus()
        {
            RefreshManifest();
        }

        private void RefreshManifest()
        {
            _manifest = KitManifest.Load(AgentKitPaths.ManifestPath);
            _packageVersion = AgentKitPaths.PackageVersion;
            _projectRoot = AgentKitPaths.ProjectRoot;
            _payloadPresent = AgentKitPaths.PayloadRoot != null;
        }

        private void OnGUI()
        {
            EditorGUILayout.Space();
            EditorGUILayout.LabelField("Gamedev AI Agents Kit", EditorStyles.boldLabel);
            EditorGUILayout.LabelField("Package version", _packageVersion ?? "unknown");
            EditorGUILayout.LabelField("Installed version", _manifest?.KitVersion ?? "not installed");
            EditorGUILayout.LabelField("Project root", _projectRoot);

            if (!_payloadPresent)
            {
                EditorGUILayout.HelpBox(
                    "Package payload (Kit~) not found. Reinstall the package, or when using a local clone run scripts/render-upm-payload.ps1 first.",
                    MessageType.Error);
                return;
            }

            EditorGUILayout.Space();
            if (_manifest == null)
            {
                EditorGUILayout.HelpBox(
                    "Install copies the kit files (AGENTS.md, contracts, skills, platform adapters) into the project root and records them in .agents/kit-manifest.json.",
                    MessageType.Info);
            }
            else if (_manifest.KitVersion != _packageVersion)
            {
                EditorGUILayout.HelpBox(
                    "The package ships kit " + _packageVersion + " but the project has kit " + _manifest.KitVersion +
                    ". Update refreshes unmodified kit files, keeps your local edits, and removes files the kit no longer ships.",
                    MessageType.Info);
            }

            _dryRun = EditorGUILayout.ToggleLeft("Dry run (preview only, write nothing)", _dryRun);

            _portable = EditorGUILayout.ToggleLeft(
                new GUIContent(
                    "Portable install (git-exclude all kit files)",
                    "Lists every kit file in the repository's .git/info/exclude - a local ignore file that is never committed - so the kit stays out of git status. Applied by Install, Update, and Force Reinstall; unchecking it removes the entries on the next operation. Uninstall always removes them."),
                _portable);

            var dontAutoOpen = EditorPrefs.GetBool(AgentKitBootstrap.DontAutoOpenKey, false);
            var dontAutoOpenNew = EditorGUILayout.ToggleLeft("Do not open this window automatically for this project", dontAutoOpen);
            if (dontAutoOpenNew != dontAutoOpen)
            {
                EditorPrefs.SetBool(AgentKitBootstrap.DontAutoOpenKey, dontAutoOpenNew);
            }

            EditorGUILayout.BeginHorizontal();
            // Plain install never overwrites, so with a manifest present it can
            // only skip; route users to Update / Force Reinstall instead.
            using (new EditorGUI.DisabledScope(_manifest != null))
            {
                if (GUILayout.Button(new GUIContent("Install", _manifest != null ? "Already installed - use Update or Force Reinstall." : "Copy the kit files into the project.")))
                {
                    RunInstall(KitInstallMode.Install);
                }
            }

            using (new EditorGUI.DisabledScope(_manifest == null))
            {
                if (GUILayout.Button("Update"))
                {
                    RunInstall(KitInstallMode.Update);
                }
            }

            if (GUILayout.Button("Force Reinstall") && ConfirmDestructive("Force reinstall", "Overwrite ALL kit files in the project, including your local edits?"))
            {
                RunInstall(KitInstallMode.Force);
            }

            using (new EditorGUI.DisabledScope(_manifest == null))
            {
                if (GUILayout.Button("Uninstall") && ConfirmDestructive("Uninstall kit", "Remove all unmodified kit files from the project? Locally modified files are kept (run Force Reinstall first if you want them removed too)."))
                {
                    RunUninstall();
                }
            }

            EditorGUILayout.EndHorizontal();

            DrawRemovePackageReference();

            if (_lastReport != null)
            {
                EditorGUILayout.Space();
                EditorGUILayout.HelpBox(_lastReport.Summary(), _lastReport.Failed ? MessageType.Error : MessageType.Info);
                if (!_lastReport.Failed && !_lastReport.DryRun)
                {
                    EditorGUILayout.HelpBox(
                        "Restart Codex / Claude Code / Antigravity or start a new session from this project so the agents pick up the kit files.",
                        MessageType.Info);
                }

                _scroll = EditorGUILayout.BeginScrollView(_scroll);
                foreach (var line in _lastReport.Lines)
                {
                    EditorGUILayout.LabelField(line, EditorStyles.miniLabel);
                }

                EditorGUILayout.EndScrollView();
            }
        }

        private void DrawRemovePackageReference()
        {
            // The final step of a fully portable setup: with the kit files
            // installed (and git-excluded), dropping the package reference wipes
            // the last committed trace - Packages/manifest.json and the lock file.
            var package = AgentKitPaths.Package;
            var embedded = package != null && package.source == PackageSource.Embedded;
            using (new EditorGUI.DisabledScope(package == null || embedded || _dryRun))
            {
                var tooltip = embedded
                    ? "The package is embedded under Packages/ - delete its folder manually instead."
                    : "Remove " + AgentKitPaths.PackageName + " from Packages/manifest.json and the lock file. Installed kit files stay in the project and keep working; add the package again to update or uninstall the kit later.";
                if (GUILayout.Button(new GUIContent("Remove Package Reference", tooltip))
                    && EditorUtility.DisplayDialog(
                        "Remove package reference",
                        "Remove " + AgentKitPaths.PackageName + " from Packages/manifest.json?\n\nThe installed kit files stay in the project and keep working. To update or uninstall the kit later, add the package again.\n\nUnity will resolve packages and this window will close.",
                        "Remove",
                        "Cancel"))
                {
                    Client.Remove(AgentKitPaths.PackageName);
                    Close();
                }
            }
        }

        private void RunInstall(KitInstallMode mode)
        {
            _lastReport = AgentKitInstaller.Run(mode, _dryRun);
            if (!_lastReport.Failed)
            {
                if (_portable)
                {
                    // The installer has just written the manifest; its file set is
                    // exactly what must be excluded (same source as the PS installers).
                    var manifest = KitManifest.Load(AgentKitPaths.ManifestPath);
                    if (manifest != null)
                    {
                        KitGitExclude.Write(_projectRoot, manifest.Files.Keys, _lastReport, _dryRun);
                    }
                    else if (_dryRun)
                    {
                        _lastReport.Lines.Add("PORTABLE (dry run) would write the git exclude block after installing.");
                    }
                }
                else
                {
                    KitGitExclude.Remove(_projectRoot, _lastReport, _dryRun);
                }
            }

            RefreshManifest();
        }

        private void RunUninstall()
        {
            _lastReport = AgentKitInstaller.Uninstall(_dryRun);
            if (!_lastReport.Failed)
            {
                KitGitExclude.Remove(_projectRoot, _lastReport, _dryRun);
            }

            RefreshManifest();
        }

        private bool ConfirmDestructive(string title, string message)
        {
            return _dryRun || EditorUtility.DisplayDialog(title, message, "Proceed", "Cancel");
        }
    }
}

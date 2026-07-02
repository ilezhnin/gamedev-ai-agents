using UnityEditor;
using UnityEngine;

namespace GamedevAgentKit.Editor
{
    /// <summary>
    /// Setup window for the kit: shows the installed vs packaged kit version and
    /// runs install, update, force reinstall, and uninstall with an optional dry run.
    /// </summary>
    internal sealed class AgentKitWindow : EditorWindow
    {
        private Vector2 _scroll;
        private KitOperationReport _lastReport;
        private KitManifest _manifest;
        private bool _dryRun;

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
                    RunOperation(() => AgentKitInstaller.Run(KitInstallMode.Install, _dryRun));
                }
            }

            using (new EditorGUI.DisabledScope(_manifest == null))
            {
                if (GUILayout.Button("Update"))
                {
                    RunOperation(() => AgentKitInstaller.Run(KitInstallMode.Update, _dryRun));
                }
            }

            if (GUILayout.Button("Force Reinstall") && ConfirmDestructive("Force reinstall", "Overwrite ALL kit files in the project, including your local edits?"))
            {
                RunOperation(() => AgentKitInstaller.Run(KitInstallMode.Force, _dryRun));
            }

            using (new EditorGUI.DisabledScope(_manifest == null))
            {
                if (GUILayout.Button("Uninstall") && ConfirmDestructive("Uninstall kit", "Remove all unmodified kit files from the project? Locally modified files are kept (run Force Reinstall first if you want them removed too)."))
                {
                    RunOperation(() => AgentKitInstaller.Uninstall(_dryRun));
                }
            }

            EditorGUILayout.EndHorizontal();

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

        private void RunOperation(System.Func<KitOperationReport> operation)
        {
            _lastReport = operation();
            RefreshManifest();
        }

        private bool ConfirmDestructive(string title, string message)
        {
            return _dryRun || EditorUtility.DisplayDialog(title, message, "Proceed", "Cancel");
        }
    }
}

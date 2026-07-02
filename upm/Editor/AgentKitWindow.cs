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
        }

        private void OnGUI()
        {
            EditorGUILayout.Space();
            EditorGUILayout.LabelField("Gamedev AI Agents Kit", EditorStyles.boldLabel);
            EditorGUILayout.LabelField("Package version", AgentKitPaths.PackageVersion ?? "unknown");
            EditorGUILayout.LabelField("Installed version", _manifest?.KitVersion ?? "not installed");
            EditorGUILayout.LabelField("Project root", AgentKitPaths.ProjectRoot);

            if (AgentKitPaths.PayloadRoot == null)
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
            else if (_manifest.KitVersion != AgentKitPaths.PackageVersion)
            {
                EditorGUILayout.HelpBox(
                    "The package ships kit " + AgentKitPaths.PackageVersion + " but the project has kit " + _manifest.KitVersion +
                    ". Update refreshes unmodified kit files, keeps your local edits, and removes files the kit no longer ships.",
                    MessageType.Info);
            }

            _dryRun = EditorGUILayout.ToggleLeft("Dry run (preview only, write nothing)", _dryRun);

            EditorGUILayout.BeginHorizontal();
            if (GUILayout.Button("Install"))
            {
                RunOperation(() => AgentKitInstaller.Run(KitInstallMode.Install, _dryRun));
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
                if (GUILayout.Button("Uninstall") && ConfirmDestructive("Uninstall kit", "Remove all unmodified kit files from the project? Locally modified files are kept."))
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

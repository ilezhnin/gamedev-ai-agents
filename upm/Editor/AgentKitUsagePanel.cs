using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEngine;

namespace GamedevAgentKit.Editor
{
    internal sealed class AgentKitUsagePanel
    {
        private readonly string[] _windowLabels = { "24h", "7d", "30d" };

        private bool _expanded = true;
        private int _selectedWindow = 1;
        private bool _refreshing;
        private string _message;
        private string _loadedProjectRoot;
        private Summary _summary;
        private UsageConfig _config = UsageConfig.Default();

        internal void Reload()
        {
            _loadedProjectRoot = AgentKitPaths.ProjectRoot;
            _summary = null;
            _config = UsageConfig.Default();
            _message = null;

            if (string.IsNullOrEmpty(_loadedProjectRoot))
            {
                return;
            }

            var usageDir = UsageDir(_loadedProjectRoot);
            _config = LoadConfig(Path.Combine(usageDir, "usage-config.json"));
            _summary = LoadSummary(Path.Combine(usageDir, "stats-summary.json"));
        }

        internal void Draw(string projectRoot)
        {
            EditorGUILayout.Space();
            _expanded = EditorGUILayout.Foldout(_expanded, "Usage statistics", true);
            if (!_expanded)
            {
                return;
            }

            if (!string.Equals(_loadedProjectRoot, projectRoot, StringComparison.Ordinal))
            {
                Reload();
            }

            if (!string.IsNullOrEmpty(_message))
            {
                EditorGUILayout.HelpBox(_message, MessageType.Warning);
            }

            if (string.IsNullOrEmpty(projectRoot))
            {
                EditorGUILayout.HelpBox("Project root could not be resolved.", MessageType.Warning);
                return;
            }

            DrawControls(projectRoot);

            if (_summary == null)
            {
                EditorGUILayout.HelpBox("No statistics yet. Press Refresh, or finish one Claude Code turn in this project.", MessageType.Info);
                DrawFooter(projectRoot);
                return;
            }

            DrawPlatforms(_summary.Platforms);
            _selectedWindow = GUILayout.Toolbar(_selectedWindow, _windowLabels);
            if (_selectedWindow < 0 || _selectedWindow >= _windowLabels.Length)
            {
                _selectedWindow = 1;
            }

            if (!_summary.Windows.TryGetValue(_windowLabels[_selectedWindow], out var window))
            {
                EditorGUILayout.HelpBox("The statistics file does not contain the selected window.", MessageType.Warning);
                DrawFooter(projectRoot);
                return;
            }

            DrawTotals(window);
            DrawPerPlatform(window.PerPlatform);
            DrawModels(window.Models);
            DrawRoles(window.Roles);
            DrawWarnings(_summary.Warnings);
            DrawFooter(projectRoot);
        }

        private void DrawControls(string projectRoot)
        {
            EditorGUILayout.BeginHorizontal();
            using (new EditorGUI.DisabledScope(_refreshing))
            {
                if (GUILayout.Button(_refreshing ? "Refreshing..." : "Refresh", GUILayout.Width(120f)))
                {
                    _refreshing = true;
                    _message = null;
                    AgentKitProcess.RunPowerShellAsync(".agents/scripts/usage-stats.ps1", projectRoot, exitCode =>
                    {
                        _refreshing = false;
                        if (exitCode == AgentKitProcess.PowerShellNotFoundExitCode)
                        {
                            _message = "PowerShell not found. Install pwsh or Windows PowerShell and try again.";
                        }
                        else if (exitCode != 0)
                        {
                            _message = "Usage statistics refresh exited with code " + exitCode + ".";
                        }

                        Reload();
                    });
                }
            }

            var retention = Mathf.Clamp(EditorGUILayout.IntField(new GUIContent("Retention", "Days of usage history to keep."), _config.RetentionDays, GUILayout.Width(180f)), 30, 365);
            var codexEnabled = EditorGUILayout.ToggleLeft(new GUIContent("Scan Codex", "Scan local Codex rollout files when refreshing."), _config.CodexScanEnabled, GUILayout.Width(110f));
            EditorGUILayout.EndHorizontal();

            if (retention != _config.RetentionDays || codexEnabled != _config.CodexScanEnabled)
            {
                _config.RetentionDays = retention;
                _config.CodexScanEnabled = codexEnabled;
                try
                {
                    SaveConfig(projectRoot, _config);
                    _message = null;
                }
                catch (Exception ex)
                {
                    _message = "Could not write usage settings: " + ex.Message;
                }
            }
        }

        private void DrawPlatforms(List<PlatformStatus> platforms)
        {
            if (platforms.Count == 0)
            {
                return;
            }

            EditorGUILayout.BeginHorizontal();
            foreach (var platform in platforms)
            {
                GUILayout.Label(Display(platform.Name, "unknown") + ": " + Display(platform.Status, "unknown") + FormatLastActivity(platform.LastActivityUtc), EditorStyles.miniLabel);
            }

            EditorGUILayout.EndHorizontal();
        }

        private void DrawTotals(WindowSummary window)
        {
            var totals = window.Totals;
            var costSuffix = totals.CostComplete ? string.Empty : "+";
            EditorGUILayout.LabelField(
                "Requests " + totals.Requests +
                " | Messages " + (totals.UserMessages + totals.AssistantMessages) +
                " | In " + FormatTokens(totals.TokensIn) +
                " | Out " + FormatTokens(totals.TokensOut),
                EditorStyles.miniLabel);
            EditorGUILayout.LabelField(
                "CacheR " + FormatTokens(totals.CacheRead) +
                " | CacheW " + FormatTokens(totals.CacheWrite) +
                " | Hit " + FormatPercent(totals.CacheHitRatio * 100.0) +
                " | Est $" + FormatMoney(totals.EstCost) + costSuffix,
                EditorStyles.miniLabel);
            EditorGUILayout.LabelField(
                "Burn " + FormatTokens((long)window.Burn.TokensPerDay) + "/day" +
                " | $" + FormatMoney(window.Burn.CostPerDay) + "/day over " + window.CoveredDays.ToString("0.0", CultureInfo.InvariantCulture) + "d" +
                " | $" + FormatMoney(window.Burn.CostPerActiveHour) + "/active hour",
                EditorStyles.miniLabel);
        }

        private void DrawPerPlatform(List<PlatformMetrics> platforms)
        {
            if (platforms.Count == 0)
            {
                return;
            }

            EditorGUILayout.LabelField("Per platform", EditorStyles.boldLabel);
            foreach (var platform in platforms)
            {
                var suffix = platform.CostComplete ? string.Empty : "+";
                EditorGUILayout.LabelField(
                    Display(platform.Platform, "unknown").PadRight(12) +
                    "req " + platform.Requests.ToString(CultureInfo.InvariantCulture).PadRight(6) +
                    "msg " + (platform.UserMessages + platform.AssistantMessages).ToString(CultureInfo.InvariantCulture).PadRight(6) +
                    "in " + FormatTokens(platform.TokensIn).PadRight(8) +
                    "out " + FormatTokens(platform.TokensOut).PadRight(8) +
                    "cacheR " + FormatTokens(platform.CacheRead).PadRight(8) +
                    "cacheW " + FormatTokens(platform.CacheWrite).PadRight(8) +
                    "$" + FormatMoney(platform.EstCost) + suffix,
                    EditorStyles.miniLabel);
            }
        }

        private void DrawModels(List<ModelMetrics> models)
        {
            if (models.Count == 0)
            {
                return;
            }

            EditorGUILayout.LabelField("Model distribution", EditorStyles.boldLabel);
            foreach (var model in models)
            {
                var costText = model.CostPriced ? "$" + FormatMoney(model.EstCost) : "n/a cost";
                EditorGUILayout.LabelField(
                    Display(model.Platform, "unknown") + "/" + Display(model.Model, "unknown") + "  " +
                    FormatPercent(model.CostSharePct) + " cost | " +
                    FormatPercent(model.TokenSharePct) + " tokens | " +
                    FormatPercent(model.RequestSharePct) + " calls | " +
                    costText,
                    EditorStyles.miniLabel);
            }
        }

        private void DrawRoles(List<RoleMetrics> roles)
        {
            if (roles.Count == 0)
            {
                return;
            }

            EditorGUILayout.LabelField("Roles", EditorStyles.boldLabel);
            foreach (var role in roles.OrderByDescending(r => r.EstCost).Take(10))
            {
                EditorGUILayout.LabelField(
                    (Display(role.Platform, "unknown") + "/" + Display(role.Scope, "unknown")).PadRight(28) +
                    "runs " + role.Runs.ToString(CultureInfo.InvariantCulture).PadRight(5) +
                    "tokens " + FormatTokens(role.TokensIn + role.TokensOut).PadRight(8) +
                    "est $" + FormatMoney(role.EstCost).PadRight(8) +
                    "last " + ShortTime(role.LastUsedUtc),
                    EditorStyles.miniLabel);
            }
        }

        private void DrawWarnings(List<string> warnings)
        {
            if (warnings.Count == 0)
            {
                return;
            }

            foreach (var warning in warnings)
            {
                EditorGUILayout.LabelField("Warning: " + warning, EditorStyles.miniLabel);
            }
        }

        private void DrawFooter(string projectRoot)
        {
            EditorGUILayout.BeginHorizontal();
            EditorGUILayout.LabelField("Usage only - no quality data. Estimates are API-equivalent, not billing.", EditorStyles.miniLabel);
            var reportPath = Path.Combine(UsageDir(projectRoot), "usage-stats.md");
            using (new EditorGUI.DisabledScope(!File.Exists(reportPath)))
            {
                if (GUILayout.Button("Open full report", GUILayout.Width(120f)))
                {
                    EditorUtility.OpenWithDefaultApp(reportPath);
                }
            }

            EditorGUILayout.EndHorizontal();
        }

        private static Summary LoadSummary(string path)
        {
            if (!File.Exists(path))
            {
                return null;
            }

            try
            {
                var root = KitJson.Parse(File.ReadAllText(path)) as Dictionary<string, object>;
                if (root == null)
                {
                    return null;
                }

                var summary = new Summary
                {
                    GeneratedUtc = StringValue(root, "generatedUtc"),
                    RetentionDays = LongValue(root, "retentionDays", 90),
                    FirstRecordUtc = StringValue(root, "firstRecordUtc")
                };

                if (root.TryGetValue("platforms", out var platformsValue) && platformsValue is List<object> platforms)
                {
                    foreach (var item in platforms)
                    {
                        if (item is Dictionary<string, object> dict)
                        {
                            summary.Platforms.Add(new PlatformStatus
                            {
                                Name = StringValue(dict, "platform"),
                                Status = StringValue(dict, "status"),
                                LastActivityUtc = StringValue(dict, "lastActivityUtc")
                            });
                        }
                    }
                }

                if (root.TryGetValue("windows", out var windowsValue) && windowsValue is Dictionary<string, object> windows)
                {
                    foreach (var pair in windows)
                    {
                        if (pair.Value is Dictionary<string, object> dict)
                        {
                            summary.Windows[pair.Key] = ParseWindow(dict);
                        }
                    }
                }

                if (root.TryGetValue("warnings", out var warningsValue) && warningsValue is List<object> warnings)
                {
                    foreach (var warning in warnings)
                    {
                        if (warning is string text)
                        {
                            summary.Warnings.Add(text);
                        }
                    }
                }

                return summary;
            }
            catch (FormatException)
            {
                return null;
            }
            catch (IOException)
            {
                return null;
            }
            catch (UnauthorizedAccessException)
            {
                return null;
            }
        }

        private static WindowSummary ParseWindow(Dictionary<string, object> dict)
        {
            var window = new WindowSummary
            {
                CoveredDays = DoubleValue(dict, "coveredDays", 0.0)
            };

            if (dict.TryGetValue("totals", out var totalsValue) && totalsValue is Dictionary<string, object> totals)
            {
                window.Totals = new TotalsMetrics
                {
                    Requests = LongValue(totals, "requests", 0),
                    UserMessages = LongValue(totals, "userMessages", 0),
                    AssistantMessages = LongValue(totals, "assistantMessages", 0),
                    TokensIn = LongValue(totals, "tokensIn", 0),
                    TokensOut = LongValue(totals, "tokensOut", 0),
                    CacheRead = LongValue(totals, "cacheRead", 0),
                    CacheWrite = LongValue(totals, "cacheWrite", 0),
                    EstCost = DoubleValue(totals, "estCost", 0.0),
                    CostComplete = BoolValue(totals, "costComplete", true),
                    WallSeconds = DoubleValue(totals, "wallSeconds", 0.0),
                    CacheHitRatio = DoubleValue(totals, "cacheHitRatio", 0.0)
                };
            }

            if (dict.TryGetValue("burn", out var burnValue) && burnValue is Dictionary<string, object> burn)
            {
                window.Burn = new BurnMetrics
                {
                    TokensPerDay = DoubleValue(burn, "tokensPerDay", 0.0),
                    CostPerDay = DoubleValue(burn, "costPerDay", 0.0),
                    CostPerActiveHour = DoubleValue(burn, "costPerActiveHour", 0.0)
                };
            }

            if (dict.TryGetValue("perPlatform", out var perPlatformValue) && perPlatformValue is List<object> perPlatform)
            {
                foreach (var item in perPlatform)
                {
                    if (item is Dictionary<string, object> platform)
                    {
                        window.PerPlatform.Add(new PlatformMetrics
                        {
                            Platform = StringValue(platform, "platform"),
                            Requests = LongValue(platform, "requests", 0),
                            UserMessages = LongValue(platform, "userMessages", 0),
                            AssistantMessages = LongValue(platform, "assistantMessages", 0),
                            TokensIn = LongValue(platform, "tokensIn", 0),
                            TokensOut = LongValue(platform, "tokensOut", 0),
                            CacheRead = LongValue(platform, "cacheRead", 0),
                            CacheWrite = LongValue(platform, "cacheWrite", 0),
                            EstCost = DoubleValue(platform, "estCost", 0.0),
                            CostComplete = BoolValue(platform, "costComplete", true)
                        });
                    }
                }
            }

            if (dict.TryGetValue("models", out var modelsValue) && modelsValue is List<object> models)
            {
                foreach (var item in models)
                {
                    if (item is Dictionary<string, object> model)
                    {
                        window.Models.Add(new ModelMetrics
                        {
                            Model = StringValue(model, "model"),
                            Platform = StringValue(model, "platform"),
                            Requests = LongValue(model, "requests", 0),
                            TokensIn = LongValue(model, "tokensIn", 0),
                            TokensOut = LongValue(model, "tokensOut", 0),
                            EstCost = DoubleValue(model, "estCost", 0.0),
                            CostPriced = BoolValue(model, "costPriced", true),
                            CostSharePct = DoubleValue(model, "costSharePct", 0.0),
                            TokenSharePct = DoubleValue(model, "tokenSharePct", 0.0),
                            RequestSharePct = DoubleValue(model, "requestSharePct", 0.0)
                        });
                    }
                }
            }

            if (dict.TryGetValue("roles", out var rolesValue) && rolesValue is List<object> roles)
            {
                foreach (var item in roles)
                {
                    if (item is Dictionary<string, object> role)
                    {
                        window.Roles.Add(new RoleMetrics
                        {
                            Scope = StringValue(role, "scope"),
                            Platform = StringValue(role, "platform"),
                            Runs = LongValue(role, "runs", 0),
                            TokensIn = LongValue(role, "tokensIn", 0),
                            TokensOut = LongValue(role, "tokensOut", 0),
                            EstCost = DoubleValue(role, "estCost", 0.0),
                            LastUsedUtc = StringValue(role, "lastUsedUtc")
                        });
                    }
                }
            }

            return window;
        }

        private static UsageConfig LoadConfig(string path)
        {
            var config = UsageConfig.Default();
            if (!File.Exists(path))
            {
                return config;
            }

            try
            {
                var root = KitJson.Parse(File.ReadAllText(path)) as Dictionary<string, object>;
                if (root == null)
                {
                    return config;
                }

                config.RetentionDays = (int)Mathf.Clamp((float)LongValue(root, "retentionDays", config.RetentionDays), 30f, 365f);
                config.CodexScanEnabled = BoolValue(root, "codexScanEnabled", config.CodexScanEnabled);
            }
            catch (FormatException)
            {
                return config;
            }
            catch (IOException)
            {
                return config;
            }
            catch (UnauthorizedAccessException)
            {
                return config;
            }

            return config;
        }

        private static void SaveConfig(string projectRoot, UsageConfig config)
        {
            var path = Path.Combine(UsageDir(projectRoot), "usage-config.json");
            var directory = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }

            var sb = new StringBuilder();
            sb.Append("{\n");
            sb.Append("  ").Append(KitJson.WriteString("v")).Append(": ").Append(1.ToString(CultureInfo.InvariantCulture)).Append(",\n");
            sb.Append("  ").Append(KitJson.WriteString("retentionDays")).Append(": ").Append(config.RetentionDays.ToString(CultureInfo.InvariantCulture)).Append(",\n");
            sb.Append("  ").Append(KitJson.WriteString("codexScanEnabled")).Append(": ").Append(config.CodexScanEnabled ? "true" : "false").Append("\n");
            sb.Append("}\n");

            var temp = path + ".tmp";
            File.WriteAllText(temp, sb.ToString(), new UTF8Encoding(false));
            if (File.Exists(path))
            {
                File.Replace(temp, path, null);
            }
            else
            {
                File.Move(temp, path);
            }
        }

        private static string UsageDir(string projectRoot)
        {
            return Path.Combine(projectRoot, ".agents", "usage");
        }

        private static string StringValue(Dictionary<string, object> dict, string key)
        {
            return dict.TryGetValue(key, out var value) ? value as string : null;
        }

        private static long LongValue(Dictionary<string, object> dict, string key, long fallback)
        {
            return dict.TryGetValue(key, out var value) && value is double number ? (long)number : fallback;
        }

        private static double DoubleValue(Dictionary<string, object> dict, string key, double fallback)
        {
            return dict.TryGetValue(key, out var value) && value is double number ? number : fallback;
        }

        private static bool BoolValue(Dictionary<string, object> dict, string key, bool fallback)
        {
            return dict.TryGetValue(key, out var value) && value is bool flag ? flag : fallback;
        }

        private static string FormatTokens(long value)
        {
            if (value >= 1000000)
            {
                return (value / 1000000.0).ToString("0.0", CultureInfo.InvariantCulture) + "M";
            }

            if (value >= 1000)
            {
                return (value / 1000.0).ToString("0.0", CultureInfo.InvariantCulture) + "k";
            }

            return value.ToString(CultureInfo.InvariantCulture);
        }

        private static string FormatMoney(double value)
        {
            if (value > 0.0 && value < 0.01)
            {
                return "<0.01";
            }

            return value.ToString("0.00", CultureInfo.InvariantCulture);
        }

        private static string FormatPercent(double value)
        {
            return value.ToString("0.0", CultureInfo.InvariantCulture) + "%";
        }

        private static string Display(string value, string fallback)
        {
            return string.IsNullOrEmpty(value) ? fallback : value;
        }

        private static string ShortTime(string value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return "n/a";
            }

            if (DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var parsed))
            {
                return parsed.ToLocalTime().ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture);
            }

            return value;
        }

        private static string FormatLastActivity(string value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return string.Empty;
            }

            return " (" + ShortTime(value) + ")";
        }

        private sealed class UsageConfig
        {
            internal int RetentionDays;
            internal bool CodexScanEnabled;

            internal static UsageConfig Default()
            {
                return new UsageConfig { RetentionDays = 90, CodexScanEnabled = true };
            }
        }

        private sealed class Summary
        {
            internal string GeneratedUtc;
            internal long RetentionDays;
            internal string FirstRecordUtc;
            internal readonly List<PlatformStatus> Platforms = new List<PlatformStatus>();
            internal readonly Dictionary<string, WindowSummary> Windows = new Dictionary<string, WindowSummary>(StringComparer.Ordinal);
            internal readonly List<string> Warnings = new List<string>();
        }

        private sealed class PlatformStatus
        {
            internal string Name;
            internal string Status;
            internal string LastActivityUtc;
        }

        private sealed class WindowSummary
        {
            internal double CoveredDays;
            internal TotalsMetrics Totals = new TotalsMetrics();
            internal BurnMetrics Burn = new BurnMetrics();
            internal readonly List<PlatformMetrics> PerPlatform = new List<PlatformMetrics>();
            internal readonly List<ModelMetrics> Models = new List<ModelMetrics>();
            internal readonly List<RoleMetrics> Roles = new List<RoleMetrics>();
        }

        private sealed class TotalsMetrics
        {
            internal long Requests;
            internal long UserMessages;
            internal long AssistantMessages;
            internal long TokensIn;
            internal long TokensOut;
            internal long CacheRead;
            internal long CacheWrite;
            internal double EstCost;
            internal bool CostComplete = true;
            internal double WallSeconds;
            internal double CacheHitRatio;
        }

        private sealed class BurnMetrics
        {
            internal double TokensPerDay;
            internal double CostPerDay;
            internal double CostPerActiveHour;
        }

        private sealed class PlatformMetrics
        {
            internal string Platform;
            internal long Requests;
            internal long UserMessages;
            internal long AssistantMessages;
            internal long TokensIn;
            internal long TokensOut;
            internal long CacheRead;
            internal long CacheWrite;
            internal double EstCost;
            internal bool CostComplete = true;
        }

        private sealed class ModelMetrics
        {
            internal string Model;
            internal string Platform;
            internal long Requests;
            internal long TokensIn;
            internal long TokensOut;
            internal double EstCost;
            internal bool CostPriced = true;
            internal double CostSharePct;
            internal double TokenSharePct;
            internal double RequestSharePct;
        }

        private sealed class RoleMetrics
        {
            internal string Scope;
            internal string Platform;
            internal long Runs;
            internal long TokensIn;
            internal long TokensOut;
            internal double EstCost;
            internal string LastUsedUtc;
        }
    }
}

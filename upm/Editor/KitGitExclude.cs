using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace GamedevAgentKit.Editor
{
    /// <summary>
    /// Maintains the kit block in the containing repository's .git/info/exclude -
    /// a local, never-committed ignore file - so a portable install keeps every
    /// kit file out of git status without touching .gitignore. Uses the same
    /// markers as the PowerShell installers (scripts/kit-common.ps1), so either
    /// side can refresh or remove the block.
    /// </summary>
    internal static class KitGitExclude
    {
        private const string BeginMarker = "# >>> gamedev-agent-kit >>>";
        private const string EndMarker = "# <<< gamedev-agent-kit <<<";
        private const string ManifestKey = ".agents/kit-manifest.json";

        internal static bool BlockExists(string projectRoot)
        {
            var location = Resolve(projectRoot);
            if (location == null || !File.Exists(location.ExcludePath))
            {
                return false;
            }

            return File.ReadAllText(location.ExcludePath).Contains(BeginMarker);
        }

        internal static void Write(string projectRoot, IEnumerable<string> manifestKeys, KitOperationReport report, bool dryRun)
        {
            var location = Resolve(projectRoot);
            if (location == null)
            {
                report.Lines.Add("WARN portable: the project is not inside a git work tree (or git was not found) - no exclude entries written.");
                return;
            }

            var keys = manifestKeys
                .Concat(new[] { ManifestKey })
                .Distinct()
                .OrderBy(k => k, StringComparer.Ordinal)
                .ToList();

            if (dryRun)
            {
                report.Lines.Add("PORTABLE (dry run) would exclude " + keys.Count + " kit paths via " + location.ExcludePath);
                return;
            }

            var block = new StringBuilder();
            block.Append(BeginMarker).Append('\n');
            block.Append("# Every kit-installed file, mirrored from .agents/kit-manifest.json.").Append('\n');
            block.Append("# Managed by the kit installers: refreshed on install/update, removed on uninstall.").Append('\n');
            foreach (var key in keys)
            {
                block.Append('/').Append(location.Prefix).Append(key).Append('\n');
            }

            // .agents/plans/.gitignore re-includes itself ("!.gitignore"), and
            // per-directory ignore files override info/exclude entries. Excluding
            // the whole transient plans directory wins: git cannot re-include
            // files under an excluded directory.
            block.Append('/').Append(location.Prefix).Append(".agents/plans/").Append('\n');
            block.Append(EndMarker);

            var existing = File.Exists(location.ExcludePath) ? File.ReadAllText(location.ExcludePath) : string.Empty;
            var directory = Path.GetDirectoryName(location.ExcludePath);
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }

            File.WriteAllText(location.ExcludePath, Merge(existing, block.ToString()));
            report.Lines.Add("PORTABLE " + keys.Count + " kit paths excluded via " + location.ExcludePath);
        }

        internal static void Remove(string projectRoot, KitOperationReport report, bool dryRun)
        {
            var location = Resolve(projectRoot);
            if (location == null || !File.Exists(location.ExcludePath))
            {
                return;
            }

            var existing = File.ReadAllText(location.ExcludePath);
            if (!existing.Contains(BeginMarker))
            {
                return;
            }

            if (dryRun)
            {
                report.Lines.Add("PORTABLE (dry run) would remove the kit exclude block from " + location.ExcludePath);
                return;
            }

            File.WriteAllText(location.ExcludePath, Merge(existing, null));
            report.Lines.Add("PORTABLE kit exclude block removed from " + location.ExcludePath);
        }

        private static string Merge(string existing, string block)
        {
            var pattern = "(?s)" + Regex.Escape(BeginMarker) + ".*?" + Regex.Escape(EndMarker) + "(\r?\n)?";
            var stripped = Regex.Replace(existing ?? string.Empty, pattern, string.Empty).TrimEnd('\r', '\n');
            if (string.IsNullOrEmpty(block))
            {
                return stripped.Length > 0 ? stripped + "\n" : string.Empty;
            }

            return stripped.Length > 0 ? stripped + "\n\n" + block + "\n" : block + "\n";
        }

        private sealed class Location
        {
            internal string ExcludePath;
            internal string Prefix;
        }

        private static Location Resolve(string projectRoot)
        {
            // Prefer the git CLI: it resolves linked worktrees and submodules
            // correctly. Fall back to walking up for a plain .git directory only
            // when git itself is unavailable.
            var inside = RunGit(projectRoot, "rev-parse --is-inside-work-tree");
            if (inside == "true")
            {
                var excludePath = RunGit(projectRoot, "rev-parse --git-path info/exclude");
                var repoRoot = RunGit(projectRoot, "rev-parse --show-toplevel");
                if (!string.IsNullOrEmpty(excludePath) && !string.IsNullOrEmpty(repoRoot))
                {
                    if (!Path.IsPathRooted(excludePath))
                    {
                        excludePath = Path.Combine(projectRoot, excludePath);
                    }

                    return Build(projectRoot, repoRoot, excludePath);
                }

                return null;
            }

            if (inside == null)
            {
                var directory = new DirectoryInfo(Path.GetFullPath(projectRoot));
                while (directory != null)
                {
                    if (Directory.Exists(Path.Combine(directory.FullName, ".git")))
                    {
                        return Build(projectRoot, directory.FullName, Path.Combine(directory.FullName, ".git", "info", "exclude"));
                    }

                    directory = directory.Parent;
                }
            }

            return null;
        }

        private static Location Build(string projectRoot, string repoRoot, string excludePath)
        {
            var repoFull = Path.GetFullPath(repoRoot).Replace('\\', '/').TrimEnd('/');
            var targetFull = Path.GetFullPath(projectRoot).Replace('\\', '/').TrimEnd('/');
            if (!targetFull.StartsWith(repoFull, StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }

            var prefix = targetFull.Substring(repoFull.Length).Trim('/');
            if (prefix.Length > 0)
            {
                prefix += "/";
            }

            return new Location { ExcludePath = Path.GetFullPath(excludePath), Prefix = prefix };
        }

        /// <summary>
        /// Runs git and returns trimmed stdout on success, an empty string when
        /// git ran but failed (not a repository), and null when git could not be
        /// started at all (not installed / not on PATH).
        /// </summary>
        private static string RunGit(string workingDirectory, string arguments)
        {
            try
            {
                using (var process = new Process())
                {
                    process.StartInfo = new ProcessStartInfo
                    {
                        FileName = "git",
                        Arguments = arguments,
                        WorkingDirectory = workingDirectory,
                        UseShellExecute = false,
                        RedirectStandardOutput = true,
                        RedirectStandardError = true,
                        CreateNoWindow = true
                    };
                    process.Start();
                    var output = process.StandardOutput.ReadToEnd();
                    process.StandardError.ReadToEnd();
                    if (!process.WaitForExit(10000))
                    {
                        process.Kill();
                        return string.Empty;
                    }

                    return process.ExitCode == 0 ? output.Trim() : string.Empty;
                }
            }
            catch (Exception)
            {
                return null;
            }
        }
    }
}

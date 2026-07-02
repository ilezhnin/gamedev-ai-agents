using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;

namespace GamedevAgentKit.Editor
{
    /// <summary>
    /// Copies the pre-rendered Kit~ payload into the project root and maintains
    /// .agents/kit-manifest.json. Semantics mirror the kit repository's
    /// PowerShell installers file for file: plain install skips existing files,
    /// update refreshes unmodified kit files, preserves local edits, and removes
    /// stale kit files, force overwrites, uninstall removes unmodified kit files.
    /// </summary>
    internal static class AgentKitInstaller
    {
        internal static KitOperationReport Run(KitInstallMode mode, bool dryRun)
        {
            var report = new KitOperationReport { DryRun = dryRun };

            var payloadRoot = AgentKitPaths.PayloadRoot;
            if (payloadRoot == null)
            {
                report.Error = "Package payload (Kit~) not found. Reinstall the package or re-render it with scripts/render-upm-payload.ps1.";
                return report;
            }

            var projectRoot = AgentKitPaths.ProjectRoot;
            var oldManifest = KitManifest.Load(AgentKitPaths.ManifestPath);
            if (mode == KitInstallMode.Update && oldManifest == null)
            {
                report.Error = "Update requires a previous install (no manifest at " + AgentKitPaths.ManifestPath + "). Run Install first.";
                return report;
            }

            var newManifest = new KitManifest { KitVersion = AgentKitPaths.PackageVersion };

            foreach (var source in Directory.EnumerateFiles(payloadRoot, "*", SearchOption.AllDirectories).OrderBy(p => p, StringComparer.Ordinal))
            {
                var relative = source.Substring(payloadRoot.Length).TrimStart(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                var key = relative.Replace(Path.DirectorySeparatorChar, '/').Replace(Path.AltDirectorySeparatorChar, '/');
                var destination = Path.Combine(projectRoot, relative);

                var sourceHash = HashFile(source);
                newManifest.Files[key] = sourceHash;

                if (!File.Exists(destination))
                {
                    CopyFile(source, destination, dryRun);
                    report.Lines.Add("COPY " + key);
                    report.Copied++;
                    continue;
                }

                if (mode == KitInstallMode.Force)
                {
                    CopyFile(source, destination, dryRun);
                    report.Lines.Add("FORCE " + key);
                    report.Refreshed++;
                    continue;
                }

                if (mode == KitInstallMode.Update)
                {
                    var destinationHash = HashFile(destination);
                    if (destinationHash == sourceHash)
                    {
                        report.Current++;
                        continue;
                    }

                    string oldHash = null;
                    oldManifest?.Files.TryGetValue(key, out oldHash);
                    if (destinationHash == oldHash)
                    {
                        CopyFile(source, destination, dryRun);
                        report.Lines.Add("UPDATE " + key);
                        report.Refreshed++;
                    }
                    else
                    {
                        // The manifest keeps the kit-content hash, so the local
                        // edit stays recognized as a local edit on every future update.
                        report.Lines.Add("KEEP (locally modified) " + key);
                        report.Preserved++;
                    }

                    continue;
                }

                report.Lines.Add("SKIP existing " + key);
                report.Skipped++;
            }

            if (mode == KitInstallMode.Update && oldManifest != null)
            {
                RemoveStaleFiles(oldManifest, newManifest, projectRoot, dryRun, report);
            }

            if (!dryRun)
            {
                newManifest.Save(AgentKitPaths.ManifestPath);
            }

            return report;
        }

        internal static KitOperationReport Uninstall(bool dryRun)
        {
            var report = new KitOperationReport { DryRun = dryRun };

            var manifest = KitManifest.Load(AgentKitPaths.ManifestPath);
            if (manifest == null)
            {
                report.Error = "No kit manifest found at " + AgentKitPaths.ManifestPath + " - nothing to uninstall.";
                return report;
            }

            var projectRoot = AgentKitPaths.ProjectRoot;
            var directories = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var pair in manifest.Files)
            {
                var path = Path.Combine(projectRoot, pair.Key.Replace('/', Path.DirectorySeparatorChar));
                if (!File.Exists(path))
                {
                    report.Missing++;
                    continue;
                }

                if (HashFile(path) == pair.Value)
                {
                    if (!dryRun)
                    {
                        File.Delete(path);
                    }

                    report.Lines.Add("REMOVE " + pair.Key);
                    report.Removed++;
                    CollectParentDirectories(path, projectRoot, directories);
                }
                else
                {
                    report.Lines.Add("KEEP (locally modified) " + pair.Key);
                    report.Preserved++;
                }
            }

            if (!dryRun)
            {
                File.Delete(AgentKitPaths.ManifestPath);
                CollectParentDirectories(AgentKitPaths.ManifestPath, projectRoot, directories);
                RemoveEmptyDirectories(directories);
            }

            return report;
        }

        private static void RemoveStaleFiles(KitManifest oldManifest, KitManifest newManifest, string projectRoot, bool dryRun, KitOperationReport report)
        {
            foreach (var pair in oldManifest.Files)
            {
                if (newManifest.Files.ContainsKey(pair.Key))
                {
                    continue;
                }

                var path = Path.Combine(projectRoot, pair.Key.Replace('/', Path.DirectorySeparatorChar));
                if (!File.Exists(path))
                {
                    continue;
                }

                if (HashFile(path) == pair.Value)
                {
                    if (!dryRun)
                    {
                        File.Delete(path);
                    }

                    report.Lines.Add("REMOVE stale " + pair.Key);
                    report.StaleRemoved++;
                }
                else
                {
                    report.Lines.Add("WARN stale kit file was locally modified and left in place: " + pair.Key);
                    report.StaleKept++;
                }
            }
        }

        private static void CopyFile(string source, string destination, bool dryRun)
        {
            if (dryRun)
            {
                return;
            }

            var directory = Path.GetDirectoryName(destination);
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }

            File.Copy(source, destination, true);
        }

        private static void CollectParentDirectories(string path, string projectRoot, HashSet<string> directories)
        {
            var directory = Path.GetDirectoryName(path);
            while (!string.IsNullOrEmpty(directory) && directory.Length > projectRoot.Length)
            {
                directories.Add(directory);
                directory = Path.GetDirectoryName(directory);
            }
        }

        private static void RemoveEmptyDirectories(HashSet<string> directories)
        {
            foreach (var directory in directories.OrderByDescending(d => d.Length))
            {
                if (Directory.Exists(directory) && !Directory.EnumerateFileSystemEntries(directory).Any())
                {
                    Directory.Delete(directory);
                }
            }
        }

        private static string HashFile(string path)
        {
            using (var sha = SHA256.Create())
            using (var stream = File.OpenRead(path))
            {
                var hash = sha.ComputeHash(stream);
                return BitConverter.ToString(hash).Replace("-", string.Empty);
            }
        }
    }
}

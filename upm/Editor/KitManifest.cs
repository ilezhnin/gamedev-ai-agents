using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

namespace GamedevAgentKit.Editor
{
    /// <summary>
    /// The installed-kit manifest (.agents/kit-manifest.json): kit version plus
    /// the SHA-256 of every kit-shipped file, keyed by forward-slash relative
    /// path. Format-compatible with the kit repository's PowerShell installers,
    /// so editor installs, script installs, updates, and doctor stay interchangeable.
    /// </summary>
    internal sealed class KitManifest
    {
        internal string KitVersion;

        internal readonly SortedDictionary<string, string> Files =
            new SortedDictionary<string, string>(StringComparer.Ordinal);

        internal static KitManifest Load(string path)
        {
            if (!File.Exists(path))
            {
                return null;
            }

            Dictionary<string, object> root;
            try
            {
                root = KitJson.Parse(File.ReadAllText(path)) as Dictionary<string, object>;
            }
            catch (FormatException)
            {
                return null;
            }
            catch (IOException)
            {
                // A locked or unreadable manifest must not throw out of the
                // bootstrap delayCall on every domain reload.
                return null;
            }
            catch (UnauthorizedAccessException)
            {
                return null;
            }

            if (root == null)
            {
                return null;
            }

            var manifest = new KitManifest();
            if (root.TryGetValue("kitVersion", out var version))
            {
                manifest.KitVersion = version as string;
            }

            if (root.TryGetValue("files", out var filesValue) && filesValue is Dictionary<string, object> files)
            {
                foreach (var pair in files)
                {
                    if (pair.Value is string hash)
                    {
                        manifest.Files[pair.Key] = hash;
                    }
                }
            }

            return manifest;
        }

        internal void Save(string path)
        {
            var sb = new StringBuilder();
            sb.Append("{\n");
            sb.Append("  \"kitVersion\": ").Append(KitJson.WriteString(KitVersion)).Append(",\n");
            sb.Append("  \"installedAtUtc\": ").Append(KitJson.WriteString(DateTime.UtcNow.ToString("o"))).Append(",\n");
            sb.Append("  \"files\": {");
            var first = true;
            foreach (var pair in Files)
            {
                sb.Append(first ? "\n" : ",\n");
                sb.Append("    ").Append(KitJson.WriteString(pair.Key)).Append(": ").Append(KitJson.WriteString(pair.Value));
                first = false;
            }

            sb.Append("\n  }\n}\n");

            var directory = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }

            // Write-then-move keeps the install record intact if the editor dies
            // mid-write; a truncated manifest would read as "kit not installed".
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
    }
}

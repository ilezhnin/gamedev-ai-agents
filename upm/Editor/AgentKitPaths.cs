using System.IO;
using UnityEditor.PackageManager;
using UnityEngine;

namespace GamedevAgentKit.Editor
{
    /// <summary>
    /// Resolves the package payload location and the target project locations.
    /// The payload lives in Kit~ (hidden from the asset importer) and is a
    /// pre-rendered copy of what the kit's PowerShell installer would place
    /// into a Unity project.
    /// </summary>
    internal static class AgentKitPaths
    {
        internal const string PackageName = "com.ilezhnin.gamedev-agent-kit";
        internal const string DocumentationUrl = "https://github.com/ilezhnin/gamedev-ai-agents";

        internal static string ProjectRoot => Path.GetDirectoryName(Application.dataPath);

        internal static string ManifestPath => Path.Combine(ProjectRoot, ".agents", "kit-manifest.json");

        internal static PackageInfo Package => PackageInfo.FindForAssembly(typeof(AgentKitPaths).Assembly);

        internal static string PackageVersion => Package?.version;

        internal static string PayloadRoot
        {
            get
            {
                var package = Package;
                if (package == null)
                {
                    return null;
                }

                var payload = Path.Combine(package.resolvedPath, "Kit~");
                return Directory.Exists(payload) ? payload : null;
            }
        }
    }
}

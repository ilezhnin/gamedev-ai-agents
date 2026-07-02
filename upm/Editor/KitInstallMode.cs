namespace GamedevAgentKit.Editor
{
    /// <summary>
    /// Install semantics, mirroring the kit repository's PowerShell installers:
    /// Install copies new files and skips existing ones, Update refreshes files
    /// whose content still matches the manifest and keeps local edits, Force
    /// overwrites everything.
    /// </summary>
    internal enum KitInstallMode
    {
        Install,
        Update,
        Force
    }
}

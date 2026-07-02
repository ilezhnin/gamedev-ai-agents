using System.Collections.Generic;

namespace GamedevAgentKit.Editor
{
    /// <summary>
    /// Result of one install, update, or uninstall pass: per-file action lines
    /// plus the counters used for the summary. Dry runs produce the same report
    /// without touching the file system.
    /// </summary>
    internal sealed class KitOperationReport
    {
        internal readonly List<string> Lines = new List<string>();

        internal bool DryRun;
        internal string Error;

        internal int Copied;
        internal int Refreshed;
        internal int Current;
        internal int Skipped;
        internal int Preserved;
        internal int StaleRemoved;
        internal int StaleKept;
        internal int Removed;
        internal int Missing;

        internal bool Failed => !string.IsNullOrEmpty(Error);

        internal string Summary()
        {
            if (Failed)
            {
                return Error;
            }

            var parts = new List<string>();
            if (Copied > 0) { parts.Add("copied " + Copied); }
            if (Refreshed > 0) { parts.Add("updated " + Refreshed); }
            if (Current > 0) { parts.Add("already current " + Current); }
            if (Skipped > 0) { parts.Add("skipped " + Skipped); }
            if (Preserved > 0) { parts.Add("locally modified kept " + Preserved); }
            if (StaleRemoved > 0) { parts.Add("stale removed " + StaleRemoved); }
            if (StaleKept > 0) { parts.Add("stale kept " + StaleKept); }
            if (Removed > 0) { parts.Add("removed " + Removed); }
            if (Missing > 0) { parts.Add("already missing " + Missing); }
            if (parts.Count == 0) { parts.Add("nothing to do"); }

            var prefix = DryRun ? "Dry run: " : "Summary: ";
            return prefix + string.Join(", ", parts);
        }
    }
}

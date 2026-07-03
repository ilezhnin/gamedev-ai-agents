using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Text;
using UnityEditor;
using UnityEngine;

namespace GamedevAgentKit.Editor
{
    internal static class AgentKitProcess
    {
        internal const int PowerShellNotFoundExitCode = -9001;

        private static Process _runningProcess;
        private static Action<int> _runningOnExit;
        private static EditorApplication.CallbackFunction _runningPoll;

        static AgentKitProcess()
        {
            AssemblyReloadEvents.beforeAssemblyReload += StopRunningProcess;
        }

        internal static void RunPowerShellAsync(string scriptRelPath, string workingDir, Action<int> onExit)
        {
            if (string.IsNullOrEmpty(workingDir) || string.IsNullOrEmpty(scriptRelPath))
            {
                onExit?.Invoke(PowerShellNotFoundExitCode);
                return;
            }

            StopRunningProcess();

            var absoluteScriptPath = Path.IsPathRooted(scriptRelPath)
                ? scriptRelPath
                : Path.Combine(workingDir, scriptRelPath.Replace('/', Path.DirectorySeparatorChar));
            absoluteScriptPath = Path.GetFullPath(absoluteScriptPath);

            var shell = PowerShellExecutable.Resolve();
            if (shell == null)
            {
                onExit?.Invoke(PowerShellNotFoundExitCode);
                return;
            }

            Process process;
            try
            {
                process = Start(shell, absoluteScriptPath, workingDir);
            }
            catch (Win32Exception)
            {
                shell = PowerShellExecutable.Fallback(shell);
                if (shell == null)
                {
                    onExit?.Invoke(PowerShellNotFoundExitCode);
                    return;
                }

                try
                {
                    process = Start(shell, absoluteScriptPath, workingDir);
                }
                catch (Win32Exception)
                {
                    onExit?.Invoke(PowerShellNotFoundExitCode);
                    return;
                }
                catch (Exception)
                {
                    onExit?.Invoke(PowerShellNotFoundExitCode);
                    return;
                }
            }
            catch (Exception)
            {
                onExit?.Invoke(PowerShellNotFoundExitCode);
                return;
            }

            _runningProcess = process;
            _runningOnExit = onExit;
            _runningPoll = PollRunningProcess;
            EditorApplication.update += _runningPoll;
        }

        private static Process Start(string shell, string scriptPath, string workingDir)
        {
            var output = new StringBuilder();
            var error = new StringBuilder();
            var process = new Process();
            process.StartInfo = new ProcessStartInfo
            {
                FileName = shell,
                WorkingDirectory = workingDir,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            };
            process.StartInfo.ArgumentList.Add("-NoProfile");
            process.StartInfo.ArgumentList.Add("-ExecutionPolicy");
            process.StartInfo.ArgumentList.Add("Bypass");
            process.StartInfo.ArgumentList.Add("-File");
            process.StartInfo.ArgumentList.Add(scriptPath);
            process.OutputDataReceived += (_, args) =>
            {
                if (args.Data != null)
                {
                    output.AppendLine(args.Data);
                }
            };
            process.ErrorDataReceived += (_, args) =>
            {
                if (args.Data != null)
                {
                    error.AppendLine(args.Data);
                }
            };

            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            return process;
        }

        private static void PollRunningProcess()
        {
            var process = _runningProcess;
            if (process == null || !process.HasExited)
            {
                return;
            }

            var exitCode = process.ExitCode;
            var onExit = _runningOnExit;
            CleanupTracking();
            process.Dispose();
            onExit?.Invoke(exitCode);
        }

        private static void StopRunningProcess()
        {
            var process = _runningProcess;
            CleanupTracking();
            if (process == null)
            {
                return;
            }

            try
            {
                if (!process.HasExited)
                {
                    process.Kill();
                }
            }
            catch (Exception)
            {
                // Domain reload and process teardown must not throw into Unity.
            }
            finally
            {
                process.Dispose();
            }
        }

        private static void CleanupTracking()
        {
            if (_runningPoll != null)
            {
                EditorApplication.update -= _runningPoll;
            }

            _runningPoll = null;
            _runningProcess = null;
            _runningOnExit = null;
        }

        private static class PowerShellExecutable
        {
            internal static string Resolve()
            {
                return "pwsh";
            }

            internal static string Fallback(string failed)
            {
                if (string.Equals(failed, "pwsh", StringComparison.OrdinalIgnoreCase) &&
                    Application.platform == RuntimePlatform.WindowsEditor)
                {
                    return "powershell";
                }

                return null;
            }
        }
    }
}

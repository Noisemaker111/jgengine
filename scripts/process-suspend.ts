/**
 * Freeze and thaw whole processes: every thread stops, workers included, until resumed. A debugger
 * pause stops only a page's main thread, and a paused game page kept three renderer processes at
 * 100-130% of a core each (perf ab, 2026-11-09). Windows uses NtSuspendProcess/NtResumeProcess, which
 * nest like a count; elsewhere SIGSTOP/SIGCONT.
 */

type Native = {
  open: (pid: number) => unknown;
  suspend: (handle: unknown) => number;
  resume: (handle: unknown) => number;
  close: (handle: unknown) => void;
};

const PROCESS_SUSPEND_RESUME = 0x0800;
let native: Native | null | undefined;

async function windowsNative(): Promise<Native | null> {
  if (native !== undefined) return native;
  if (process.platform !== "win32") return (native = null);
  const { dlopen, FFIType } = await import("bun:ffi");
  const kernel32 = dlopen("kernel32.dll", {
    OpenProcess: { args: [FFIType.u32, FFIType.bool, FFIType.u32], returns: FFIType.ptr },
    CloseHandle: { args: [FFIType.ptr], returns: FFIType.bool },
  });
  const ntdll = dlopen("ntdll.dll", {
    NtSuspendProcess: { args: [FFIType.ptr], returns: FFIType.i32 },
    NtResumeProcess: { args: [FFIType.ptr], returns: FFIType.i32 },
  });
  native = {
    open: (pid) => kernel32.symbols.OpenProcess(PROCESS_SUSPEND_RESUME, false, pid),
    suspend: (handle) => ntdll.symbols.NtSuspendProcess(handle as never),
    resume: (handle) => ntdll.symbols.NtResumeProcess(handle as never),
    close: (handle) => void kernel32.symbols.CloseHandle(handle as never),
  };
  return native;
}

async function apply(pid: number, freeze: boolean): Promise<void> {
  const win = await windowsNative();
  if (win === null) {
    process.kill(pid, freeze ? "SIGSTOP" : "SIGCONT");
    return;
  }
  const handle = win.open(pid);
  if (handle === null || handle === 0) throw new Error(`could not open pid ${pid} to ${freeze ? "suspend" : "resume"} it`);
  try {
    const status = freeze ? win.suspend(handle) : win.resume(handle);
    if (status !== 0) throw new Error(`${freeze ? "NtSuspendProcess" : "NtResumeProcess"} on pid ${pid} returned 0x${(status >>> 0).toString(16)}`);
  } finally {
    win.close(handle);
  }
}

/** Stop every thread of each process; pair every call with {@link resumeProcesses}. */
export async function suspendProcesses(pids: readonly number[]): Promise<void> {
  for (const pid of pids) await apply(pid, true);
}

/** Let processes run again. A pid that already exited is skipped. */
export async function resumeProcesses(pids: readonly number[]): Promise<void> {
  for (const pid of pids) {
    try {
      await apply(pid, false);
    } catch (error) {
      if (!/could not open pid|ESRCH/.test(error instanceof Error ? error.message : String(error))) throw error;
    }
  }
}

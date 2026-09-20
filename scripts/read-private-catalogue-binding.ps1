# Internal helper: stdout is a private, bounded pipe consumed by Node, never a log.
# Inspect permissions, resolve the final path and read using the SAME file handle.
$ErrorActionPreference = 'Stop'
$stream = $null
try {
    Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class CatalogueFileHandle {
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern uint GetFinalPathNameByHandle(SafeFileHandle handle, StringBuilder path, uint capacity, uint flags);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern uint GetFileType(SafeFileHandle handle);
}
'@
    # Deny writers and deletion while validating/reading. No path-based stat/ACL
    # check precedes this open, and the path is never reopened to obtain bytes.
    $stream = [System.IO.FileStream]::new($env:REPSYNC_BINDING_READ_PATH,
        [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
    if ([CatalogueFileHandle]::GetFileType($stream.SafeFileHandle) -ne 1 -or $stream.Length -gt 65536) { exit 2 }
    $allowed = @([System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value, 'S-1-5-18', 'S-1-5-32-544')
    $rules = $stream.GetAccessControl().GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])
    if (@($rules | Where-Object { $_.AccessControlType -eq 'Allow' -and $_.IdentityReference.Value -notin $allowed }).Count -gt 0) { exit 2 }
    $pathBuffer = [System.Text.StringBuilder]::new(32768)
    $size = [CatalogueFileHandle]::GetFinalPathNameByHandle($stream.SafeFileHandle, $pathBuffer, 32768, 0)
    if ($size -eq 0 -or $size -ge 32768) { exit 2 }
    $actual = $pathBuffer.ToString()
    if ($actual.StartsWith('\\?\UNC\')) { $actual = '\\' + $actual.Substring(8) }
    elseif ($actual.StartsWith('\\?\')) { $actual = $actual.Substring(4) }
    else { exit 2 }
    $bytes = New-Object byte[] 65537
    $length = 0
    do {
        $count = $stream.Read($bytes, $length, $bytes.Length - $length)
        $length += $count
    } while ($count -gt 0 -and $length -lt $bytes.Length)
    if ($length -gt 65536) { exit 2 }
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    [Console]::Write((@{ path = $actual; bytes = [Convert]::ToBase64String($bytes, 0, $length) } | ConvertTo-Json -Compress))
} catch [System.UnauthorizedAccessException] {
    exit 2
} catch {
    exit 1
} finally {
    if ($null -ne $stream) { $stream.Dispose() }
}

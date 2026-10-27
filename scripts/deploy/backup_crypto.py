"""Windows CurrentUser DPAPI protection for off-host recovery copies.

No plaintext backup is written to disk by protect(). Recovery requires this
Windows user's DPAPI profile; do not describe this as a portable shared key.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys


PROTECT = r'''
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$memory=New-Object System.IO.MemoryStream
[Console]::OpenStandardInput().CopyTo($memory)
$plain=$memory.ToArray()
$sha=[System.Security.Cryptography.SHA256]::Create()
$digest=[BitConverter]::ToString($sha.ComputeHash($plain)).Replace('-','').ToLowerInvariant()
if($digest -ne $env:CARRYKIT_BACKUP_SHA256){throw 'Backup digest mismatch'}
$encrypted=[System.Security.Cryptography.ProtectedData]::Protect($plain,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)
$restored=[System.Security.Cryptography.ProtectedData]::Unprotect($encrypted,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)
if([BitConverter]::ToString($sha.ComputeHash($restored)).Replace('-','').ToLowerInvariant() -ne $digest){throw 'Recovery check failed'}
$file=[System.IO.File]::Open($env:CARRYKIT_BACKUP_OUTPUT,[System.IO.FileMode]::CreateNew,[System.IO.FileAccess]::Write,[System.IO.FileShare]::None)
try{$file.Write($encrypted,0,$encrypted.Length);$file.Flush($true)}finally{$file.Dispose()}
[Console]::Write('DPAPI round-trip verified')
'''

DECRYPT = r'''
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$encrypted=[IO.File]::ReadAllBytes($env:CARRYKIT_BACKUP_INPUT)
$plain=[System.Security.Cryptography.ProtectedData]::Unprotect($encrypted,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)
$file=[System.IO.File]::Open($env:CARRYKIT_BACKUP_OUTPUT,[System.IO.FileMode]::CreateNew,[System.IO.FileAccess]::Write,[System.IO.FileShare]::None)
try{$file.Write($plain,0,$plain.Length);$file.Flush($true)}finally{$file.Dispose()}
[Console]::Write('Recovery copy written; original encrypted backup retained')
'''


def protect(payload, destination, expected_sha256):
    if os.name != 'nt':
        raise ValueError('This off-host backup protector requires Windows CurrentUser DPAPI')
    destination = Path(destination).resolve()
    if destination.exists() or hashlib.sha256(payload).hexdigest() != expected_sha256:
        raise ValueError('Backup destination exists or plaintext hash mismatches')
    env = dict(os.environ, CARRYKIT_BACKUP_OUTPUT=str(destination), CARRYKIT_BACKUP_SHA256=expected_sha256)
    result = subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', PROTECT],
                            input=payload, capture_output=True, env=env)
    if result.returncode:
        raise RuntimeError('DPAPI backup encryption/recovery check failed; no credentials echoed')
    return {'method': 'Windows-DPAPI-CurrentUser', 'plaintextSha256': expected_sha256,
            'ciphertextSha256': hashlib.sha256(destination.read_bytes()).hexdigest(),
            'roundTripVerified': True, 'bytes': len(payload)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('encrypted_file'); parser.add_argument('--output', required=True)
    args = parser.parse_args()
    source, target = Path(args.encrypted_file).resolve(), Path(args.output).resolve()
    if os.name != 'nt' or not source.is_file() or target.exists() or not target.parent.is_dir():
        raise ValueError('Existing encrypted input and a new private output file are required')
    env = dict(os.environ, CARRYKIT_BACKUP_INPUT=str(source), CARRYKIT_BACKUP_OUTPUT=str(target))
    result = subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', DECRYPT],
                            capture_output=True, env=env)
    if result.returncode: raise RuntimeError('DPAPI recovery failed; preserve the encrypted original')
    print(result.stdout.decode(errors='replace'))


if __name__ == '__main__':
    main()

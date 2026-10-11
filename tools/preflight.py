"""Diagnóstico read-only do host; não afirma que uma compilação foi executada."""
from __future__ import annotations
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent


def command_version(name: str, flag: str = '--version') -> dict:
    exe = shutil.which(name)
    if not exe:
        return {'available': False, 'reason': f'{name} não encontrado no PATH'}
    try:
        run = subprocess.run([exe, flag], text=True, capture_output=True, timeout=8)
        return {'available': run.returncode == 0, 'path': exe, 'version': (run.stdout or run.stderr).strip().splitlines()[0], 'exit_code': run.returncode}
    except Exception as exc:
        return {'available': False, 'path': exe, 'reason': type(exc).__name__ + ': ' + str(exc)}


def pkg_config(package: str) -> dict:
    if shutil.which('pkg-config') is None:
        return {'available': False, 'reason': 'pkg-config não encontrado'}
    result = subprocess.run(['pkg-config', '--modversion', package], capture_output=True, text=True)
    return {'available': result.returncode == 0, 'version': result.stdout.strip() or None}


def main() -> None:
    manifest = json.loads((ROOT / 'package.json').read_text())
    platform = sys.platform
    data = {
        'platform': platform,
        'node': command_version('node', '--version'),
        'npm': command_version('npm', '--version'),
        'rustc': command_version('rustc', '--version'),
        'cargo': command_version('cargo', '--version'),
        'rustup': command_version('rustup', '--version'),
        'package_manifest_valid': bool(manifest.get('scripts', {}).get('build') and manifest.get('scripts', {}).get('test')),
        'npm_dependencies_installed': (ROOT / 'node_modules' / 'vite' / 'package.json').is_file(),
        'npm_lockfile_present': (ROOT / 'package-lock.json').exists(),
        'cargo_lockfile_present': (ROOT / 'src-tauri' / 'Cargo.lock').exists(),
    }
    if platform.startswith('linux'):
        data['native_linux_dependencies'] = {p: pkg_config(p) for p in ['webkit2gtk-4.1','gtk+-3.0','ayatana-appindicator3-0.1','librsvg-2.0','openssl']}
    print(json.dumps(data, ensure_ascii=False, indent=2))
    ready = (all(data[t]['available'] for t in ['node','npm','rustc','cargo']) and
             data['npm_dependencies_installed'] and
             (not platform.startswith('linux') or all(v['available'] for v in data['native_linux_dependencies'].values())))
    print('PRONTO_PARA_COMPILAR' if ready else 'BLOQUEADO: há dependências ausentes')
    sys.exit(0 if ready else 2)

if __name__ == '__main__':
    main()

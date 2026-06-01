#!/usr/bin/env python3

from __future__ import annotations

import argparse
import base64
import datetime as dt
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path
from urllib.parse import urlparse

try:
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
except ImportError:  # pragma: no cover - exercised only on release operator machines.
    serialization = None
    Ed25519PrivateKey = None


GITHUB_RELEASE_ASSET_LIMIT_BYTES = 2 * 1024 * 1024 * 1024
PRIVATE_KEY_ENV = 'ENTROPIA_RUNTIME_BOOTSTRAP_PRIVATE_KEY_BASE64'
DEFAULT_PUBLIC_KEY_ID = 'entropia-runtime-bootstrap-v1'


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def read_manifest(runtime_pack_dir: Path) -> dict:
    manifest_path = runtime_pack_dir / 'manifest.json'
    if not manifest_path.is_file():
        raise ValueError(f'runtime-pack manifest not found: {manifest_path}')
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    errors = []
    if manifest.get('payload_profile') != 'release':
        errors.append('payload_profile must be release')
    if manifest.get('release_injection_required') is not False:
        errors.append('release_injection_required must be false')
    if manifest.get('external_artifacts_required') != []:
        errors.append('external_artifacts_required must be []')
    for key in ('app_version', 'platform', 'pack_version'):
        if not manifest.get(key):
            errors.append(f'missing {key}')
    if errors:
        raise ValueError('runtime-pack is not a releasable payload: ' + '; '.join(errors))
    return manifest


def archive_name_from_url(archive_url: str) -> str:
    name = Path(urlparse(archive_url).path).name
    if not name:
        raise ValueError('archive URL must end with a filename')
    return name


def zip_runtime_pack(runtime_pack_dir: Path, archive_path: Path, compression: str) -> None:
    compression_method = {
        'stored': zipfile.ZIP_STORED,
        'deflated': zipfile.ZIP_DEFLATED,
    }[compression]
    compression_args = {'compresslevel': 9} if compression == 'deflated' else {}

    if archive_path.exists():
        archive_path.unlink()
    archive_path.parent.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(
        archive_path,
        mode='w',
        compression=compression_method,
        allowZip64=True,
        **compression_args,
    ) as archive:
        for path in sorted(candidate for candidate in runtime_pack_dir.rglob('*') if candidate.is_file()):
            archive.write(path, path.relative_to(runtime_pack_dir).as_posix())


def load_private_key_base64(args: argparse.Namespace) -> str:
    if args.private_key_base64:
        return args.private_key_base64.strip()
    if args.private_key_file:
        return Path(args.private_key_file).read_text(encoding='utf-8').strip()
    value = os.environ.get(PRIVATE_KEY_ENV, '').strip()
    if value:
        return value
    raise ValueError(
        f'provide --private-key-base64, --private-key-file, --private-key-pem, '
        f'--generate-private-key-pem, or {PRIVATE_KEY_ENV}; the base64 value must be a '
        'base64-encoded 32-byte Ed25519 private seed'
    )


def sign_payload_with_seed(private_key_base64: str, payload: str) -> tuple[str, str]:
    if Ed25519PrivateKey is None or serialization is None:
        raise ValueError(
            'missing Python dependency for base64 private seed signing: pip install cryptography; '
            'or use --private-key-pem/--generate-private-key-pem with OpenSSL'
        )

    private_key_bytes = base64.b64decode(private_key_base64, validate=True)
    if len(private_key_bytes) != 32:
        raise ValueError('Ed25519 private key seed must decode to exactly 32 bytes')

    private_key = Ed25519PrivateKey.from_private_bytes(private_key_bytes)
    public_key = private_key.public_key()
    signature = private_key.sign(payload.encode('utf-8'))
    public_key_bytes = public_key.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    return base64.b64encode(signature).decode('ascii'), base64.b64encode(public_key_bytes).decode('ascii')


def run_openssl(args: list[str]) -> None:
    completed = subprocess.run(
        ['openssl', *args],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        raise ValueError(
            'OpenSSL command failed: openssl '
            + ' '.join(args)
            + ('\n' + completed.stderr.strip() if completed.stderr.strip() else '')
        )


def ensure_openssl_private_key(args: argparse.Namespace) -> Path | None:
    if args.private_key_pem:
        private_key_pem = Path(args.private_key_pem)
        if not private_key_pem.is_file():
            raise ValueError(f'private key PEM not found: {private_key_pem}')
        return private_key_pem

    if args.generate_private_key_pem:
        private_key_pem = Path(args.generate_private_key_pem)
        if not private_key_pem.exists():
            private_key_pem.parent.mkdir(parents=True, exist_ok=True)
            run_openssl(['genpkey', '-algorithm', 'ED25519', '-out', str(private_key_pem)])
        return private_key_pem

    return None


def sign_payload_with_openssl(private_key_pem: Path, payload: str) -> tuple[str, str]:
    with tempfile.TemporaryDirectory(prefix='entropia-runtime-sign-') as tmp_dir:
        tmp_root = Path(tmp_dir)
        payload_path = tmp_root / 'payload.txt'
        signature_path = tmp_root / 'signature.bin'
        public_der_path = tmp_root / 'public.der'
        # Keep this byte-for-byte aligned with Rust's BootstrapReleaseManifest::signature_payload().
        # Text-mode writes on Windows translate \n to \r\n, which produces signatures that
        # OpenSSL can verify locally but the Rust verifier correctly rejects.
        payload_path.write_bytes(payload.encode('utf-8'))

        run_openssl(
            [
                'pkeyutl',
                '-sign',
                '-rawin',
                '-inkey',
                str(private_key_pem),
                '-in',
                str(payload_path),
                '-out',
                str(signature_path),
            ]
        )
        run_openssl(
            [
                'pkey',
                '-in',
                str(private_key_pem),
                '-pubout',
                '-outform',
                'DER',
                '-out',
                str(public_der_path),
            ]
        )

        signature = signature_path.read_bytes()
        public_der = public_der_path.read_bytes()
        if len(signature) != 64:
            raise ValueError(f'OpenSSL Ed25519 signature must be 64 bytes, got {len(signature)}')
        if len(public_der) < 32:
            raise ValueError(f'OpenSSL public key DER is too short: {len(public_der)} bytes')

        return (
            base64.b64encode(signature).decode('ascii'),
            base64.b64encode(public_der[-32:]).decode('ascii'),
        )


def sign_payload(args: argparse.Namespace, payload: str) -> tuple[str, str]:
    private_key_pem = ensure_openssl_private_key(args)
    if private_key_pem is not None:
        return sign_payload_with_openssl(private_key_pem, payload)

    return sign_payload_with_seed(load_private_key_base64(args), payload)


def signature_payload(release: dict) -> str:
    return '\n'.join(
        [
            release['app_version'],
            release['platform'],
            release['pack_version'],
            release['archive_url'],
            release['archive_sha256'],
            str(release['archive_size']),
        ]
    )


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def package_bootstrap(args: argparse.Namespace) -> dict:
    runtime_pack_dir = Path(args.runtime_pack_dir).resolve()
    output_dir = Path(args.output_dir).resolve()
    archive_url = args.archive_url.strip()
    if not archive_url.startswith('https://'):
        raise ValueError('archive URL must use HTTPS because it is part of the trusted signature payload')
    if not args.manifest_url.strip().startswith('https://'):
        raise ValueError('manifest URL must use HTTPS because the app treats it as a trusted bootstrap source')

    manifest = read_manifest(runtime_pack_dir)
    archive_name = args.archive_name or archive_name_from_url(archive_url)
    archive_path = output_dir / archive_name
    zip_runtime_pack(runtime_pack_dir, archive_path, args.compression)

    archive_size = archive_path.stat().st_size
    release = {
        'app_version': manifest['app_version'],
        'platform': manifest['platform'],
        'pack_version': manifest['pack_version'],
        'archive_url': archive_url,
        'archive_sha256': sha256_file(archive_path),
        'archive_size': archive_size,
        'signature': '',
    }
    signature, public_key_base64 = sign_payload(args, signature_payload(release))
    release['signature'] = signature

    index = {
        'channel': args.channel,
        'generated_at': dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z'),
        'releases': [release],
    }
    index_path = output_dir / args.index_name
    write_json(index_path, index)

    summary = {
        'archive_path': str(archive_path),
        'archive_size': archive_size,
        'archive_sha256': release['archive_sha256'],
        'index_path': str(index_path),
        'manifest_url_to_embed': args.manifest_url,
        'public_key_id_to_embed': args.public_key_id,
        'public_key_base64_to_embed': public_key_base64,
        'github_release_asset_limit_bytes': GITHUB_RELEASE_ASSET_LIMIT_BYTES,
        'github_release_asset_too_large': archive_size >= GITHUB_RELEASE_ASSET_LIMIT_BYTES,
    }
    write_json(output_dir / 'runtime-bootstrap-summary.json', summary)

    if args.fail_if_github_asset_too_large and summary['github_release_asset_too_large']:
        raise ValueError(
            f'archive is {archive_size} bytes, which exceeds GitHub Releases single-asset limit '
            f'of {GITHUB_RELEASE_ASSET_LIMIT_BYTES} bytes'
        )

    return summary


def main() -> int:
    parser = argparse.ArgumentParser(
        description='Package and sign an EntropIA runtime-pack for trusted remote bootstrap.'
    )
    parser.add_argument('--runtime-pack-dir', required=True)
    parser.add_argument('--output-dir', required=True)
    parser.add_argument('--archive-url', required=True, help='Final HTTPS URL where the archive will be published.')
    parser.add_argument('--manifest-url', required=True, help='Final HTTPS URL where the JSON index will be published.')
    parser.add_argument('--private-key-base64')
    parser.add_argument('--private-key-file', help='File containing a base64-encoded 32-byte Ed25519 private seed.')
    parser.add_argument('--private-key-pem', help='Existing Ed25519 private key PEM, signed through OpenSSL.')
    parser.add_argument(
        '--generate-private-key-pem',
        help='Create an Ed25519 private key PEM at this path if it does not exist, then sign through OpenSSL.',
    )
    parser.add_argument('--public-key-id', default=DEFAULT_PUBLIC_KEY_ID)
    parser.add_argument('--channel', default='stable')
    parser.add_argument('--index-name', default='runtime-bootstrap.json')
    parser.add_argument('--archive-name')
    parser.add_argument('--compression', choices=('stored', 'deflated'), default='deflated')
    parser.add_argument('--fail-if-github-asset-too-large', action='store_true')
    args = parser.parse_args()

    try:
        summary = package_bootstrap(args)
    except (OSError, ValueError, zipfile.BadZipFile) as exc:
        print(f'error: {exc}', file=sys.stderr)
        return 1

    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

#!/usr/bin/env python3
"""Build and ed25519-sign the bootstrap manifest index for the lean runtime download.

This produces the JSON that ENTROPIA_RUNTIME_BOOTSTRAP_MANIFEST_URL points to. The
format MUST match the Rust verifier in src/runtime/manifest.rs exactly:

  signature_payload = "{app_version}\n{platform}\n{pack_version}\n{archive_url}\n{archive_sha256}\n{archive_size}"
  signature         = base64(ed25519_sign(private_key, signature_payload.utf8))   # 64 raw bytes
  public key        = base64(raw 32-byte ed25519 public key)

Index (BootstrapManifestIndex):
  {"channel": str, "generated_at": "YYYY-MM-DDTHH:MM:SSZ", "releases": [BootstrapReleaseManifest, ...]}
BootstrapReleaseManifest:
  {"app_version","platform","pack_version","archive_url","archive_sha256","archive_size","signature"}

The app selects the release whose (app_version, platform) match, then verifies the
signature with the baked public key before trusting archive_url / archive_sha256.

Modes:
  --generate-key   Print a fresh ed25519 keypair (private_b64 + public_b64) and exit.
                   Run this LOCALLY (never in CI logs); store private_b64 as the
                   GitHub secret ENTROPIA_RUNTIME_SIGNING_KEY and bake public_b64.
  (sign mode)      Given the archive metadata + signing key, write a signed index.
                   Upserts into --merge-into if given (replace matching app+platform).
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
except ImportError:  # pragma: no cover
    sys.exit("missing dependency: pip install cryptography")


def b64(data: bytes) -> str:
    return base64.standard_b64encode(data).decode("ascii")


def signature_payload(
    app_version: str,
    platform: str,
    pack_version: str,
    archive_url: str,
    archive_sha256: str,
    archive_size: int,
    additional_part_urls: list[str],
) -> str:
    # Exactly mirrors BootstrapReleaseManifest::signature_payload in manifest.rs:
    # the six base fields, then each extra part URL appended on its own line.
    payload = f"{app_version}\n{platform}\n{pack_version}\n{archive_url}\n{archive_sha256}\n{archive_size}"
    for url in additional_part_urls:
        payload += "\n" + url
    return payload


def sha256_size(path: Path) -> tuple[str, int]:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
            size += len(chunk)
    return digest.hexdigest(), size


def load_private_key(key_b64: str) -> Ed25519PrivateKey:
    try:
        raw = base64.standard_b64decode(key_b64)
    except Exception as error:  # noqa: BLE001
        sys.exit(f"signing key is not valid base64: {error}")
    if len(raw) != 32:
        sys.exit(f"signing key must decode to 32 raw bytes, got {len(raw)}")
    return Ed25519PrivateKey.from_private_bytes(raw)


def public_b64(private_key: Ed25519PrivateKey) -> str:
    raw = private_key.public_key().public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw
    )
    return b64(raw)


def generate_key() -> None:
    private_key = Ed25519PrivateKey.generate()
    raw = private_key.private_bytes(
        serialization.Encoding.Raw,
        serialization.PrivateFormat.Raw,
        serialization.NoEncryption(),
    )
    print("private_key_base64=" + b64(raw))
    print("public_key_base64=" + public_b64(private_key))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--generate-key", action="store_true", help="print a fresh keypair and exit")
    parser.add_argument("--app-version")
    parser.add_argument("--platform")
    parser.add_argument("--pack-version")
    parser.add_argument("--archive-url", help="public download URL of the runtime archive (part 1)")
    parser.add_argument(
        "--additional-part-url",
        action="append",
        default=[],
        dest="additional_part_urls",
        help="extra archive part URL (parts 2..N), repeatable, in order",
    )
    parser.add_argument("--archive-file", help="local archive path to compute sha256+size")
    parser.add_argument("--archive-sha256", help="precomputed archive sha256 (hex)")
    parser.add_argument("--archive-size", type=int, help="precomputed archive size in bytes")
    parser.add_argument("--channel", default="stable")
    parser.add_argument("--key-id", default="entropia-runtime-2026")
    parser.add_argument(
        "--private-key-b64",
        default=os.environ.get("ENTROPIA_RUNTIME_SIGNING_KEY"),
        help="ed25519 private key (32 raw bytes, base64); defaults to $ENTROPIA_RUNTIME_SIGNING_KEY",
    )
    parser.add_argument("--merge-into", help="existing index json to upsert this release into")
    parser.add_argument("--output", help="path to write the signed index json")
    args = parser.parse_args()

    if args.generate_key:
        generate_key()
        return

    required = ["app_version", "platform", "pack_version", "archive_url", "output"]
    missing = [name for name in required if not getattr(args, name)]
    if missing:
        sys.exit("missing required args: " + ", ".join("--" + m.replace("_", "-") for m in missing))
    if not args.private_key_b64:
        sys.exit("no signing key: pass --private-key-b64 or set ENTROPIA_RUNTIME_SIGNING_KEY")

    if args.archive_file:
        archive_sha256, archive_size = sha256_size(Path(args.archive_file))
    elif args.archive_sha256 and args.archive_size:
        archive_sha256, archive_size = args.archive_sha256, args.archive_size
    else:
        sys.exit("need --archive-file OR both --archive-sha256 and --archive-size")

    private_key = load_private_key(args.private_key_b64)
    payload = signature_payload(
        args.app_version,
        args.platform,
        args.pack_version,
        args.archive_url,
        archive_sha256,
        archive_size,
        args.additional_part_urls,
    )
    signature = private_key.sign(payload.encode("utf-8"))

    release = {
        "app_version": args.app_version,
        "platform": args.platform,
        "pack_version": args.pack_version,
        "archive_url": args.archive_url,
        "additional_part_urls": args.additional_part_urls,
        "archive_sha256": archive_sha256,
        "archive_size": archive_size,
        "signature": b64(signature),
    }

    releases = []
    channel = args.channel
    if args.merge_into and Path(args.merge_into).exists():
        existing = json.loads(Path(args.merge_into).read_text(encoding="utf-8"))
        channel = existing.get("channel", channel)
        releases = [
            entry
            for entry in existing.get("releases", [])
            if not (
                entry.get("app_version") == args.app_version
                and entry.get("platform") == args.platform
            )
        ]
    releases.append(release)

    index = {
        "channel": channel,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "releases": releases,
    }
    Path(args.output).write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8")

    # Self-verify: the signature we just wrote must validate against our own public key.
    private_key.public_key().verify(signature, payload.encode("utf-8"))

    print("public_key_base64=" + public_b64(private_key))
    print("key_id=" + args.key_id)
    print("archive_sha256=" + archive_sha256)
    print("archive_size=" + str(archive_size))
    print("wrote=" + args.output)


if __name__ == "__main__":
    main()

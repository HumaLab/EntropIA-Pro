# EntropIA Pro Code Signing Policy

EntropIA Pro signs release installers only when the release artifact is traceable, reproducible enough to review, and made from redistributable open-source components. Until that bar is met and a signing provider is approved, Windows installers may remain unsigned.

## Quick path for a signed release

1. Build the release runtime payload from audited source artifacts.
2. Run the Release workflow with `runtime_payload_artifact=runtime-payloads` and the producing `runtime_payload_run_id`.
3. Verify the release runtime-pack smoke checks pass before installer builds start.
4. Review the draft release assets, hashes, and provenance.
5. Sign only the reviewed installer assets for the exact release tag.

## Current signing status

| Area | Status |
| ---- | ------ |
| Project license | MIT, see `LICENSE`. |
| Public releases | GitHub Releases. |
| Windows signing | Pending. Installers may be unsigned. |
| Signing provider | Not integrated yet. SignPath Foundation is being evaluated. |
| Release runtime gate | Required by `.github/workflows/release.yml`; fixture runtime packs must not reach installer builds. |

## Signing rules

- Do not sign local ad-hoc builds.
- Do not sign artifacts produced from fixture runtime packs.
- Do not sign installers if `payload_profile != release`, `release_injection_required != false`, or `external_artifacts_required` is non-empty.
- Do not store certificate material, signing keys, or signing tokens in the repository.
- Prefer manual approval for the signing step after release artifacts and hashes are visible.

## Release artifact provenance

Signed artifacts must be traceable to:

- a Git tag;
- the GitHub Actions Release workflow run;
- the Runtime Payload workflow run used as input;
- the runtime-pack manifest generated during release assembly;
- the final installer hash published in the GitHub Release notes.

## Incident response

If a signed artifact is suspected to be compromised:

1. Mark the GitHub Release as withdrawn or prerelease with a warning.
2. Remove affected installer assets if needed.
3. Publish the affected hashes and versions.
4. Rotate signing credentials through the signing provider.
5. Ship a corrected release from a clean workflow run.

## Open items before signing integration

- Complete third-party notices and runtime payload license review.
- Confirm every bundled model, wheel, native library, and runtime cache is redistributable.
- Decide the final signing provider and approval policy.
- Add signing as a post-build release step only after the runtime payload gate passes.

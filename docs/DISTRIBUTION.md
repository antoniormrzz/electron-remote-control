# Distribution

Electremote release artifacts are built from version tags using native GitHub-hosted runners. They are currently unsigned.

## Local Builds

Install the repository's required package manager and dependencies:

```sh
corepack enable pnpm
pnpm install
```

Create an unpacked application for the current operating system and architecture:

```sh
pnpm package
```

Create the configured installer or package for the current operating system and architecture:

```sh
pnpm make
```

Generated files are written under `apps/desktop/out/`.

## Release Tags

The tag and both package versions must match exactly. For example, version `0.1.0` must use tag `v0.1.0`.

```sh
git tag v0.1.0
git push origin v0.1.0
```

A matching tag verifies package versions, builds the installers below, and creates a draft GitHub Release after all builds succeed.

## Test the Build Matrix

To test packaging without creating a release, open the repository's **Actions > Draft Release** workflow, choose **Run workflow**, select the branch to build, and start the run. This builds and uploads the platform artifacts without checking a release tag or creating a GitHub Release. The uploaded artifacts are retained for 14 days.

The workflow must first be present on the repository's default branch for the **Run workflow** button to appear. Manually dispatched runs can select another branch from the workflow UI.

The release artifacts are:

| Platform | Architecture | Artifact                                             |
| -------- | ------------ | ---------------------------------------------------- |
| macOS    | ARM64        | DMG                                                  |
| macOS    | x64          | DMG                                                  |
| Windows  | x64          | Squirrel Setup.exe, NuGet package, RELEASES metadata |
| Linux    | ARM64        | DEB and RPM                                          |
| Linux    | x64          | DEB and RPM                                          |

When every build succeeds, GitHub Actions creates a draft release. Review and smoke-test the files before publishing it manually.

## Unsigned Build Warnings

### macOS

These builds are not signed or notarized. macOS Gatekeeper may report that Apple cannot check the application for malicious software.

Only continue when the file came from this repository's GitHub Release and its checksum matches. In Finder, Control-click Electremote, choose **Open**, then confirm **Open**. Depending on the macOS version, you can also approve the blocked application under **System Settings > Privacy & Security**.

Electremote also requires Accessibility permission to send media-control keystrokes. macOS prompts for this separately when the app starts.

Frictionless distribution would require a paid Apple Developer Program membership, Developer ID signing, hardened runtime configuration, and notarization. Those are intentionally not configured.

### Windows

These builds have no Authenticode signature. Microsoft Defender SmartScreen may show an **Unknown publisher** warning.

Only continue when the file came from this repository's GitHub Release and its checksum matches. Choose **More info**, verify the application name, then choose **Run anyway**.

Removing this warning requires a paid code-signing certificate or an eligible cloud signing service. Neither is configured.

### Linux

The DEB and RPM files are not distributed through a signed package repository. Install them only after verifying their source and checksum.

## Checksums

Each draft release includes a `SHA256SUMS` file containing the SHA-256 checksums of its installer and package files. Download it alongside the file you intend to install, then verify the file before running it:

```sh
# macOS
shasum -a 256 -c SHA256SUMS
```

```powershell
# Windows PowerShell
Get-FileHash path\to\file -Algorithm SHA256
```

On Windows, compare the `Hash` value with the entry for that file in `SHA256SUMS`. On Linux, use `sha256sum -c SHA256SUMS`.

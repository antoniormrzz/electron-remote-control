# Distribution

Electremote release artifacts are built from version tags using native GitHub-hosted runners. They are not signed with a distribution certificate.

## Local Builds

Use the Node.js version pinned in [`.nvmrc`](../.nvmrc). With nvm, run `nvm install` and `nvm use` from the repository root.

Install the repository's required package manager and dependencies:

```sh
corepack enable pnpm
pnpm install
```

If `pnpm make` exits before Forge prints its progress after upgrading from Forge 7, remove the generated `node_modules` directories at the repo root, in `apps/desktop`, and in `apps/remote`, then run `pnpm install --frozen-lockfile`. An in-place upgrade can leave old nested dependencies behind; keep `pnpm-lock.yaml`.

Run `pnpm audit` after changing the lockfile. The workspace pins patched transitive dependencies where the packaging tools lag. The `appdmg` and `electron-installer-common` patches adapt their older calls to the maintained dependency APIs.

Create an unpacked application for the current operating system and architecture:

```sh
pnpm package
```

Create the distribution package for the current operating system and architecture:

```sh
pnpm make
```

Generated files are written under `apps/desktop/out/`. On macOS, `pnpm make` writes `Electremote-<version>-<architecture>.dmg` directly under `apps/desktop/out/make/`.

## Release Tags

The tag and both package versions must match exactly. For example, version `2.1.0` must use tag `v2.1.0`.

```sh
git tag v2.1.0
git push origin v2.1.0
```

A matching tag verifies package versions, builds the packages below, and creates a draft GitHub Release after all builds succeed.

To opt into publishing after the checks pass and all assets are uploaded, use an annotated tag instead:

```sh
git tag -a v2.1.0 -m 'Electremote v2.1.0' -m 'Publish-Release: true'
git push origin v2.1.0
```

## Test the Build Matrix

To test packaging without creating a release, open the repository's **Actions > Draft Release** workflow, choose **Run workflow**, select the branch to build, and start the run. This builds and uploads the platform artifacts without checking a release tag or creating a GitHub Release. The uploaded artifacts are retained for 14 days.

The workflow must first be present on the repository's default branch for the **Run workflow** button to appear. Manually dispatched runs can select another branch from the workflow UI.

The release artifacts are:

| Platform | Architecture | Artifact                              |
| -------- | ------------ | ------------------------------------- |
| macOS    | ARM64        | `Electremote-<version>-arm64.dmg`     |
| macOS    | x64          | `Electremote-<version>-x64.dmg`       |
| Windows  | x64          | `Electremote-win32-x64-<version>.zip` |
| Linux    | ARM64        | DEB and RPM                           |
| Linux    | x64          | DEB and RPM                           |

Tagged builds launch the Windows app from the extracted ZIP, mount and verify each macOS disk image, and check the Linux package architecture and native resources. Review the draft before publishing manually unless the tag opted into publishing.

## Connecting from a Phone

Connect the phone and desktop to the same local network, then scan the current QR code shown in the desktop app. It pairs one new browser and redirects to the bookmarkable address. If pairing fails in a scanner preview, open the current pairing link directly in Safari or Chrome. The browser needs to accept the pairing cookie.

Electremote saves its port and paired browsers across restarts. If the port is occupied, the desktop reports the conflict instead of choosing another port. Use **Settings** to change it or reset all pairings. Pairings expire after one year or if you clear the browser's site data. A change to the computer's IP address still requires a new bookmark and QR scan.

To start Electremote at desktop login, enable **Start at login** in Settings in a packaged build. If the OS asks for approval, allow the login item in your system settings. On Windows, the startup entry points to the extracted app: if you move it or replace it with a new copy in a different folder, enable the option from that copy.

Use Electremote on a trusted local network. Anyone with an unused pairing link can pair, and the connection uses local HTTP. Don't forward the app's port to the internet.

## Unsigned Build Warnings

### macOS

These builds are ad hoc signed, not Developer ID signed or notarized. macOS Gatekeeper may report that Apple cannot check the application for malicious software.

If macOS reports **No mountable file systems**, the disk image failed to mount; this is not a Gatekeeper warning. Verify the download against `SHA256SUMS` and download it again if the checksum does not match.

Only continue when the file came from this repository's GitHub Release and its checksum matches. In Finder, Control-click Electremote, choose **Open**, then confirm **Open**. Depending on the macOS version, you can also approve the blocked application under **System Settings > Privacy & Security**.

Electremote needs permission to send media-control keystrokes. If the desktop app shows **Allow Electremote to control media**, go to **System Settings > Privacy & Security** and enable Electremote under **Device Control and Data Access** or **Accessibility**, depending on your version of macOS. Grant permission to the copy in Applications, not a copy on a mounted disk image.

After an update, macOS may still show the old permission entry as enabled even though it no longer matches the new app. If that happens, quit Electremote, remove its old entry from the permission list, add the current copy from Applications, and reopen it. Ad hoc signing cannot carry permissions across different builds.

If **Start at login** stops working or still points at an old copy, remove the old Electremote entry under **System Settings > General > Login Items & Extensions > Open at Login**, then open the current copy from Applications and enable **Settings > Start at login** again.

Frictionless distribution would require a paid Apple Developer Program membership, Developer ID signing, hardened runtime configuration, and notarization. Those are intentionally not configured.

### Windows

Download the Windows x64 ZIP, choose **Extract All** in File Explorer, and open `Electremote.exe` from the extracted folder. Keep the other files and the `resources` folder alongside it. There is no setup program or administrator step. To update, quit Electremote and extract the new version to a new folder.

These builds have no Authenticode signature. Microsoft Defender SmartScreen may show an **Unknown publisher** warning.

Only continue when the file came from this repository's GitHub Release and its checksum matches. Choose **More info**, verify the application name, then choose **Run anyway**.

Removing this warning requires a paid code-signing certificate or an eligible cloud signing service. Neither is configured.

### Linux

The DEB and RPM files are not distributed through a signed package repository. Install them only after verifying their source and checksum.

Linux media controls and the touchpad use X11. Some Wayland desktops prompt for permission to accept XWayland input, but that does not guarantee pointer movement in native Wayland apps.

For clipboard sharing on Wayland, focus the Electremote window before requesting a transfer. For example, copy in Firefox, then switch to Electremote before asking the remote to fetch it. For the other direction, focus Electremote for the transfer, then switch to the destination app and paste. The remote-control permission prompt does not grant background clipboard access.

## Checksums

Each release includes a `SHA256SUMS` file containing the SHA-256 checksums of its installer and package files. Download it alongside the file you intend to install, then verify the file before running it:

```sh
# macOS (replace the filename with the one you downloaded)
shasum -a 256 Electremote-2.1.0-arm64.dmg
```

```powershell
# Windows PowerShell
Get-FileHash path\to\file -Algorithm SHA256
```

Compare the resulting hash with the entry for that file in `SHA256SUMS`. On Linux, use `sha256sum path/to/file`.

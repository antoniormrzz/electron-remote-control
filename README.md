# Electremote

An open-source, cross-platform desktop application for controlling media playback from another device on the same local network.

## Download and Connect

Download the package for your computer from [GitHub Releases](https://github.com/antoniormrzz/electron-remote-control/releases/latest):

- **Windows:** Extract the x64 ZIP and open `Electremote.exe` from the extracted folder.
- **macOS:** Open the DMG for Apple Silicon (`arm64`) or Intel (`x64`), drag Electremote into Applications, then eject the disk image. Open Electremote from Applications and grant permission to control the device if prompted.
- **Linux:** Install the DEB or RPM for your distribution and architecture.

Open Electremote on your computer. Connect your phone to the same local network and scan the QR code in the desktop window. The controls open in your phone's browser; no account or mobile app is required. See the [distribution guide](docs/DISTRIBUTION.md) for checksums, unsigned build warnings, and pairing help.

## Keep Electremote Running

- **macOS:** Closing the window keeps the remote active. Click the Dock icon to reopen the window, or choose **Quit** from the Dock menu to stop the remote.
- **Windows:** Closing the window keeps the remote active in the system tray. Find Electremote in the notification area, including under hidden icons, and choose **Show Electremote** or **Quit Electremote**.
- **Linux:** If your desktop shows the Electremote tray icon, select **Keep running when the window closes** from its menu. Closing the window otherwise quits the app. Use the tray menu to reopen or quit.

## Controls

- Play and pause
- Volume up and down
- Rewind
- Fast-forward

Choose **Control mode** in the desktop app. **Keyboard shortcuts** sends Space and arrow keys to the focused app. **System media keys** sends play/pause, system volume, and previous/next track to the operating system. The phone buttons stay the same, but in media-key mode Rewind and Fast-forward skip between tracks rather than seek. The OS decides which player handles those keys. Keyboard shortcuts are the default when Electremote starts.

To use your phone as a mouse, turn on **Phone touchpad** in the desktop app, then choose **Open touchpad** on the phone. Slide to move, tap to click, and use the side strip to scroll. This is off each time Electremote starts. While it's on, any device paired with the current QR link can move and click the mouse, so keep the link private and turn the touchpad off when you're done.

Use **Right click** and **Middle click** for those buttons. Tap **Hold left**, slide on the pad to drag, then tap **Release left**. The hold also releases when you leave the touchpad, disconnect, or turn it off on the desktop.

For typing, turn on **Phone keyboard** separately in the desktop app and choose **Open keyboard** on your phone. Focus the destination on your computer, type with the phone's native keyboard, then tap **Send text**. Use **Enter**, navigation and editing buttons, or **Compose shortcut** for combinations like Command+Space, Alt+F4, Shift+Delete, or Shift+Alt. Copy, Paste and Select all use Command on macOS and Ctrl on Windows and Linux.

Text goes to the focused app without using the desktop clipboard. Send up to 120 characters at once: use printable ASCII on Linux/X11; on macOS and Windows, text is limited to basic Unicode (no line breaks or supplementary characters like most emoji). This access starts off and applies to all currently paired devices while enabled. Keep the link private and turn the keyboard off when you're done.

## Architecture

- **Electron** provides the desktop application and platform integration.
- **React, Vite, and TypeScript** power the desktop and remote interfaces.
- **Express** serves the remote interface over the local network.
- **WebSockets** carry commands and live connection state.
- **RobotJS** sends keyboard and media-control input.
- **Electron Forge** packages the application.
- **pnpm workspaces** manage the monorepo.

The phone interface is a normal web page served directly by the desktop application. It is not a PWA and requires no installation.

## Repository Structure

```text
apps/
	desktop/    Electron main process, preload script, and desktop interface
	remote/     Mobile-friendly remote interface

libs/
	protocol/   Shared command and WebSocket message definitions
```

The previous implementations in `electremote/` and `pwa-remote-control/` are read-only references. They are not part of the pnpm workspace and must not receive new application code.

## Development

### Requirements

- Node.js 24
- Corepack

Enable the pinned pnpm version and install all workspace dependencies:

```sh
corepack enable pnpm
pnpm install
```

Run the Electron desktop application:

```sh
pnpm dev
```

This builds and watches the remote interface, starts Electron, and serves the remote on a random local-network port. Remote interface changes require a browser refresh.

Run the standalone remote interface:

```sh
pnpm dev:remote
```

Validate or package the application:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm package
```

`pnpm package` creates an unpacked application for the current operating system and architecture. See the [distribution guide](docs/DISTRIBUTION.md) for packaged builds.

## Engineering Standards

- Keep the implementation simple and understandable.
- Use clear ownership boundaries between Electron, networking, automation, and UI code.
- Add abstractions only when they remove meaningful complexity or duplication.
- Keep platform-specific behavior isolated.
- Use strict TypeScript.
- Validate incoming WebSocket commands against the supported command list without introducing a schema-validation dependency.
- Keep Node.js and RobotJS access out of renderer processes.
- Use Electron preload APIs with context isolation enabled.
- Add comments only where intent or platform behavior is not self-evident.
- Do not add unused infrastructure, speculative abstractions, or unnecessary dependencies.

## License

MIT

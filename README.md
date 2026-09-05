# Electremote

An open-source, cross-platform desktop application for controlling media playback from another device on the same local network.

This repository is being rebuilt from scratch. This README currently serves as the implementation specification and project checklist. It will be rewritten for users before release.

## Product Goals

- Start the desktop application.
- Scan a QR code with a phone or other device.
- Use the served web interface immediately.
- Require no account, cloud service, mobile application, or manual network setup.
- Support Windows, macOS, and Linux.
- Distribute ready-to-install application packages.

## Controls

Initial controls:

- Play and pause
- Volume up and down
- Rewind
- Fast-forward

Additional controls and features will be defined during development.

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

Validate or package the foundation:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm package
```

`pnpm package` creates an unpacked application for the current operating system and architecture. Installers and signed release artifacts are separate checklist items.

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

## Implementation Checklist

### Foundation

- [x] Initialize the pnpm workspace.
- [x] Create the Electron desktop application.
- [x] Create the desktop React interface.
- [x] Create the remote React interface.
- [x] Create the shared protocol library.
- [x] Configure strict TypeScript, formatting, and linting.

### Desktop Host

- [x] Start and stop the Express server with the Electron lifecycle.
- [x] Select an available local port.
- [x] Detect the appropriate LAN address.
- [x] Serve the production remote build.
- [x] Display the remote URL and QR code.
- [x] Show server and connection status.
- [x] Handle macOS Accessibility permission.
- [x] Keep RobotJS in the Electron main process.

### Communication

- [x] Establish WebSocket connections from remote devices.
- [x] Define the supported command list.
- [x] Reject unknown or malformed messages.
- [x] Track connected devices for the current session.
- [x] Report command failures to the remote interface.
- [x] Reconnect automatically after temporary network interruptions.

### Remote Interface

- [x] Build a responsive, touch-friendly control layout.
- [x] Implement all initial media controls.
- [ ] Show connection and command status.
- [x] Prevent accidental duplicate commands where appropriate.
- [ ] Support current mobile browsers.

### Packaging

- [x] Bundle the remote build with Electron.
- [x] Bundle and unpack the RobotJS native binary correctly.
- [ ] Produce Windows installers.
- [ ] Produce macOS packages.
- [ ] Produce Linux packages.
- [ ] Automate release builds with GitHub Actions.
- [ ] Document signing and notarization requirements.
- [ ] Verify x64 and ARM64 support where available.

### Release Preparation

- [ ] Confirm the final product name and branding.
- [ ] Add application icons.
- [ ] Add contributor documentation.
- [ ] Add a security policy.
- [ ] Document installation and usage.
- [ ] Replace this implementation README with the release README.

## License

MIT

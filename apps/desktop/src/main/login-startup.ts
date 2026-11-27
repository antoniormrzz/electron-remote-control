import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type { App } from 'electron';
import type { LoginStartupStatus } from '../shared/host';

const APP_ID = 'com.antoniormrzz.electremote';

type LoginItemApp = Pick<App, 'isPackaged' | 'getLoginItemSettings' | 'setLoginItemSettings'>;

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function getAutostartPath(configHome = process.env.XDG_CONFIG_HOME): string {
  const configDirectory =
    configHome && path.isAbsolute(configHome) ? configHome : path.join(homedir(), '.config');
  return path.join(configDirectory, 'autostart', `${APP_ID}.desktop`);
}

function escapeDesktopValue(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('\t', '\\t')
    .replace(/ +$/, (spaces) => '\\s'.repeat(spaces.length));
}

function getAutostartCommand(executable: string): string {
  if (!path.isAbsolute(executable) || /[=\r\n\0]/.test(executable)) {
    throw new Error('The Electremote executable path is not supported by Linux desktop autostart.');
  }
  // The desktop entry string and Exec quoting are decoded in separate passes.
  return escapeDesktopValue(`"${executable.replace(/["`$\\]/g, '\\$&').replaceAll('%', '%%')}"`);
}

export async function getLinuxLoginStartup(
  executable: string,
  configHome?: string,
): Promise<LoginStartupStatus> {
  let contents: string;
  try {
    contents = await readFile(getAutostartPath(configHome), 'utf8');
  } catch (error) {
    if (isMissing(error)) {
      return 'disabled';
    }
    throw error;
  }
  const lines = contents.split(/\r?\n/);
  return lines.includes(`Exec=${getAutostartCommand(executable)}`) &&
    !lines.some((line) =>
      /^(Hidden\s*=\s*true|X-GNOME-Autostart-enabled\s*=\s*false)\s*$/.test(line),
    )
    ? 'enabled'
    : 'disabled';
}

export async function setLinuxLoginStartup(
  enabled: boolean,
  executable: string,
  configHome?: string,
): Promise<void> {
  const filePath = getAutostartPath(configHome);
  if (!enabled) {
    try {
      await unlink(filePath);
    } catch (error) {
      if (!isMissing(error)) {
        throw error;
      }
    }
    return;
  }

  const command = getAutostartCommand(executable);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    [
      '[Desktop Entry]',
      'Type=Application',
      'Name=Electremote',
      `Exec=${command}`,
      `TryExec=${escapeDesktopValue(executable)}`,
      'Terminal=false',
      '',
    ].join('\n'),
    { mode: 0o600 },
  );
}

export async function getLoginStartup(app: LoginItemApp): Promise<LoginStartupStatus> {
  if (!app.isPackaged) {
    return 'unavailable';
  }
  if (process.platform === 'linux') {
    return getLinuxLoginStartup(process.execPath);
  }
  if (process.platform === 'darwin') {
    const item = app.getLoginItemSettings();
    return item.status === 'requires-approval'
      ? 'requires-approval'
      : item.openAtLogin
        ? 'enabled'
        : 'disabled';
  }
  if (process.platform === 'win32') {
    const item = app.getLoginItemSettings({ path: process.execPath });
    const entry = item.launchItems.find(
      (candidate) =>
        candidate.name === APP_ID &&
        candidate.scope === 'user' &&
        candidate.path.toLowerCase() === process.execPath.toLowerCase() &&
        candidate.args.length === 0,
    );
    return entry ? (entry.enabled ? 'enabled' : 'requires-approval') : 'disabled';
  }
  return 'unavailable';
}

export async function setLoginStartup(
  app: LoginItemApp,
  enabled: boolean,
): Promise<LoginStartupStatus> {
  if (!app.isPackaged) {
    throw new Error('Start at login is only available in a packaged build.');
  }
  switch (process.platform) {
    case 'linux':
      await setLinuxLoginStartup(enabled, process.execPath);
      break;
    case 'darwin':
      app.setLoginItemSettings({ openAtLogin: enabled });
      break;
    case 'win32':
      app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath, name: APP_ID });
      break;
    default:
      throw new Error('Start at login is not supported on this platform.');
  }

  const status = await getLoginStartup(app);
  if ((enabled && status === 'disabled') || (!enabled && status !== 'disabled')) {
    throw new Error('The operating system did not apply the login setting.');
  }
  return status;
}

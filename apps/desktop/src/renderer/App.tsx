import { useEffect, useState } from 'react';
import {
  Check,
  Clipboard,
  Copy,
  Keyboard,
  Link,
  MonitorUp,
  Mouse,
  RadioTower,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { isControlMode, isHostPort } from '../shared/host';
import type { HostSnapshot } from '../shared/host';

const INITIAL_SNAPSHOT: HostSnapshot = { status: 'starting' };
const BROWSER_SNAPSHOT: HostSnapshot = {
  status: 'error',
  message: 'Host controls are available in the Electremote desktop application.',
};

export function App() {
  const [snapshot, setSnapshot] = useState<HostSnapshot>(() =>
    window.electremote ? INITIAL_SNAPSHOT : BROWSER_SNAPSHOT,
  );
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<'address' | 'pairing' | null>(null);
  const [copyError, setCopyError] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [portDraft, setPortDraft] = useState<string | null>(null);
  const [settingsFeedback, setSettingsFeedback] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const [controlModeError, setControlModeError] = useState(false);
  const [inputError, setInputError] = useState<'touchpad' | 'keyboard' | 'clipboard' | null>(null);

  useEffect(() => {
    const api = window.electremote;
    if (!api) {
      return;
    }

    let active = true;
    const unsubscribe = api.onHostSnapshot((nextSnapshot) => {
      if (active) {
        setSnapshot(nextSnapshot);
      }
    });

    void api.getHostSnapshot().then((nextSnapshot) => {
      if (active) {
        setSnapshot(nextSnapshot);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const statusTitle =
    snapshot.status === 'starting'
      ? 'Starting'
      : snapshot.status === 'error'
        ? 'Error'
        : snapshot.localOnly
          ? 'Local only'
          : 'Online';

  const controlStatus = snapshot.status === 'online' ? snapshot.controlStatus : 'unavailable';
  const needsPermission = controlStatus === 'permission-required';
  const currentPort = snapshot.status === 'starting' ? undefined : snapshot.port;

  async function refreshInterfaces(): Promise<void> {
    if (!window.electremote) {
      return;
    }

    setBusy(true);
    try {
      setSnapshot(await window.electremote.refreshNetworkInterfaces());
    } finally {
      setBusy(false);
    }
  }

  async function selectInterface(id: string): Promise<void> {
    if (!window.electremote) {
      return;
    }

    setBusy(true);
    try {
      setSnapshot(await window.electremote.selectNetworkInterface(id));
    } finally {
      setBusy(false);
    }
  }

  async function copyUrl(kind: 'address' | 'pairing'): Promise<void> {
    setCopyError(false);
    try {
      const api = window.electremote;
      if (!api || !(await (kind === 'address' ? api.copyHostUrl() : api.copyPairingUrl()))) {
        throw new Error('The host is unavailable.');
      }

      setCopied(kind);
      window.setTimeout(() => setCopied((current) => (current === kind ? null : current)), 1_500);
    } catch (error) {
      console.error('Unable to copy the Electremote link.', error);
      setCopyError(true);
    }
  }

  async function changePort(port: number): Promise<void> {
    setSettingsFeedback(null);
    if (!isHostPort(port)) {
      setSettingsFeedback({ message: 'Enter a whole number from 1024 to 65535.', error: true });
      return;
    }

    setBusy(true);
    try {
      if (!window.electremote) {
        throw new Error('Desktop controls are unavailable.');
      }
      const next = await window.electremote.changePort(port);
      setSnapshot(next);
      if (next.status === 'online') {
        setPortDraft(null);
        setShowSettings(false);
      }
    } catch (error) {
      console.error('Unable to change the host port.', error);
      setSettingsFeedback({ message: 'Could not change the port.', error: true });
    } finally {
      setBusy(false);
    }
  }

  async function resetPairedDevices(): Promise<void> {
    if (!window.confirm('Disconnect all paired devices? They will need to scan a new QR code.')) {
      return;
    }

    setBusy(true);
    setSettingsFeedback(null);
    try {
      if (!window.electremote) {
        throw new Error('Desktop controls are unavailable.');
      }
      setSnapshot(await window.electremote.resetPairedDevices());
      setSettingsFeedback({ message: 'Paired devices reset.', error: false });
    } catch (error) {
      console.error('Unable to reset paired devices.', error);
      setSettingsFeedback({ message: 'Could not reset paired devices.', error: true });
    } finally {
      setBusy(false);
    }
  }

  async function selectControlMode(mode: string): Promise<void> {
    setBusy(true);
    setControlModeError(false);
    try {
      if (!window.electremote || !isControlMode(mode)) {
        throw new Error('Invalid control mode selection.');
      }

      setSnapshot(await window.electremote.selectControlMode(mode));
    } catch (error) {
      console.error('Unable to change Electremote control mode.', error);
      setControlModeError(true);
    } finally {
      setBusy(false);
    }
  }

  async function setInputEnabled(
    input: 'touchpad' | 'keyboard' | 'clipboard',
    enabled: boolean,
  ): Promise<void> {
    setBusy(true);
    setInputError(null);
    try {
      if (!window.electremote) {
        throw new Error('Desktop controls are unavailable.');
      }

      const { setPointerEnabled, setKeyboardEnabled, setClipboardEnabled } = window.electremote;
      const update = {
        touchpad: setPointerEnabled,
        keyboard: setKeyboardEnabled,
        clipboard: setClipboardEnabled,
      };
      setSnapshot(await update[input](enabled));
    } catch (error) {
      console.error(`Unable to change the ${input} setting.`, error);
      setInputError(input);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={needsPermission ? 'desktop-shell desktop-shell--permission' : 'desktop-shell'}>
      <header className="app-header">
        <div className="brand-mark" aria-hidden="true">
          ER
        </div>
        <div>
          <p className="eyebrow">Electremote</p>
          <h1>Desktop host</h1>
        </div>
      </header>

      <section className="status-band" aria-labelledby="host-status-heading">
        <div>
          <p className="section-label">Host status</p>
          <h2 id="host-status-heading">{statusTitle}</h2>
        </div>
        <div className="host-actions">
          {snapshot.status === 'online' && (
            <button
              className="input-toggle"
              type="button"
              aria-pressed={snapshot.pointerEnabled}
              title="Allow paired devices to move, click, and scroll your mouse"
              disabled={busy || (controlStatus !== 'ready' && !snapshot.pointerEnabled)}
              onClick={() => void setInputEnabled('touchpad', !snapshot.pointerEnabled)}
            >
              <Mouse size={16} aria-hidden="true" />
              <span>
                Phone touchpad
                <span aria-hidden="true">: {snapshot.pointerEnabled ? 'On' : 'Off'}</span>
              </span>
            </button>
          )}
          {snapshot.status === 'online' && (
            <button
              className="input-toggle"
              type="button"
              aria-pressed={snapshot.keyboardEnabled}
              title="Allow paired devices to type and send shortcuts to your computer"
              disabled={busy || (controlStatus !== 'ready' && !snapshot.keyboardEnabled)}
              onClick={() => void setInputEnabled('keyboard', !snapshot.keyboardEnabled)}
            >
              <Keyboard size={16} aria-hidden="true" />
              <span>
                Phone keyboard
                <span aria-hidden="true">: {snapshot.keyboardEnabled ? 'On' : 'Off'}</span>
              </span>
            </button>
          )}
          {snapshot.status === 'online' && (
            <button
              className="input-toggle"
              type="button"
              aria-pressed={snapshot.clipboardEnabled}
              title="Allow paired devices to read and replace your desktop's text clipboard"
              disabled={busy}
              onClick={() => void setInputEnabled('clipboard', !snapshot.clipboardEnabled)}
            >
              <Clipboard size={16} aria-hidden="true" />
              <span>
                Clipboard sharing
                <span aria-hidden="true">: {snapshot.clipboardEnabled ? 'On' : 'Off'}</span>
              </span>
            </button>
          )}
          <span className={`status-indicator status-indicator--${snapshot.status}`}>
            {snapshot.status === 'online'
              ? `${snapshot.connectionCount} connected`
              : snapshot.status === 'error'
                ? 'Host unavailable'
                : 'Preparing server'}
          </span>
        </div>
      </section>

      {snapshot.status === 'online' && (
        <section className="host-panel" aria-label="Remote access">
          <div className="host-details">
            <div>
              <p className="section-label">Remote address</p>
              <div className="url-row">
                <code>{snapshot.url}</code>
                <button
                  className="icon-button"
                  type="button"
                  title="Copy remote address"
                  aria-label="Copy remote address"
                  onClick={() => void copyUrl('address')}
                >
                  {copied === 'address' ? (
                    <Check aria-hidden="true" />
                  ) : (
                    <Copy aria-hidden="true" />
                  )}
                </button>
                <button
                  className="icon-button"
                  type="button"
                  title="Copy one-time pairing link"
                  aria-label="Copy one-time pairing link"
                  onClick={() => void copyUrl('pairing')}
                >
                  {copied === 'pairing' ? (
                    <Check aria-hidden="true" />
                  ) : (
                    <Link aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <div className="host-options">
              <div>
                <label className="section-label" htmlFor="network-interface">
                  Network adapter
                </label>
                <div className="adapter-row">
                  <select
                    id="network-interface"
                    value={snapshot.selectedInterfaceId}
                    disabled={busy}
                    onChange={(event) => void selectInterface(event.target.value)}
                  >
                    {snapshot.interfaces.map((networkInterface) => (
                      <option key={networkInterface.id} value={networkInterface.id}>
                        {networkInterface.name} · {networkInterface.address}
                      </option>
                    ))}
                  </select>
                  <button
                    className="icon-button"
                    type="button"
                    title="Refresh network adapters"
                    aria-label="Refresh network adapters"
                    disabled={busy}
                    onClick={() => void refreshInterfaces()}
                  >
                    <RefreshCw className={busy ? 'spin' : undefined} aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div>
                <label className="section-label" htmlFor="control-mode">
                  Control mode
                </label>
                <select
                  id="control-mode"
                  className="control-mode-select"
                  value={snapshot.controlMode}
                  disabled={busy}
                  onChange={(event) => void selectControlMode(event.target.value)}
                >
                  <option value="keyboard">Keyboard shortcuts</option>
                  <option value="media-keys">System media keys</option>
                </select>
              </div>
            </div>

            <div className="host-notes">
              <p className="host-note">
                {snapshot.localOnly
                  ? 'No LAN adapter is available. This address works only on this computer.'
                  : 'Scan the code from a device connected to the same network.'}
              </p>
              {snapshot.controlMode === 'media-keys' && (
                <p className="host-note">Rewind and fast-forward send previous and next track.</p>
              )}
              {controlModeError && (
                <p className="host-note host-note--error" role="alert">
                  Could not change the control mode. Try again.
                </p>
              )}
              {inputError && (
                <p className="host-note host-note--error" role="alert">
                  Could not change the {inputError} setting. Try again.
                </p>
              )}
              {copyError && (
                <p className="host-note host-note--error" role="alert">
                  Could not copy the link. Try again.
                </p>
              )}
            </div>
          </div>

          <div className="qr-panel" aria-label="Remote address QR code">
            {snapshot.localOnly ? (
              <RadioTower aria-hidden="true" size={48} strokeWidth={1.5} />
            ) : (
              <QRCodeCanvas value={snapshot.pairingUrl} size={168} marginSize={2} level="M" />
            )}
          </div>
        </section>
      )}

      {snapshot.status === 'error' && (
        <section className="error-panel" role="alert">
          <p className="section-label">Startup error</p>
          <p>{snapshot.message}</p>
        </section>
      )}

      {currentPort !== undefined && (showSettings || snapshot.status === 'error') && (
        <section className="connection-settings" aria-label="Connection settings">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void changePort(portDraft === null ? currentPort : Number(portDraft));
            }}
          >
            <label htmlFor="host-port">Host port</label>
            <div className="connection-settings-actions">
              <input
                id="host-port"
                type="number"
                min={1024}
                max={65535}
                step={1}
                required
                value={portDraft ?? currentPort}
                disabled={busy}
                onChange={(event) => setPortDraft(event.target.value)}
              />
              <button className="input-toggle" type="submit" disabled={busy}>
                Save and restart host
              </button>
              {snapshot.status === 'online' && (
                <button
                  className="input-toggle"
                  type="button"
                  disabled={busy}
                  onClick={() => void resetPairedDevices()}
                >
                  Reset paired devices
                </button>
              )}
            </div>
          </form>
          {settingsFeedback && (
            <p
              className={`host-note${settingsFeedback.error ? ' host-note--error' : ''}`}
              role="status"
            >
              {settingsFeedback.message}
            </p>
          )}
        </section>
      )}

      <div className="permission-status" role="status">
        {needsPermission && (
          <div className="permission-notice">
            <ShieldAlert aria-hidden="true" />
            <div>
              <h3>Allow Electremote to control media</h3>
              <p>
                In System Settings &gt; Privacy &amp; Security, open Device Control and Data Access
                or Accessibility, then enable Electremote.
              </p>
            </div>
          </div>
        )}
      </div>

      <section className="system-grid" aria-label="Application status">
        <article className="system-item">
          <MonitorUp aria-hidden="true" />
          <div>
            <h3>Desktop</h3>
            {snapshot.status === 'online' ? (
              <button
                className="connection-settings-toggle"
                type="button"
                aria-expanded={showSettings}
                onClick={() => {
                  setPortDraft(null);
                  setSettingsFeedback(null);
                  setShowSettings(!showSettings);
                }}
              >
                Connection settings
              </button>
            ) : (
              <p>Renderer active</p>
            )}
          </div>
        </article>
        <article className="system-item">
          <ShieldCheck aria-hidden="true" />
          <div>
            <h3>Isolation</h3>
            <p>Enabled</p>
          </div>
        </article>
        <article className="system-item">
          <RadioTower aria-hidden="true" />
          <div role="status">
            <h3>Controls</h3>
            <p>
              {needsPermission
                ? 'Permission required'
                : controlStatus === 'ready'
                  ? 'Ready'
                  : 'Unavailable'}
            </p>
          </div>
        </article>
      </section>
    </main>
  );
}

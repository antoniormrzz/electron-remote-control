import { useEffect, useState } from 'react';
import { Check, Copy, MonitorUp, RadioTower, RefreshCw, ShieldCheck } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
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
  const [copied, setCopied] = useState(false);

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

  async function copyUrl(): Promise<void> {
    if (window.electremote && (await window.electremote.copyHostUrl())) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    }
  }

  return (
    <main className="desktop-shell">
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
        <span className={`status-indicator status-indicator--${snapshot.status}`}>
          {snapshot.status === 'online'
            ? `${snapshot.connectionCount} connected`
            : snapshot.status === 'error'
              ? 'Host unavailable'
              : 'Preparing server'}
        </span>
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
                  onClick={() => void copyUrl()}
                >
                  {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                </button>
              </div>
            </div>

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

            <p className="host-note">
              {snapshot.localOnly
                ? 'No LAN adapter is available. This address works only on this computer.'
                : 'Scan the code from a device connected to the same network.'}
            </p>
          </div>

          <div className="qr-panel" aria-label="Remote address QR code">
            {snapshot.localOnly ? (
              <RadioTower aria-hidden="true" size={48} strokeWidth={1.5} />
            ) : (
              <QRCodeCanvas value={snapshot.url} size={168} marginSize={2} level="M" />
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

      <section className="system-grid" aria-label="Application status">
        <article className="system-item">
          <MonitorUp aria-hidden="true" />
          <div>
            <h3>Desktop</h3>
            <p>Renderer active</p>
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
          <div>
            <h3>Controls</h3>
            <p>Coming next</p>
          </div>
        </article>
      </section>
    </main>
  );
}

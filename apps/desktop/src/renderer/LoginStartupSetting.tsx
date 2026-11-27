import { useEffect, useRef, useState } from 'react';
import type { LoginStartupStatus } from '../shared/host';

export function LoginStartupSetting() {
  const [status, setStatus] = useState<LoginStartupStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const updating = useRef(false);

  useEffect(() => {
    const api = window.electremote;
    if (!api) {
      return;
    }
    let active = true;

    async function refresh(): Promise<void> {
      if (updating.current || !api) {
        return;
      }

      const request = ++requestId.current;
      try {
        const next = await api.getLoginStartup();
        if (active && request === requestId.current) {
          setStatus(next);
          setError(null);
        }
      } catch (error) {
        console.error('Unable to read the Electremote login setting.', error);
        if (active && request === requestId.current) {
          setStatus(null);
          setError('Could not read the system startup setting.');
        }
      }
    }

    const refreshOnFocus = () => void refresh();
    window.addEventListener('focus', refreshOnFocus);
    refreshOnFocus();
    return () => {
      active = false;
      window.removeEventListener('focus', refreshOnFocus);
    };
  }, []);

  async function change(enabled: boolean): Promise<void> {
    const api = window.electremote;
    if (!api || updating.current) {
      return;
    }
    updating.current = true;
    const request = ++requestId.current;
    setBusy(true);
    setError(null);
    try {
      const next = await api.setLoginStartup(enabled);
      if (request === requestId.current) {
        setStatus(next);
      }
    } catch (error) {
      console.error('Unable to change the Electremote login setting.', error);
      if (request === requestId.current) {
        setError('Could not change the system startup setting.');
      }
    } finally {
      updating.current = false;
      if (request === requestId.current) {
        setBusy(false);
      }
    }
  }

  let note = 'Open Electremote when you sign in to this computer.';
  if (status === 'requires-approval') {
    note = 'Allow Electremote in your system login or startup items to finish enabling it.';
  } else if (status === 'unavailable') {
    note = 'Available only in packaged desktop builds.';
  } else if (status === null && !error) {
    note = 'Checking the system startup setting...';
  }

  const requested = status === 'enabled' || status === 'requires-approval';

  return (
    <div className="settings-row">
      <div>
        <p className="setting-label" id="login-startup-label">
          Start at login
        </p>
        <p
          className={`host-note${error ? ' host-note--error' : ''}`}
          id="login-startup-note"
          role="status"
        >
          {error ?? note}
        </p>
      </div>
      <button
        className="settings-switch"
        type="button"
        role="switch"
        aria-labelledby="login-startup-label"
        aria-describedby="login-startup-note"
        aria-checked={requested}
        disabled={busy || status === null || status === 'unavailable'}
        onClick={() => void change(!requested)}
      >
        <span aria-hidden="true">
          {status === 'requires-approval' ? 'Pending' : requested ? 'On' : 'Off'}
        </span>
        <span className="settings-switch-track" aria-hidden="true" />
      </button>
    </div>
  );
}

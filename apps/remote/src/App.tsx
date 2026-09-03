import type { LucideIcon } from 'lucide-react';
import {
  FastForward,
  LoaderCircle,
  Pause,
  Rewind,
  Volume1,
  Volume2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { CONTROL_COMMANDS } from '@electremote/protocol';
import type { ControlCommand } from '@electremote/protocol';
import { useHostConnection } from './useHostConnection';

interface CommandDetails {
  label: string;
  icon: LucideIcon;
}

const COMMAND_DETAILS = {
  'play-pause': { label: 'Play / pause', icon: Pause },
  'volume-up': { label: 'Volume up', icon: Volume2 },
  'volume-down': { label: 'Volume down', icon: Volume1 },
  rewind: { label: 'Rewind', icon: Rewind },
  'fast-forward': { label: 'Fast-forward', icon: FastForward },
} satisfies Record<ControlCommand, CommandDetails>;

export function App() {
  const connectionState = useHostConnection();
  const connected = connectionState === 'connected';
  const ConnectionIcon = connected
    ? Wifi
    : connectionState === 'unavailable'
      ? WifiOff
      : LoaderCircle;
  const connectionLabel = {
    connected: 'Connected',
    connecting: 'Connecting',
    reconnecting: 'Reconnecting',
    unavailable: 'Host unavailable',
  }[connectionState];

  return (
    <main className="remote-shell">
      <header className="remote-header">
        <div>
          <p className="eyebrow">Electremote</p>
          <h1>Media control</h1>
        </div>
        <div className={`connection-status connection-status--${connectionState}`} role="status">
          <ConnectionIcon
            className={!connected && connectionState !== 'unavailable' ? 'spin' : undefined}
            aria-hidden="true"
            size={18}
            strokeWidth={2.25}
          />
          <span>{connectionLabel}</span>
        </div>
      </header>

      <section className="control-pad" aria-label="Media controls">
        {CONTROL_COMMANDS.map((command) => {
          const details = COMMAND_DETAILS[command];
          const Icon = details.icon;

          return (
            <button
              className={`control control--${command}`}
              type="button"
              key={command}
              disabled
              title="Controls will be enabled in the next release"
            >
              <Icon aria-hidden="true" size={28} strokeWidth={1.9} />
              <span>{details.label}</span>
            </button>
          );
        })}
      </section>
    </main>
  );
}

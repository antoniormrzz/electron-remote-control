import { createRequire } from 'node:module';
import type { ControlCommand, ControlError } from '@electremote/protocol';
import type { ControlMode } from '../shared/host';

export type ControlStatus = 'ready' | 'permission-required' | 'unavailable';

export type ControlExecutionResult = { ok: true } | { ok: false; error: ControlError };

type RobotJs = typeof import('robotjs');

const require = createRequire(__filename);

const COMMAND_KEYS: Record<ControlMode, Record<ControlCommand, string>> = {
  keyboard: {
    'play-pause': 'space',
    'volume-up': 'up',
    'volume-down': 'down',
    rewind: 'left',
    'fast-forward': 'right',
  },
  'media-keys': {
    'play-pause': 'audio_play',
    'volume-up': 'audio_vol_up',
    'volume-down': 'audio_vol_down',
    rewind: 'audio_prev',
    'fast-forward': 'audio_next',
  },
};

export class MediaController {
  private robot: RobotJs | null = null;
  private status: ControlStatus = 'unavailable';
  private controlMode: ControlMode = 'keyboard';
  private permissionRequested = false;

  public constructor(private readonly packagedBinaryPath?: string) {}

  public initialize(): ControlStatus {
    if (!this.loadRobot()) {
      return this.status;
    }

    return this.refreshStatus(true);
  }

  public getStatus(): ControlStatus {
    return this.status;
  }

  public getControlMode(): ControlMode {
    return this.controlMode;
  }

  public setControlMode(mode: ControlMode): void {
    this.controlMode = mode;
  }

  public refreshStatus(requestPermission = false): ControlStatus {
    if (!this.robot) {
      return this.status;
    }

    if (process.platform !== 'darwin') {
      this.status = 'ready';
      return this.status;
    }

    if (
      requestPermission &&
      !this.permissionRequested &&
      this.robot.getAccessibilityPermission() === false
    ) {
      this.permissionRequested = true;
      this.robot.requestAccessibilityPermission();
    }

    this.status = this.robot.getAccessibilityPermission() ? 'ready' : 'permission-required';
    return this.status;
  }

  public execute(command: ControlCommand): ControlExecutionResult {
    if (!this.robot) {
      return { ok: false, error: 'execution-failed' };
    }

    if (this.refreshStatus() !== 'ready') {
      return { ok: false, error: 'permission-required' };
    }

    try {
      this.robot.keyTap(COMMAND_KEYS[this.controlMode][command]);
      return { ok: true };
    } catch (error) {
      console.error('RobotJS failed to execute a media command.', error);
      this.status = 'unavailable';
      return { ok: false, error: 'execution-failed' };
    }
  }

  private loadRobot(): boolean {
    if (this.robot) {
      return true;
    }

    try {
      this.robot = require(this.packagedBinaryPath ?? 'robotjs') as RobotJs;
      return true;
    } catch (error) {
      console.error('RobotJS failed to load.', error);
      this.status = 'unavailable';
      return false;
    }
  }
}

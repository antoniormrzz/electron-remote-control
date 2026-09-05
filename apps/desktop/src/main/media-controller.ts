import { createRequire } from 'node:module';
import type { ControlCommand, ControlError } from '@electremote/protocol';

export type ControlStatus = 'ready' | 'permission-required' | 'unavailable';

export type ControlExecutionResult = { ok: true } | { ok: false; error: ControlError };

type RobotJs = typeof import('robotjs');

const require = createRequire(__filename);

const COMMAND_KEYS: Record<ControlCommand, string> = {
  'play-pause': 'space',
  'volume-up': 'up',
  'volume-down': 'down',
  rewind: 'left',
  'fast-forward': 'right',
};

export class MediaController {
  private robot: RobotJs | null = null;
  private status: ControlStatus = 'unavailable';
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
      this.robot.keyTap(COMMAND_KEYS[command]);
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

import type { ElectremoteApi } from '../shared/host';

declare global {
  interface Window {
    electremote?: ElectremoteApi;
  }
}

export {};

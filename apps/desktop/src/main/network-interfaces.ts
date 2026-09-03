import os from 'node:os';
import type { NetworkInterfaceCandidate } from '../shared/host';

const LOOPBACK: NetworkInterfaceCandidate = {
  id: 'loopback:127.0.0.1',
  name: 'This computer only',
  address: '127.0.0.1',
  localOnly: true,
};

function isPrivateIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  const first = octets[0];
  const second = octets[1];

  return (
    first === 10 ||
    (first === 172 && second !== undefined && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

export function listNetworkInterfaces(): NetworkInterfaceCandidate[] {
  const candidates = Object.entries(os.networkInterfaces()).flatMap(([name, addresses]) =>
    (addresses ?? [])
      .filter((address) => address.family === 'IPv4' && !address.internal)
      .map((address) => ({
        id: `${name}:${address.address}`,
        name,
        address: address.address,
        localOnly: false,
      })),
  );

  const uniqueCandidates = [
    ...new Map(candidates.map((candidate) => [candidate.id, candidate])).values(),
  ];

  uniqueCandidates.sort((left, right) => {
    const privateDifference =
      Number(isPrivateIpv4(right.address)) - Number(isPrivateIpv4(left.address));
    return (
      privateDifference ||
      left.name.localeCompare(right.name) ||
      left.address.localeCompare(right.address)
    );
  });

  return uniqueCandidates.length > 0 ? uniqueCandidates : [LOOPBACK];
}

export function selectPreferredInterface(
  candidates: readonly NetworkInterfaceCandidate[],
  currentId?: string,
): NetworkInterfaceCandidate {
  return candidates.find((candidate) => candidate.id === currentId) ?? candidates[0] ?? LOOPBACK;
}

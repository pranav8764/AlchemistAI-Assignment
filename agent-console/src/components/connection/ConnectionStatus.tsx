'use client';

import { useConnectionStore } from '@/store/connectionStore';
import type { ConnectionStatus as ConnectionStatusType } from '@/protocol/types';

const STATUS_LABELS: Record<ConnectionStatusType, string> = {
  idle: 'Disconnected',
  connecting: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  resuming: 'Resuming…',
  failed: 'Connection Failed',
};

export function ConnectionStatus() {
  const status = useConnectionStore((s) => s.status);

  return (
    <div className="connection-status" id="connection-status">
      <div className={`connection-status__dot connection-status__dot--${status}`} />
      <span>{STATUS_LABELS[status]}</span>
    </div>
  );
}

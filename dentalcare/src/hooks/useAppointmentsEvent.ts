// src/hooks/useAppointmentsEvent.ts
import { useEffect } from 'react';

/**
 * Hook to listen to appointment events via Server-Sent Events (SSE).
 * Connects to the backend `/appointments/events` endpoint.
 * Calls the provided callback with parsed JSON data whenever an event is received.
 */
export function useAppointmentsEvent(onEvent: (data: any) => void) {
  useEffect(() => {
    const source = new EventSource('http://127.0.0.1:4000/appointments/events');

    const handler = (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data);
        onEvent(parsed);
      } catch (err) {
        console.warn('Failed to parse appointments SSE data', err);
      }
    };

    source.addEventListener('appointments-changed', handler);

    source.onerror = (err) => {
      console.warn('Appointments SSE error', err);
    };

    return () => {
      source.removeEventListener('appointments-changed', handler);
      source.close();
    };
  }, [onEvent]);
}

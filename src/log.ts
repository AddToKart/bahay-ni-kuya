const RING_MAX = 400;
const ring: string[] = [];

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function log(message: string, extra?: unknown): void {
  const stamp = new Date().toISOString().slice(11, 23);
  const line = extra === undefined ? `${stamp} ${message}` : `${stamp} ${message} ${stringify(extra)}`;
  ring.push(line);
  if (ring.length > RING_MAX) ring.shift();
  console.log(line);
}

export function logTail(n = 100): string[] {
  return ring.slice(-n);
}

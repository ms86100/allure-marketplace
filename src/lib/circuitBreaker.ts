type Domain = 'notifications' | 'orders' | 'admin' | 'general';

interface DomainState {
  failures: number;
  successes: number;
  openedAt: number | null;
}

const FAILURE_THRESHOLD = 3;
const SUCCESS_THRESHOLD = 2;
const COOLDOWN_MS = 60_000;

const states = new Map<Domain, DomainState>();

function getState(domain: Domain): DomainState {
  if (!states.has(domain)) {
    states.set(domain, { failures: 0, successes: 0, openedAt: null });
  }
  return states.get(domain)!;
}

export function recordFailure(domain: Domain): void {
  const s = getState(domain);
  s.failures += 1;
  s.successes = 0;
  if (s.failures >= FAILURE_THRESHOLD && !s.openedAt) {
    s.openedAt = Date.now();
  }
}

export function recordSuccess(domain: Domain): void {
  const s = getState(domain);
  s.successes += 1;
  s.failures = 0;
  if (s.successes >= SUCCESS_THRESHOLD) {
    s.openedAt = null;
  }
}

export function isCircuitOpen(domain: Domain): boolean {
  const s = getState(domain);
  if (!s.openedAt) return false;
  // Half-open: allow one test request after cooldown
  if (Date.now() - s.openedAt >= COOLDOWN_MS) {
    s.openedAt = Date.now(); // reset cooldown window for next test
    return false;
  }
  return true;
}

const KEY_DOMAIN_MAP: Record<string, Domain> = {
  'notifications': 'notifications',
  'unread-notifications': 'notifications',
  'latest-action-notification': 'notifications',
  'active-orders-strip': 'orders',
  'ai-review-log': 'admin',
};

export function domainForKey(queryKey: readonly unknown[]): Domain {
  const first = String(queryKey[0] ?? '');
  return KEY_DOMAIN_MAP[first] || 'general';
}

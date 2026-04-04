type Domain = 'notifications' | 'orders' | 'admin' | 'general' | 'security' | 'auth';

interface DomainState {
  failures: number;
  successes: number;
  openedAt: number | null;
  nextAttemptAt: number | null;
}

const FAILURE_THRESHOLD = 3;
const SUCCESS_THRESHOLD = 2;
const COOLDOWN_MS = 60_000;
const JITTER_MS = 5_000;

const states = new Map<Domain, DomainState>();

function getState(domain: Domain): DomainState {
  if (!states.has(domain)) {
    states.set(domain, { failures: 0, successes: 0, openedAt: null, nextAttemptAt: null });
  }
  return states.get(domain)!;
}

export function recordFailure(domain: Domain): void {
  const s = getState(domain);
  s.failures += 1;
  s.successes = 0;
  if (s.failures >= FAILURE_THRESHOLD && !s.openedAt) {
    s.openedAt = Date.now();
    s.nextAttemptAt = Date.now() + COOLDOWN_MS + Math.random() * JITTER_MS;
    console.warn(`[CircuitBreaker] ${domain} circuit OPENED after ${s.failures} failures`);
  }
}

export function recordSuccess(domain: Domain): void {
  const s = getState(domain);
  s.successes += 1;
  s.failures = 0;
  if (s.successes >= SUCCESS_THRESHOLD) {
    if (s.openedAt) console.log(`[CircuitBreaker] ${domain} circuit CLOSED after ${s.successes} successes`);
    s.openedAt = null;
    s.nextAttemptAt = null;
  }
}

export function isCircuitOpen(domain: Domain): boolean {
  const s = getState(domain);
  if (!s.openedAt) return false;
  // Half-open: allow one test request after deterministic cooldown + jitter
  if (Date.now() >= s.nextAttemptAt!) {
    // Set next half-open window (deterministic — computed once per transition)
    s.nextAttemptAt = Date.now() + COOLDOWN_MS + Math.random() * JITTER_MS;
    return false;
  }
  return true;
}

/** @deprecated Prefer isCircuitOpen(domain) for scoped checks. Only use as global kill switch. */
export function isAnyCircuitOpen(): boolean {
  for (const [, s] of states) {
    if (s.openedAt && Date.now() - s.openedAt < COOLDOWN_MS) return true;
  }
  return false;
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

/**
 * Shared, cached status flow data for Live Activity lifecycle decisions.
 * Derives START and TERMINAL status sets from the DB-backed category_status_flows table.
 */
import { supabase } from '@/integrations/supabase/client';

interface FlowEntry {
  status_key: string;
  sort_order: number;
  is_terminal: boolean | null;
}

let cached: FlowEntry[] | null = null;
let cacheExpiry = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export async function getStatusFlowEntries(): Promise<FlowEntry[]> {
  if (cached && Date.now() < cacheExpiry) return cached;

  const { data, error } = await supabase
    .from('category_status_flows')
    .select('status_key, sort_order, is_terminal')
    .in('transaction_type', ['cart_purchase', 'seller_delivery'])
    .order('sort_order');

  if (error || !data) return cached ?? [];

  cached = data as FlowEntry[];
  cacheExpiry = Date.now() + CACHE_TTL;
  return cached;
}

/** Statuses marked is_terminal in the DB */
export async function getTerminalStatuses(): Promise<Set<string>> {
  const entries = await getStatusFlowEntries();
  const terminal = new Set<string>();
  for (const e of entries) {
    if (e.is_terminal) terminal.add(e.status_key);
  }
  // Always include these as safety net
  for (const s of ['delivered', 'completed', 'cancelled', 'no_show', 'failed']) {
    terminal.add(s);
  }
  return terminal;
}

/** Non-terminal, non-placed statuses that should start a Live Activity */
export async function getStartStatuses(): Promise<Set<string>> {
  const entries = await getStatusFlowEntries();
  const start = new Set<string>();
  for (const e of entries) {
    if (!e.is_terminal && e.status_key !== 'placed') {
      start.add(e.status_key);
    }
  }
  return start;
}

/** Invalidate cache (e.g. on app resume) */
export function invalidateStatusFlowCache(): void {
  cached = null;
  cacheExpiry = 0;
}

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

/** Statuses marked is_terminal in the DB — DB is the sole source of truth */
export async function getTerminalStatuses(): Promise<Set<string>> {
  const entries = await getStatusFlowEntries();
  const terminal = new Set<string>();
  for (const e of entries) {
    if (e.is_terminal) terminal.add(e.status_key);
  }
  if (terminal.size === 0) {
    console.warn('[statusFlowCache] No terminal statuses found in DB — this is a configuration issue');
  }
  return terminal;
}

/** Non-terminal statuses beyond the very first step — should start a Live Activity */
export async function getStartStatuses(): Promise<Set<string>> {
  const entries = await getStatusFlowEntries();
  if (entries.length === 0) return new Set();
  const minSort = Math.min(...entries.map(e => e.sort_order));
  const start = new Set<string>();
  for (const e of entries) {
    if (!e.is_terminal && e.sort_order > minSort) {
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

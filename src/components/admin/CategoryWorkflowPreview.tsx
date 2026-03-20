import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkflowMap, getWorkflowKeyFromMap } from '@/hooks/useWorkflowMap';
import { getWorkflowKey } from '@/lib/listingTypeWorkflowMap';
import { Badge } from '@/components/ui/badge';
import { DynamicIcon } from '@/components/ui/DynamicIcon';
import { Link2, AlertTriangle, ChevronRight, CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react';
import { TRANSACTION_TYPES, formatName } from '@/components/admin/workflow/types';

interface Props {
  listingType: string;
  parentGroup: string;
  category?: string;
}

interface FlowStep {
  status_key: string;
  display_label: string | null;
  icon: string | null;
  color: string | null;
  sort_order: number;
  is_terminal: boolean | null;
  actor: string;
}

interface RecentOrder {
  id: string;
  order_type: string | null;
  fulfillment_type: string | null;
  created_at: string;
}

export function CategoryWorkflowPreview({ listingType, parentGroup, category }: Props) {
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);

  const { data: workflowMap, isLoading: mapLoading } = useWorkflowMap();

  // Resolve workflow key from DB map, fallback to static
  const mapEntry = getWorkflowKeyFromMap(workflowMap, listingType);
  const workflowKey = mapEntry?.workflow_key ?? getWorkflowKey(listingType);
  const isConditional = mapEntry?.is_conditional ?? false;
  const conditionNote = mapEntry?.condition_note ?? null;

  const workflowLabel = TRANSACTION_TYPES.find(t => t.value === workflowKey)?.label ?? formatName(workflowKey);

  // Fetch workflow steps — try parent_group first, fallback to 'default'
  useEffect(() => {
    if (!parentGroup || !workflowKey) return;
    setLoading(true);
    
    (async () => {
      // Try specific parent_group
      const { data } = await supabase
        .from('category_status_flows')
        .select('status_key, display_label, icon, color, sort_order, is_terminal, actor, is_deprecated')
        .eq('parent_group', parentGroup)
        .eq('transaction_type', workflowKey)
        .order('sort_order');

      if (data && data.length > 0) {
        setNotFound(false);
        setSteps(data.filter(s => !s.is_deprecated));
        setLoading(false);
        return;
      }

      // Fallback to 'default' parent_group
      if (parentGroup !== 'default') {
        const fallback = await supabase
          .from('category_status_flows')
          .select('status_key, display_label, icon, color, sort_order, is_terminal, actor, is_deprecated')
          .eq('parent_group', 'default')
          .eq('transaction_type', workflowKey)
          .order('sort_order');

        if (fallback.data && fallback.data.length > 0) {
          setNotFound(false);
          setSteps(fallback.data.filter(s => !s.is_deprecated));
          setLoading(false);
          return;
        }
      }

      setNotFound(true);
      setSteps([]);
      setLoading(false);
    })();
  }, [parentGroup, workflowKey]);

  // Fetch recent orders audit trail
  useEffect(() => {
    if (!parentGroup || !category) return;
    supabase
      .from('orders')
      .select(`
        id, order_type, fulfillment_type, created_at,
        order_items!inner(products!inner(category))
      `)
      .eq('order_items.products.category', category)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }) => {
        setRecentOrders((data as unknown as RecentOrder[]) ?? []);
      });
  }, [parentGroup, category]);

  if (loading || mapLoading) {
    return (
      <div className="p-3 rounded-xl bg-muted/30 border border-border/30 animate-pulse">
        <div className="h-4 w-32 bg-muted rounded" />
      </div>
    );
  }

  // Determinism indicator
  const determinism = notFound
    ? { label: 'Fallback', color: 'text-destructive', bg: 'bg-destructive/10 border-destructive/30', icon: AlertCircle }
    : isConditional
      ? { label: 'Conditional', color: 'text-amber-600', bg: 'bg-amber-500/10 border-amber-500/30', icon: HelpCircle }
      : { label: 'Deterministic', color: 'text-emerald-600', bg: 'bg-emerald-500/10 border-emerald-500/30', icon: CheckCircle2 };

  const DetIcon = determinism.icon;

  return (
    <div className="p-3 rounded-xl bg-muted/30 border border-border/40 space-y-2">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <Link2 size={13} className="text-primary shrink-0" />
        <span className="text-[11px] font-bold text-foreground">Linked Workflow</span>
        <Badge variant="secondary" className="text-[9px] h-4 px-1.5 rounded-md font-mono">
          {workflowLabel}
        </Badge>
        {/* Determinism badge */}
        <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[9px] font-semibold ${determinism.bg} ${determinism.color}`}>
          <DetIcon size={10} />
          {determinism.label}
        </div>
      </div>

      {notFound ? (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-destructive/5 border border-destructive/20">
          <AlertTriangle size={13} className="text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] font-medium text-destructive">
              No workflow found for "{formatName(parentGroup)} / {workflowLabel}"
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Orders will fall back to the default pipeline. Configure one in the Workflow tab.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Step pipeline visualization */}
          <div className="flex items-center gap-0.5 flex-wrap">
            {steps.map((step, i) => (
              <div key={step.status_key} className="flex items-center gap-0.5">
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-background border border-border/50">
                  {step.icon && <DynamicIcon name={step.icon} size={10} />}
                  <span className="text-[9px] font-medium whitespace-nowrap">
                    {step.display_label || formatName(step.status_key)}
                  </span>
                  <span className="text-[8px] text-muted-foreground">({step.actor})</span>
                </div>
                {i < steps.length - 1 && (
                  <ChevronRight size={10} className="text-muted-foreground/50 shrink-0" />
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>{steps.length} steps</span>
            <span>·</span>
            <span>{formatName(parentGroup)} pipeline</span>
          </div>
        </>
      )}

      {/* Condition note from DB */}
      {isConditional && conditionNote && (
        <p className="text-[10px] text-muted-foreground/80 italic">
          ℹ️ {conditionNote}
        </p>
      )}

      {/* Recent orders audit trail */}
      {recentOrders.length > 0 && (
        <div className="pt-1 border-t border-border/30 space-y-1">
          <span className="text-[10px] font-semibold text-muted-foreground">Recent Orders</span>
          <div className="space-y-0.5">
            {recentOrders.map(o => (
              <div key={o.id} className="flex items-center gap-2 text-[9px] text-muted-foreground">
                <span className="font-mono">{o.id.slice(0, 8)}</span>
                <Badge variant="outline" className="text-[8px] h-3.5 px-1 rounded">
                  {o.order_type ?? 'purchase'}
                </Badge>
                {o.fulfillment_type && (
                  <Badge variant="outline" className="text-[8px] h-3.5 px-1 rounded">
                    {formatName(o.fulfillment_type)}
                  </Badge>
                )}
                <span className="ml-auto">{new Date(o.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

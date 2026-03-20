import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getWorkflowKey, FULFILLMENT_DEPENDENT_TYPES } from '@/lib/listingTypeWorkflowMap';
import { Badge } from '@/components/ui/badge';
import { DynamicIcon } from '@/components/ui/DynamicIcon';
import { Link2, AlertTriangle, ChevronRight, ExternalLink } from 'lucide-react';
import { TRANSACTION_TYPES, formatName } from '@/components/admin/workflow/types';

interface Props {
  listingType: string;
  parentGroup: string;
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

export function CategoryWorkflowPreview({ listingType, parentGroup }: Props) {
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const workflowKey = getWorkflowKey(listingType);
  const isFulfillmentDependent = FULFILLMENT_DEPENDENT_TYPES.has(listingType);
  const workflowLabel = TRANSACTION_TYPES.find(t => t.value === workflowKey)?.label ?? formatName(workflowKey);

  useEffect(() => {
    if (!parentGroup || !workflowKey) return;
    setLoading(true);
    supabase
      .from('category_status_flows')
      .select('status_key, display_label, icon, color, sort_order, is_terminal, actor')
      .eq('parent_group', parentGroup)
      .eq('transaction_type', workflowKey)
      .order('sort_order')
      .then(({ data }) => {
        if (!data || data.length === 0) {
          setNotFound(true);
          setSteps([]);
        } else {
          setNotFound(false);
          setSteps(data);
        }
        setLoading(false);
      });
  }, [parentGroup, workflowKey]);

  if (loading) {
    return (
      <div className="p-3 rounded-xl bg-muted/30 border border-border/30 animate-pulse">
        <div className="h-4 w-32 bg-muted rounded" />
      </div>
    );
  }

  return (
    <div className="p-3 rounded-xl bg-muted/30 border border-border/40 space-y-2">
      <div className="flex items-center gap-2">
        <Link2 size={13} className="text-primary shrink-0" />
        <span className="text-[11px] font-bold text-foreground">Linked Workflow</span>
        <Badge variant="secondary" className="text-[9px] h-4 px-1.5 rounded-md font-mono">
          {workflowLabel}
        </Badge>
      </div>

      {notFound ? (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
          <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
              No workflow found for "{formatName(parentGroup)} / {workflowLabel}"
            </p>
            <p className="text-[10px] text-amber-600/80 dark:text-amber-500/80 mt-0.5">
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

      {isFulfillmentDependent && (
        <p className="text-[10px] text-muted-foreground/80 italic">
          ℹ️ Final workflow may vary by fulfillment type (seller delivery / platform delivery / self-pickup).
        </p>
      )}
    </div>
  );
}

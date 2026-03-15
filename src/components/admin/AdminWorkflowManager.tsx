import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import {
  GitBranch, Plus, Trash2, GripVertical, Save, ChevronRight,
  ArrowRight, ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface FlowStep {
  id?: string;
  status_key: string;
  sort_order: number;
  actor: string;
  is_terminal: boolean;
  display_label: string;
  color: string;
  icon: string;
  buyer_hint: string;
  seller_hint: string;
}

interface Transition {
  from_status: string;
  to_status: string;
  allowed_actor: string;
}

interface WorkflowGroup {
  parent_group: string;
  transaction_type: string;
  steps: FlowStep[];
  step_count: number;
}

const ACTORS = ['buyer', 'seller', 'delivery', 'system', 'admin'];
const TRANSACTION_TYPES = [
  { value: 'cart_purchase', label: 'Cart Purchase' },
  { value: 'self_fulfillment', label: 'Self Fulfillment' },
  { value: 'service_booking', label: 'Service Booking' },
  { value: 'request_service', label: 'Request Service' },
  { value: 'book_slot', label: 'Book Slot' },
];

export function AdminWorkflowManager() {
  const [workflows, setWorkflows] = useState<WorkflowGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowGroup | null>(null);
  const [editSteps, setEditSteps] = useState<FlowStep[]>([]);
  const [transitions, setTransitions] = useState<Transition[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => { loadWorkflows(); }, []);

  const loadWorkflows = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('category_status_flows')
      .select('parent_group, transaction_type, status_key, sort_order, actor, is_terminal, display_label, color, icon, buyer_hint, seller_hint, id')
      .order('parent_group')
      .order('transaction_type')
      .order('sort_order', { ascending: true });

    if (error) {
      toast.error('Failed to load workflows');
      setIsLoading(false);
      return;
    }

    // Group by (parent_group, transaction_type)
    const groupMap = new Map<string, WorkflowGroup>();
    for (const row of (data || [])) {
      const key = `${row.parent_group}::${row.transaction_type}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          parent_group: row.parent_group,
          transaction_type: row.transaction_type,
          steps: [],
          step_count: 0,
        });
      }
      const group = groupMap.get(key)!;
      group.steps.push(row as FlowStep);
      group.step_count++;
    }

    setWorkflows(Array.from(groupMap.values()));
    setIsLoading(false);
  };

  const openEditor = async (wf: WorkflowGroup) => {
    setSelectedWorkflow(wf);
    setEditSteps(wf.steps.map(s => ({ ...s })));

    // Load transitions
    const { data } = await supabase
      .from('category_status_transitions')
      .select('from_status, to_status, allowed_actor')
      .eq('parent_group', wf.parent_group)
      .eq('transaction_type', wf.transaction_type);

    setTransitions((data || []) as Transition[]);
  };

  const addStep = () => {
    const maxOrder = editSteps.length > 0 ? Math.max(...editSteps.map(s => s.sort_order)) : 0;
    setEditSteps([...editSteps, {
      status_key: '',
      sort_order: maxOrder + 10,
      actor: 'seller',
      is_terminal: false,
      display_label: '',
      color: 'bg-gray-100 text-gray-600',
      icon: 'Circle',
      buyer_hint: '',
    }]);
  };

  const removeStep = (index: number) => {
    const step = editSteps[index];
    setEditSteps(editSteps.filter((_, i) => i !== index));
    // Remove related transitions
    setTransitions(transitions.filter(
      t => t.from_status !== step.status_key && t.to_status !== step.status_key
    ));
  };

  const updateStep = (index: number, field: keyof FlowStep, value: any) => {
    const updated = [...editSteps];
    (updated[index] as any)[field] = value;
    setEditSteps(updated);
  };

  const moveStep = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === editSteps.length - 1) return;
    const swapIdx = direction === 'up' ? index - 1 : index + 1;
    const updated = [...editSteps];
    const tmpOrder = updated[index].sort_order;
    updated[index].sort_order = updated[swapIdx].sort_order;
    updated[swapIdx].sort_order = tmpOrder;
    [updated[index], updated[swapIdx]] = [updated[swapIdx], updated[index]];
    setEditSteps(updated);
  };

  const hasTransition = (from: string, to: string, actor: string) => {
    return transitions.some(t => t.from_status === from && t.to_status === to && t.allowed_actor === actor);
  };

  const toggleTransition = (from: string, to: string, actor: string) => {
    if (hasTransition(from, to, actor)) {
      setTransitions(transitions.filter(
        t => !(t.from_status === from && t.to_status === to && t.allowed_actor === actor)
      ));
    } else {
      setTransitions([...transitions, { from_status: from, to_status: to, allowed_actor: actor }]);
    }
  };

  const saveWorkflow = async () => {
    if (!selectedWorkflow) return;

    // Validate: empty keys
    const emptyKeys = editSteps.filter(s => !s.status_key.trim());
    if (emptyKeys.length > 0) {
      toast.error('All steps must have a status key');
      return;
    }

    // Validate: duplicate status keys
    const keys = editSteps.map(s => s.status_key.trim().toLowerCase());
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (dupes.length > 0) {
      toast.error(`Duplicate status key: "${dupes[0]}"`);
      return;
    }

    // Validate: at least one terminal status
    const hasTerminal = editSteps.some(s => s.is_terminal);
    if (!hasTerminal) {
      toast.error('Workflow must have at least one terminal status');
      return;
    }

    // Warn: non-terminal statuses without outgoing transitions
    const nonTerminalKeys = new Set(editSteps.filter(s => !s.is_terminal).map(s => s.status_key));
    const fromKeys = new Set(transitions.map(t => t.from_status));
    const orphaned = [...nonTerminalKeys].filter(k => !fromKeys.has(k));
    if (orphaned.length > 0) {
      toast.warning(`Warning: "${orphaned.join('", "')}" have no outgoing transitions`);
    }

    setIsSaving(true);
    try {
      const { parent_group, transaction_type } = selectedWorkflow;

      // Delete existing flow steps for this workflow
      await supabase
        .from('category_status_flows')
        .delete()
        .eq('parent_group', parent_group)
        .eq('transaction_type', transaction_type);

      // Insert updated steps
      const stepsToInsert = editSteps.map((s, i) => ({
        parent_group,
        transaction_type,
        status_key: s.status_key,
        sort_order: (i + 1) * 10,
        actor: s.actor,
        is_terminal: s.is_terminal,
        display_label: s.display_label || s.status_key,
        color: s.color,
        icon: s.icon,
        buyer_hint: s.buyer_hint,
      }));

      const { error: insertError } = await supabase
        .from('category_status_flows')
        .insert(stepsToInsert);

      if (insertError) throw insertError;

      // Delete existing transitions
      await supabase
        .from('category_status_transitions')
        .delete()
        .eq('parent_group', parent_group)
        .eq('transaction_type', transaction_type);

      // Insert updated transitions
      if (transitions.length > 0) {
        const transToInsert = transitions.map(t => ({
          parent_group,
          transaction_type,
          from_status: t.from_status,
          to_status: t.to_status,
          allowed_actor: t.allowed_actor,
        }));

        const { error: transError } = await supabase
          .from('category_status_transitions')
          .insert(transToInsert);

        if (transError) throw transError;
      }

      toast.success('Workflow saved successfully');
      await loadWorkflows();
      setSelectedWorkflow(null);
    } catch (error: any) {
      toast.error(`Failed to save: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const formatName = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  if (isLoading) {
    return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Workflow Manager</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Configure status flows and transition rules for orders and bookings</p>
        </div>
      </div>

      <div className="space-y-2">
        {workflows.map(wf => (
          <Card
            key={`${wf.parent_group}::${wf.transaction_type}`}
            className="border-0 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-md)] transition-all cursor-pointer rounded-2xl"
            onClick={() => openEditor(wf)}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                  <GitBranch size={16} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold">{formatName(wf.parent_group)}</p>
                  <p className="text-xs text-muted-foreground">{formatName(wf.transaction_type)} · {wf.step_count} steps</p>
                </div>
              </div>
              <ChevronRight size={16} className="text-muted-foreground" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Workflow Editor Sheet */}
      <Sheet open={!!selectedWorkflow} onOpenChange={(open) => !open && setSelectedWorkflow(null)}>
        <SheetContent side="bottom" className="h-[90dvh] p-0 rounded-t-2xl">
          <SheetHeader className="px-4 pt-4 pb-3 border-b border-border">
            <SheetTitle className="text-base font-bold">
              {selectedWorkflow && `${formatName(selectedWorkflow.parent_group)} — ${formatName(selectedWorkflow.transaction_type)}`}
            </SheetTitle>
          </SheetHeader>

          <ScrollArea className="h-[calc(90dvh-120px)]">
            <div className="px-4 py-4 space-y-5">
              {/* Status Steps */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Status Pipeline</p>
                  <Button size="sm" variant="outline" onClick={addStep} className="h-7 text-xs rounded-lg">
                    <Plus size={12} className="mr-1" /> Add Step
                  </Button>
                </div>

                <div className="space-y-2">
                  {editSteps.map((step, index) => (
                    <div key={index} className="bg-muted/40 rounded-xl p-3 space-y-2 border border-border/50">
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col gap-0.5">
                          <button
                            onClick={() => moveStep(index, 'up')}
                            disabled={index === 0}
                            className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-xs"
                          >▲</button>
                          <button
                            onClick={() => moveStep(index, 'down')}
                            disabled={index === editSteps.length - 1}
                            className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-xs"
                          >▼</button>
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground w-5">{index + 1}</span>
                        <Input
                          value={step.status_key}
                          onChange={(e) => updateStep(index, 'status_key', e.target.value)}
                          placeholder="status_key"
                          className="h-8 text-xs font-mono flex-1 rounded-lg"
                        />
                        <Select value={step.actor} onValueChange={(v) => updateStep(index, 'actor', v)}>
                          <SelectTrigger className="h-8 text-xs w-24 rounded-lg">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ACTORS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <button onClick={() => removeStep(index)} className="text-destructive hover:text-destructive/80">
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          value={step.display_label}
                          onChange={(e) => updateStep(index, 'display_label', e.target.value)}
                          placeholder="Display Label"
                          className="h-7 text-xs rounded-lg"
                        />
                        <Input
                          value={step.color}
                          onChange={(e) => updateStep(index, 'color', e.target.value)}
                          placeholder="Color classes"
                          className="h-7 text-xs rounded-lg"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          value={step.icon}
                          onChange={(e) => updateStep(index, 'icon', e.target.value)}
                          placeholder="Icon name"
                          className="h-7 text-xs rounded-lg"
                        />
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={step.is_terminal}
                            onCheckedChange={(v) => updateStep(index, 'is_terminal', !!v)}
                            id={`terminal-${index}`}
                          />
                          <label htmlFor={`terminal-${index}`} className="text-xs text-muted-foreground">Terminal</label>
                        </div>
                      </div>
                      <Input
                        value={step.buyer_hint}
                        onChange={(e) => updateStep(index, 'buyer_hint', e.target.value)}
                        placeholder="Buyer hint message"
                        className="h-7 text-xs rounded-lg"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Transitions */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">Transition Rules</p>
                <p className="text-[11px] text-muted-foreground mb-3">For each status, define which actors can transition to which next statuses.</p>

                <div className="space-y-3">
                  {editSteps.filter(s => !s.is_terminal).map(fromStep => {
                    const possibleTargets = editSteps.filter(s => s.status_key !== fromStep.status_key);
                    return (
                      <div key={fromStep.status_key} className="bg-muted/30 rounded-xl p-3 border border-border/40">
                        <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px] font-mono">{fromStep.status_key || '(unnamed)'}</Badge>
                          <ArrowRight size={12} className="text-muted-foreground" />
                        </p>
                        {fromStep.status_key && (
                          <div className="space-y-1.5">
                            {possibleTargets.map(toStep => {
                              if (!toStep.status_key) return null;
                              const hasAny = ACTORS.some(a => hasTransition(fromStep.status_key, toStep.status_key, a));
                              return (
                                <div key={toStep.status_key} className={cn(
                                  "flex items-center gap-2 px-2 py-1.5 rounded-lg",
                                  hasAny ? "bg-primary/5" : "bg-transparent"
                                )}>
                                  <span className="text-[11px] font-mono text-muted-foreground w-24 truncate">{toStep.status_key}</span>
                                  <div className="flex gap-1.5 flex-wrap">
                                    {ACTORS.map(actor => (
                                      <button
                                        key={actor}
                                        onClick={() => toggleTransition(fromStep.status_key, toStep.status_key, actor)}
                                        className={cn(
                                          "text-[10px] px-1.5 py-0.5 rounded-md border transition-all",
                                          hasTransition(fromStep.status_key, toStep.status_key, actor)
                                            ? "bg-primary text-primary-foreground border-primary"
                                            : "bg-background text-muted-foreground border-border hover:border-primary/50"
                                        )}
                                      >
                                        {actor}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </ScrollArea>

          {/* Save Bar */}
          <div className="absolute bottom-0 left-0 right-0 border-t border-border bg-background px-4 py-3 pb-[env(safe-area-inset-bottom)]">
            <Button
              className="w-full h-11 rounded-xl font-semibold"
              onClick={saveWorkflow}
              disabled={isSaving}
            >
              <Save size={15} className="mr-2" />
              {isSaving ? 'Saving...' : 'Save Workflow'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

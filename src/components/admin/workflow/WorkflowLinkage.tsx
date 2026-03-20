import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Link2 } from 'lucide-react';
import { useWorkflowMap, getWorkflowKeyFromMap } from '@/hooks/useWorkflowMap';
import { getWorkflowKey } from '@/lib/listingTypeWorkflowMap';

interface Props {
  parentGroup: string;
  transactionType: string;
}

export function WorkflowLinkage({ parentGroup, transactionType }: Props) {
  const [categories, setCategories] = useState<{ category: string; display_name: string; transaction_type: string }[]>([]);
  const { data: workflowMap } = useWorkflowMap();

  useEffect(() => {
    supabase
      .from('category_config')
      .select('category, display_name, transaction_type')
      .eq('parent_group', parentGroup)
      .then(({ data }) => {
        // Filter using DB-driven map, falling back to static map
        const linked = (data || []).filter(c => {
          const entry = getWorkflowKeyFromMap(workflowMap, c.transaction_type || 'cart_purchase');
          const resolved = entry?.workflow_key ?? getWorkflowKey(c.transaction_type || 'cart_purchase');
          return resolved === transactionType;
        });
        setCategories(linked);
      });
  }, [parentGroup, transactionType, workflowMap]);

  if (categories.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-1">
      <Link2 size={10} className="text-muted-foreground shrink-0" />
      {categories.map(c => (
        <Badge key={c.category} variant="secondary" className="text-[9px] h-4 px-1.5 font-normal">
          {c.display_name}
        </Badge>
      ))}
    </div>
  );
}

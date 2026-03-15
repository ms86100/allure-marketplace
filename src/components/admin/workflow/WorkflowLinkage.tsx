import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Link2 } from 'lucide-react';

interface Props {
  parentGroup: string;
  transactionType: string;
}

export function WorkflowLinkage({ parentGroup, transactionType }: Props) {
  const [categories, setCategories] = useState<{ category: string; display_name: string }[]>([]);

  useEffect(() => {
    supabase
      .from('category_config')
      .select('category, display_name')
      .eq('parent_group', parentGroup)
      .eq('transaction_type', transactionType)
      .then(({ data }) => setCategories(data || []));
  }, [parentGroup, transactionType]);

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

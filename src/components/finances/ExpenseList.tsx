import { format } from 'date-fns';
import { Flag, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Expense {
  id: string;
  category: string;
  title: string;
  amount: number;
  vendor_name: string | null;
  invoice_url: string | null;
  expense_date: string;
  created_at: string;
}

interface Props {
  expenses: Expense[];
  onFlag?: (expenseId: string) => void;
  showFlag?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  security: 'Security',
  water: 'Water',
  electricity: 'Electricity',
  repairs: 'Repairs',
  gardening: 'Gardening',
  lift_maintenance: 'Lift Maintenance',
  staff_salaries: 'Staff Salaries',
  miscellaneous: 'Miscellaneous',
};

export function ExpenseList({ expenses, onFlag, showFlag = true }: Props) {
  if (expenses.length === 0) {
    return <p className="text-center text-sm text-muted-foreground py-6">No expenses in this category</p>;
  }

  return (
    <div className="space-y-2">
      {expenses.map(exp => (
        <div key={exp.id} className="bg-card rounded-xl border border-border p-3 space-y-1">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium">{exp.title}</p>
              <p className="text-xs text-muted-foreground">
                {exp.vendor_name && `${exp.vendor_name} · `}
                {format(new Date(exp.expense_date), 'MMM d, yyyy')}
              </p>
            </div>
            <p className="text-sm font-bold">₹{Number(exp.amount).toLocaleString()}</p>
          </div>
          <div className="flex items-center gap-2">
            {exp.invoice_url && (
              <a href={exp.invoice_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1">
                <ExternalLink size={10} /> Invoice
              </a>
            )}
            {showFlag && onFlag && (
              <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground gap-1 ml-auto" onClick={() => onFlag(exp.id)}>
                <Flag size={10} /> Flag
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

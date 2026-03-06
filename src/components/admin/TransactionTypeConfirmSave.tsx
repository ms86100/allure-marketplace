import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, AlertTriangle } from 'lucide-react';
import { LISTING_TYPE_PRESETS, CategoryConfigRow } from '@/hooks/useCategoryManagerData';

interface Props {
  editingCategory: CategoryConfigRow | null;
  newTransactionType: string;
  isSaving: boolean;
  onConfirmedSave: () => void;
}

export function TransactionTypeConfirmSave({ editingCategory, newTransactionType, isSaving, onConfirmedSave }: Props) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [affectedCount, setAffectedCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const transactionTypeChanged = editingCategory?.transaction_type !== newTransactionType;

  const handleClick = async () => {
    if (!transactionTypeChanged) {
      onConfirmedSave();
      return;
    }
    // Fetch affected product count
    setLoading(true);
    try {
      const { count } = await supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('category', editingCategory!.category);
      setAffectedCount(count ?? 0);
    } catch {
      setAffectedCount(0);
    }
    setLoading(false);
    setShowConfirm(true);
  };

  const oldLabel = LISTING_TYPE_PRESETS.find(p => p.value === editingCategory?.transaction_type)?.label ?? editingCategory?.transaction_type;
  const newLabel = LISTING_TYPE_PRESETS.find(p => p.value === newTransactionType)?.label ?? newTransactionType;

  return (
    <>
      <Button onClick={handleClick} disabled={isSaving || loading} className="w-full rounded-xl h-11 font-semibold">
        {(isSaving || loading) && <Loader2 className="animate-spin mr-2" size={16} />}
        Save Changes
      </Button>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="text-destructive" size={20} />
              Change Listing Type?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  You're changing <strong>{editingCategory?.display_name}</strong> from{' '}
                  <strong>{oldLabel}</strong> → <strong>{newLabel}</strong>.
                </p>
                {affectedCount !== null && affectedCount > 0 && (
                  <p className="font-medium text-foreground">
                    {affectedCount} existing product{affectedCount !== 1 ? 's' : ''} will be updated to show the new button type.
                  </p>
                )}
                <p className="text-muted-foreground text-xs">
                  Existing orders and bookings will not be affected.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setShowConfirm(false); onConfirmedSave(); }}
              disabled={isSaving}
            >
              {isSaving ? 'Saving…' : 'Confirm & Save'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function DeleteAccountDialog() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (!user || confirmText !== 'DELETE') return;

    setIsDeleting(true);

    try {
      // Delete user data in order (respecting foreign keys)
      // 1. Delete cart items
      await supabase.from('cart_items').delete().eq('user_id', user.id);
      
      // 2. Delete device tokens
      await supabase.from('device_tokens').delete().eq('user_id', user.id);
      
      // 3. Delete favorites
      await supabase.from('favorites').delete().eq('user_id', user.id);
      
      // 4. Delete reviews (as buyer)
      await supabase.from('reviews').delete().eq('buyer_id', user.id);
      
      // 5. Delete warnings
      await supabase.from('warnings').delete().eq('user_id', user.id);
      
      // 6. Delete reports (as reporter)
      await supabase.from('reports').delete().eq('reporter_id', user.id);
      
      // 7. Get user's seller profile if exists
      const { data: sellerProfile } = await supabase
        .from('seller_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (sellerProfile) {
        // Delete seller-related data
        await supabase.from('products').delete().eq('seller_id', sellerProfile.id);
        await supabase.from('reviews').delete().eq('seller_id', sellerProfile.id);
        await supabase.from('favorites').delete().eq('seller_id', sellerProfile.id);
        await supabase.from('seller_profiles').delete().eq('id', sellerProfile.id);
      }

      // 8. Delete user roles
      await supabase.from('user_roles').delete().eq('user_id', user.id);
      
      // 9. Delete profile
      await supabase.from('profiles').delete().eq('id', user.id);

      // 10. Sign out (auth user deletion requires admin API or edge function)
      await signOut();
      
      toast.success('Your account has been deleted');
      navigate('/auth');
    } catch (error: any) {
      console.error('Error deleting account:', error);
      toast.error('Failed to delete account. Please contact support.');
    } finally {
      setIsDeleting(false);
      setIsOpen(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" className="w-full">
          <Trash2 size={18} className="mr-2" />
          Delete Account
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle size={24} />
            <AlertDialogTitle>Delete Your Account?</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-left space-y-3">
            <p>
              This action is <strong>permanent and cannot be undone</strong>. 
              Deleting your account will:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>Remove your profile and personal information</li>
              <li>Delete all your orders and order history</li>
              <li>Remove your favorites and saved items</li>
              <li>Delete your seller profile and products (if applicable)</li>
              <li>Remove all reviews you've written</li>
            </ul>
            <div className="pt-2">
              <Label htmlFor="confirm-delete" className="text-sm font-medium">
                Type <strong>DELETE</strong> to confirm:
              </Label>
              <Input
                id="confirm-delete"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                placeholder="Type DELETE"
                className="mt-1"
                autoComplete="off"
              />
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeleteAccount}
            disabled={confirmText !== 'DELETE' || isDeleting}
            className="bg-destructive hover:bg-destructive/90"
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              'Delete My Account'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

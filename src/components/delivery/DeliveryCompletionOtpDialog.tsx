import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface DeliveryCompletionOtpDialogProps {
  orderId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onVerified?: () => void;
  trigger?: React.ReactNode;
}

export function DeliveryCompletionOtpDialog({ orderId, open, onOpenChange, onVerified, trigger }: DeliveryCompletionOtpDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [otp, setOtp] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const controlledOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const canSubmit = useMemo(() => otp.trim().length === 4 && !isSubmitting, [otp, isSubmitting]);

  const handleVerify = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase.rpc('verify_delivery_otp_and_complete', {
        _order_id: orderId,
        _delivery_code: otp.trim(),
      });

      if (error) throw error;

      toast.success('Delivery verified and completed');
      setOtp('');
      setOpen(false);
      onVerified?.();
    } catch (error: any) {
      toast.error(error?.message || 'Invalid delivery code');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={controlledOpen} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-primary" />
            Verify delivery OTP
          </DialogTitle>
          <DialogDescription>
            Ask the buyer for the 4-digit delivery code before marking this order delivered.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 flex justify-center">
          <InputOTP maxLength={4} value={otp} onChange={setOtp} autoFocus>
            <InputOTPGroup className="gap-3">
              <InputOTPSlot index={0} className="w-12 h-12 rounded-xl border-2" />
              <InputOTPSlot index={1} className="w-12 h-12 rounded-xl border-2" />
              <InputOTPSlot index={2} className="w-12 h-12 rounded-xl border-2" />
              <InputOTPSlot index={3} className="w-12 h-12 rounded-xl border-2" />
            </InputOTPGroup>
          </InputOTP>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>Cancel</Button>
          <Button onClick={handleVerify} disabled={!canSubmit} className="gap-2">
            {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : null}
            {isSubmitting ? 'Verifying...' : 'Complete Delivery'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

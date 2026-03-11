import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { format, isBefore, startOfToday } from 'date-fns';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { TimeSlotPicker } from './TimeSlotPicker';
import { ServiceAddonPicker, SelectedAddon } from './ServiceAddonPicker';
import { RecurringBookingSelector, RecurringConfig } from './RecurringBookingSelector';
import { useAuth } from '@/contexts/AuthContext';
import { useCategoryBehavior } from '@/hooks/useCategoryBehavior';
import { useServiceSlots, slotsToPickerFormat, findSlot } from '@/hooks/useServiceSlots';
import { supabase } from '@/integrations/supabase/client';
import { useCurrency } from '@/hooks/useCurrency';
import { toast } from 'sonner';
import { Clock, MapPin, MessageCircle, Loader2 } from 'lucide-react';
import type { ServiceCategory } from '@/types/categories';

interface ServiceBookingFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  sellerId: string;
  sellerName: string;
  price: number;
  category: string;
  imageUrl?: string | null;
  durationMinutes?: number;
  locationType?: string;
  subcategoryId?: string | null;
}

const MAX_NOTES_LENGTH = 500;
const MAX_ADDRESS_LENGTH = 300;

export function ServiceBookingFlow({
  open, onOpenChange, productId, productName, sellerId, sellerName,
  price, category, imageUrl, durationMinutes, locationType, subcategoryId,
}: ServiceBookingFlowProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { formatPrice } = useCurrency();
  const queryClient = useQueryClient();
  const { config } = useCategoryBehavior(category as ServiceCategory);

  const isSubmittingRef = useRef(false);

  const { data: serviceSlots = [], refetch: refetchSlots } = useServiceSlots(open ? productId : undefined);
  const availableSlots = useMemo(
    () => slotsToPickerFormat(serviceSlots),
    [serviceSlots]
  );

  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState<string | undefined>();
  const [notes, setNotes] = useState('');
  const [buyerAddress, setBuyerAddress] = useState('');
  const [selectedAddons, setSelectedAddons] = useState<SelectedAddon[]>([]);
  const [recurringConfig, setRecurringConfig] = useState<RecurringConfig>({ enabled: false, frequency: 'weekly' });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedDate(undefined);
      setSelectedTime(undefined);
      setNotes('');
      setBuyerAddress('');
      setSelectedAddons([]);
      setRecurringConfig({ enabled: false, frequency: 'weekly' });
      setIsLoading(false);
      isSubmittingRef.current = false;
    }
  }, [open]);

  const supportsAddons = (config as any)?.supports_addons ?? false;
  const supportsRecurring = (config as any)?.supports_recurring ?? false;
  const needsAddress = locationType === 'home_visit' || locationType === 'at_buyer';

  const addonTotal = selectedAddons.reduce((s, a) => s + a.price, 0);
  const totalAmount = price + addonTotal;

  const isDateValid = selectedDate && !isBefore(selectedDate, startOfToday());
  const isValid = isDateValid && selectedTime && (!needsAddress || buyerAddress.trim().length > 0);

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    setSelectedTime(undefined);
  };

  const handleConfirm = async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    if (!user) {
      toast.error('Please sign in first');
      navigate('/auth');
      isSubmittingRef.current = false;
      return;
    }
    if (!selectedDate || !selectedTime || !isDateValid) {
      toast.error('Please select a valid date and time');
      isSubmittingRef.current = false;
      return;
    }
    if (needsAddress && !buyerAddress.trim()) {
      toast.error('Please enter your address for home visit');
      isSubmittingRef.current = false;
      return;
    }

    setIsLoading(true);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');

      const { data: freshSlots } = await supabase
        .from('service_slots')
        .select('*')
        .eq('product_id', productId)
        .eq('slot_date', dateStr)
        .eq('start_time', selectedTime)
        .eq('is_blocked', false)
        .maybeSingle();

      if (!freshSlots || freshSlots.booked_count >= freshSlots.max_capacity) {
        toast.error('Selected slot is no longer available. Refreshing...');
        refetchSlots();
        setIsLoading(false);
        isSubmittingRef.current = false;
        return;
      }

      const slot = freshSlots;

      const { data: sellerProfile } = await supabase
        .from('seller_profiles')
        .select('user_id')
        .eq('id', sellerId)
        .single();

      if (sellerProfile?.user_id === user.id) {
        toast.error('You cannot book your own service');
        setIsLoading(false);
        isSubmittingRef.current = false;
        return;
      }

      if (price <= 0) {
        toast.error('Invalid service price');
        setIsLoading(false);
        isSubmittingRef.current = false;
        return;
      }

      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({
          buyer_id: user.id,
          seller_id: sellerId,
          total_amount: totalAmount,
          order_type: 'booking',
          status: 'requested',
          payment_type: 'cod',
          payment_status: 'pending',
          notes: notes.trim().slice(0, MAX_NOTES_LENGTH) || null,
        })
        .select('id')
        .single();

      if (orderErr || !order) throw orderErr || new Error('Failed to create order');

      const { error: itemErr } = await supabase.from('order_items').insert({
        order_id: order.id,
        product_id: productId,
        product_name: productName,
        quantity: 1,
        unit_price: price,
      });

      if (itemErr) {
        await supabase.from('orders').delete().eq('id', order.id);
        throw itemErr;
      }

      const resolvedLocationType = locationType || 'at_seller';
      const { data: bookResult, error: bookErr } = await supabase
        .rpc('book_service_slot', {
          _slot_id: slot.id,
          _buyer_id: user.id,
          _seller_id: sellerId,
          _product_id: productId,
          _order_id: order.id,
          _booking_date: dateStr,
          _start_time: slot.start_time,
          _end_time: slot.end_time,
          _location_type: resolvedLocationType,
          _buyer_address: buyerAddress.trim().slice(0, MAX_ADDRESS_LENGTH) || null,
        });

      if (bookErr) throw bookErr;

      const result = bookResult as any;
      if (!result?.success) {
        await supabase.from('order_items').delete().eq('order_id', order.id);
        await supabase.from('orders').delete().eq('id', order.id);
        toast.error(result?.error || 'Failed to book slot');
        refetchSlots();
        setIsLoading(false);
        isSubmittingRef.current = false;
        return;
      }

      const bookingId = result.booking_id;

      if (selectedAddons.length > 0 && bookingId) {
        const { error: addonErr } = await supabase.from('service_booking_addons').insert(
          selectedAddons.map(a => ({
            booking_id: bookingId,
            addon_id: a.id,
            addon_name: a.name || 'Add-on',
            addon_price: a.price,
          }))
        );
        if (addonErr) {
          console.error('Failed to save addons:', addonErr);
          toast.error('Your booking was created, but add-ons could not be saved. Please contact the seller.');
        }
      }

      if (recurringConfig.enabled && bookingId) {
        const dayOfWeek = selectedDate ? selectedDate.getDay() : 0;
        const { error: recurErr } = await supabase.from('service_recurring_configs').insert({
          booking_id: bookingId,
          buyer_id: user.id,
          seller_id: sellerId,
          product_id: productId,
          frequency: recurringConfig.frequency,
          preferred_time: slot.start_time,
          start_date: dateStr,
          end_date: recurringConfig.endDate || null,
          day_of_week: dayOfWeek,
        });
        if (recurErr) {
          console.error('Failed to save recurring config:', recurErr);
          toast.info('Booking created, but recurring schedule failed. Please set it up again.');
        }
      }

      if (sellerProfile?.user_id) {
        await supabase.from('notification_queue').insert({
          user_id: sellerProfile.user_id,
          type: 'order',
          title: '🆕 New Booking Request',
          body: `${user.user_metadata?.name || 'A customer'} requested ${productName} on ${dateStr} at ${slot.start_time.slice(0, 5)}`,
          reference_path: `/orders/${order.id}`,
          payload: { orderId: order.id, status: 'requested', type: 'order' },
        });
      }

      supabase.functions.invoke('process-notification-queue').catch(() => {});

      queryClient.invalidateQueries({ queryKey: ['service-slots', productId] });
      queryClient.invalidateQueries({ queryKey: ['seller-service-bookings'] });
      window.dispatchEvent(new Event('booking-changed'));

      toast.success('Booking request sent!');
      onOpenChange(false);
      navigate(`/orders/${order.id}`);
    } catch (err: any) {
      console.error('Service booking error:', err);
      toast.error('Failed to create booking. Please try again.');
    } finally {
      setIsLoading(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
        <SheetHeader className="pb-4">
          <SheetTitle>Book Service</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 overflow-y-auto pb-20">
          {/* Summary */}
          <div className="flex gap-3 p-3 bg-muted rounded-lg">
            {imageUrl && (
              <img src={imageUrl} alt={productName} className="w-16 h-16 rounded-lg object-cover" />
            )}
            <div className="flex-1">
              <h4 className="font-medium">{productName}</h4>
              <p className="text-xs text-muted-foreground">{sellerName}</p>
              <p className="text-lg font-bold text-primary tabular-nums">{formatPrice(price)}</p>
              {durationMinutes && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock size={10} />{durationMinutes} min session
                </p>
              )}
            </div>
          </div>

          {/* Time Slot Picker */}
          <TimeSlotPicker
            selectedDate={selectedDate}
            selectedTime={selectedTime}
            onDateSelect={handleDateSelect}
            onTimeSelect={setSelectedTime}
            serviceDuration={durationMinutes}
            availableSlots={availableSlots}
          />

          {/* Address for home visit */}
          {needsAddress && (
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <MapPin size={14} />Your Address (required for home visit)
              </label>
              <Input
                placeholder="Enter your full address..."
                value={buyerAddress}
                onChange={(e) => setBuyerAddress(e.target.value.slice(0, MAX_ADDRESS_LENGTH))}
                maxLength={MAX_ADDRESS_LENGTH}
              />
              {needsAddress && buyerAddress.trim().length === 0 && (
                <p className="text-[10px] text-destructive">Address is required for home visit services</p>
              )}
            </div>
          )}

          {/* Add-ons */}
          {supportsAddons && (
            <ServiceAddonPicker
              productId={productId}
              selectedAddons={selectedAddons}
              onAddonsChange={setSelectedAddons}
            />
          )}

          {/* Recurring */}
          {supportsRecurring && selectedDate && selectedTime && (
            <RecurringBookingSelector
              config={recurringConfig}
              onChange={setRecurringConfig}
            />
          )}

          {/* Notes */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <MessageCircle size={14} />Special Requests (Optional)
            </label>
            <Textarea
              placeholder="Any specific requirements or requests..."
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, MAX_NOTES_LENGTH))}
              rows={3}
              maxLength={MAX_NOTES_LENGTH}
            />
            <p className="text-[10px] text-muted-foreground text-right">{notes.length}/{MAX_NOTES_LENGTH}</p>
          </div>
        </div>

        {/* Confirm */}
        <div className="absolute bottom-0 left-0 right-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-background border-t">
          <Button className="w-full" size="lg" disabled={!isValid || isLoading} onClick={handleConfirm}>
            {isLoading && <Loader2 className="animate-spin mr-2" size={18} />}
            Confirm Booking{addonTotal > 0 ? ` · ${formatPrice(totalAmount)}` : ` · ${formatPrice(price)}`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

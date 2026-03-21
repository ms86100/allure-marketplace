import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { format, isBefore, startOfToday } from 'date-fns';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { TimeSlotPicker } from './TimeSlotPicker';
import { ServiceAddonPicker, SelectedAddon } from './ServiceAddonPicker';
import { RecurringBookingSelector, RecurringConfig } from './RecurringBookingSelector';
import { useAuth } from '@/contexts/AuthContext';
import { useCategoryBehavior } from '@/hooks/useCategoryBehavior';
import { useServiceSlots, slotsToPickerFormat, findSlot } from '@/hooks/useServiceSlots';
import { useSubcategories } from '@/hooks/useSubcategories';
import { supabase } from '@/integrations/supabase/client';
import { useCurrency } from '@/hooks/useCurrency';
import { toast } from 'sonner';
import { Clock, MapPin, MessageCircle, Loader2, ArrowLeft, Calendar, User, Sparkles } from 'lucide-react';
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

type BookingStep = 'select' | 'review';

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

  // Bug #2/#3: Fetch service_listings to get correct location_type and duration_minutes
  const { data: serviceListing } = useQuery({
    queryKey: ['service-listing', productId],
    queryFn: async () => {
      const { data } = await supabase
        .from('service_listings')
        .select('location_type, duration_minutes')
        .eq('product_id', productId)
        .maybeSingle();
      return data;
    },
    enabled: open && !!productId,
  });

  const resolvedDuration = serviceListing?.duration_minutes ?? durationMinutes;
  const resolvedLocation = serviceListing?.location_type ?? locationType;

  const { data: serviceSlots = [], refetch: refetchSlots } = useServiceSlots(open ? productId : undefined);
  const availableSlots = useMemo(
    () => slotsToPickerFormat(serviceSlots),
    [serviceSlots]
  );

  const [step, setStep] = useState<BookingStep>('select');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState<string | undefined>();
  const [notes, setNotes] = useState('');
  const [buyerAddress, setBuyerAddress] = useState('');
  const [selectedAddons, setSelectedAddons] = useState<SelectedAddon[]>([]);
  const [recurringConfig, setRecurringConfig] = useState<RecurringConfig>({ enabled: false, frequency: 'weekly' });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setStep('select');
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

  const { data: subcategories = [] } = useSubcategories(config?.id || null);
  const activeSubcategory = useMemo(() => {
    if (!subcategoryId) return null;
    return subcategories.find(s => s.id === subcategoryId) || null;
  }, [subcategoryId, subcategories]);

  const supportsAddons = activeSubcategory?.supports_addons ?? config?.supportsAddons ?? false;
  const supportsRecurring = activeSubcategory?.supports_recurring ?? config?.supportsRecurring ?? false;
  const needsAddress = locationType === 'home_visit' || locationType === 'at_buyer';

  const addonTotal = selectedAddons.reduce((s, a) => s + a.price, 0);
  const totalAmount = price + addonTotal;

  const isDateValid = selectedDate && !isBefore(selectedDate, startOfToday());
  const isSelectValid = isDateValid && selectedTime && (!needsAddress || buyerAddress.trim().length > 0);

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    setSelectedTime(undefined);
  };

  const handleContinueToReview = () => {
    if (!isSelectValid) return;
    setStep('review');
  };

  const handleBackToSelect = () => {
    setStep('select');
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
          delivery_address: needsAddress && buyerAddress.trim() ? buyerAddress.trim().slice(0, MAX_ADDRESS_LENGTH) : null,
          fulfillment_type: locationType || 'at_seller',
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
        // Bug 13 fix: Use buyer_cancel_order RPC instead of client-side delete (RLS blocks DELETE)
        try { await supabase.rpc('buyer_cancel_order', { _order_id: order.id, _reason: 'booking_setup_failed' }); } catch {}
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
        // Bug 13 fix: Use RPC for cleanup instead of client-side delete
        try { await supabase.rpc('buyer_cancel_order', { _order_id: order.id, _reason: 'slot_booking_failed' }); } catch {}
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
      queryClient.invalidateQueries({ queryKey: ['buyer-service-bookings'] });
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

  const resolvedLocationType = locationType || 'at_seller';
  const locationLabel = resolvedLocationType === 'home_visit' || resolvedLocationType === 'at_buyer'
    ? 'Home Visit'
    : resolvedLocationType === 'online'
    ? 'Online'
    : 'At Seller Location';

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-[85vh]">
        <DrawerHeader className="pb-4">
          <DrawerTitle className="flex items-center gap-2">
            {step === 'review' && (
              <Button variant="ghost" size="icon" className="h-7 w-7 -ml-1" onClick={handleBackToSelect}>
                <ArrowLeft size={16} />
              </Button>
            )}
            {step === 'select' ? 'Book Service' : 'Review Booking'}
          </DrawerTitle>
        </DrawerHeader>

        <div className="space-y-6 overflow-y-auto pb-20">
          {step === 'select' && (
            <>
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
            </>
          )}

          {step === 'review' && selectedDate && selectedTime && (
            <div className="space-y-4">
              {/* Service info */}
              <div className="flex gap-3 p-3 bg-muted rounded-lg">
                {imageUrl && (
                  <img src={imageUrl} alt={productName} className="w-16 h-16 rounded-lg object-cover" />
                )}
                <div className="flex-1">
                  <h4 className="font-medium">{productName}</h4>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <User size={10} />{sellerName}
                  </p>
                </div>
              </div>

              {/* Date & Time */}
              <div className="p-3 rounded-lg border border-border space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar size={14} className="text-primary" />
                  <span className="font-medium">{format(selectedDate, 'EEEE, MMMM d, yyyy')}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock size={14} className="text-primary" />
                  <span>{selectedTime?.slice(0, 5)}</span>
                  {durationMinutes && (
                    <span className="text-muted-foreground">· {durationMinutes} min</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <MapPin size={14} className="text-primary" />
                  <span>{locationLabel}</span>
                </div>
                {needsAddress && buyerAddress.trim() && (
                  <p className="text-xs text-muted-foreground pl-5">{buyerAddress}</p>
                )}
              </div>

              {/* Add-ons */}
              {selectedAddons.length > 0 && (
                <div className="p-3 rounded-lg border border-border space-y-1.5">
                  <p className="text-xs font-medium flex items-center gap-1 text-muted-foreground">
                    <Sparkles size={10} className="text-primary" />Add-ons
                  </p>
                  {selectedAddons.map((addon) => (
                    <div key={addon.id} className="flex items-center justify-between text-xs">
                      <span>{addon.name}</span>
                      <span className="font-medium tabular-nums">{formatPrice(addon.price)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Notes */}
              {notes.trim() && (
                <div className="p-3 rounded-lg border border-border">
                  <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <MessageCircle size={10} />Notes
                  </p>
                  <p className="text-sm">{notes}</p>
                </div>
              )}

              {/* Recurring */}
              {recurringConfig.enabled && (
                <div className="p-3 rounded-lg border border-border">
                  <p className="text-xs text-muted-foreground">
                    Recurring: <span className="font-medium capitalize">{recurringConfig.frequency}</span>
                    {recurringConfig.endDate && ` until ${recurringConfig.endDate}`}
                  </p>
                </div>
              )}

              {/* Price breakdown */}
              <div className="p-3 rounded-lg bg-muted space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span>Service</span>
                  <span className="tabular-nums">{formatPrice(price)}</span>
                </div>
                {addonTotal > 0 && (
                  <div className="flex justify-between text-sm">
                    <span>Add-ons</span>
                    <span className="tabular-nums">{formatPrice(addonTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold pt-1.5 border-t border-border">
                  <span>Total</span>
                  <span className="text-primary tabular-nums">{formatPrice(totalAmount)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom CTA */}
        <div className="absolute bottom-0 left-0 right-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-background border-t">
          {step === 'select' ? (
            <Button className="w-full" size="lg" disabled={!isSelectValid} onClick={handleContinueToReview}>
              Continue · {formatPrice(totalAmount)}
            </Button>
          ) : (
            <Button className="w-full" size="lg" disabled={isLoading} onClick={handleConfirm}>
              {isLoading && <Loader2 className="animate-spin mr-2" size={18} />}
              Confirm Booking · {formatPrice(totalAmount)}
            </Button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

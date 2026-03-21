export interface FlowStep {
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
  notify_buyer: boolean;
  notification_title: string;
  notification_body: string;
  notification_action: string;
  notify_seller: boolean;
  seller_notification_title: string;
  seller_notification_body: string;
}

export interface Transition {
  from_status: string;
  to_status: string;
  allowed_actor: string;
}

export interface WorkflowGroup {
  parent_group: string;
  transaction_type: string;
  steps: FlowStep[];
  step_count: number;
}

export const ACTORS = ['buyer', 'seller', 'delivery', 'system', 'admin'];

/** Primary workflow types shown in admin UI (mapped from UI buttons) */
export const TRANSACTION_TYPES = [
  { value: 'cart_purchase', label: 'Cart Purchase' },
  { value: 'service_booking', label: 'Service Booking' },
  { value: 'request_service', label: 'Request Service' },
  { value: 'contact_enquiry', label: 'Contact Enquiry' },
];

/** Fulfillment sub-variants auto-derived at runtime — hidden from admin UI */
export const FULFILLMENT_VARIANTS = ['seller_delivery', 'self_fulfillment'];

export const formatName = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

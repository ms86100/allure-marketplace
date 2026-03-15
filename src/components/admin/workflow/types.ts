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

export const TRANSACTION_TYPES = [
  { value: 'cart_purchase', label: 'Cart Purchase' },
  { value: 'self_fulfillment', label: 'Self Fulfillment' },
  { value: 'service_booking', label: 'Service Booking' },
  { value: 'request_service', label: 'Request Service' },
  { value: 'book_slot', label: 'Book Slot' },
];

export const formatName = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

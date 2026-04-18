// @ts-nocheck
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';
import { toast } from 'sonner';

export interface SupportTicket {
  id: string;
  order_id: string;
  buyer_id: string;
  seller_id: string;
  society_id: string | null;
  issue_type: string;
  issue_subtype: string | null;
  description: string;
  evidence_urls: string[];
  status: string;
  resolution_type: string | null;
  resolution_note: string | null;
  sla_deadline: string | null;
  sla_breached: boolean;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupportTicketMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_type: string;
  message_text: string;
  action_type: string | null;
  metadata: any;
  created_at: string;
}

export interface ResolutionResult {
  resolved: boolean;
  resolution_type: string | null;
  resolution_note: string | null;
  order_status: string;
  seller_id: string;
  buyer_id: string;
  society_id: string | null;
  error?: string;
}

// Evaluate resolution rules BEFORE ticket creation
export function useEvaluateResolution() {
  return useMutation({
    mutationFn: async ({ orderId, issueType, issueSubtype }: { orderId: string; issueType: string; issueSubtype?: string }) => {
      const { data, error } = await supabase.rpc('fn_evaluate_support_resolution', {
        p_order_id: orderId,
        p_issue_type: issueType,
        p_issue_subtype: issueSubtype || null,
      });
      if (error) throw error;
      return data as ResolutionResult;
    },
  });
}

// Create ticket (only when rule engine couldn't auto-resolve)
export function useCreateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ticket: {
      order_id: string;
      buyer_id: string;
      seller_id: string;
      society_id?: string | null;
      issue_type: string;
      issue_subtype?: string | null;
      description: string;
      evidence_urls?: string[];
    }) => {
      const slaDeadline = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2h SLA
      const { data, error } = await supabase
        .from('support_tickets')
        .insert({
          ...ticket,
          status: 'seller_pending',
          sla_deadline: slaDeadline,
        })
        .select()
        .single();
      if (error) throw error;

      // Insert system message
      await supabase.from('support_ticket_messages').insert({
        ticket_id: data.id,
        sender_id: ticket.buyer_id,
        sender_type: 'system',
        message_text: `Support ticket created: ${ticket.issue_type.replace(/_/g, ' ')}. ${ticket.description}`,
      });

      // Notify seller
      await supabase.from('notification_queue').insert({
        user_id: ticket.seller_id,
        title: 'New support ticket',
        body: `A customer reported: ${ticket.issue_type.replace(/_/g, ' ')}`,
        action_type: 'support_ticket',
        action_id: data.id,
        priority: 'high',
      });

      return data as SupportTicket;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
    },
  });
}

// Buyer's tickets
export function useMyTickets() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['support-tickets', 'buyer', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('buyer_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as SupportTicket[];
    },
    enabled: !!user?.id,
  });
}

// Seller's tickets
export function useSellerTickets(sellerId?: string) {
  return useQuery({
    queryKey: ['support-tickets', 'seller', sellerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('seller_id', sellerId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as SupportTicket[];
    },
    enabled: !!sellerId,
  });
}

// Unified support items: support_tickets + refund_requests for a seller
export interface UnifiedSupportItem {
  kind: 'ticket' | 'refund';
  id: string;
  source_id: string; // ticket id or refund id
  order_id: string;
  status: string; // unified: open | seller_pending | resolved | auto_resolved | closed
  raw_status: string;
  issue_type: string;
  description: string;
  created_at: string;
  resolved_at: string | null;
  sla_deadline: string | null;
  sla_breached: boolean;
  amount?: number | null;
  ticket?: SupportTicket;
}

const REFUND_STATUS_MAP: Record<string, string> = {
  requested: 'seller_pending',
  pending: 'seller_pending',
  under_review: 'seller_pending',
  processing: 'seller_pending',
  approved: 'resolved',
  auto_approved: 'resolved',
  processed: 'resolved',
  settled: 'resolved',
  rejected: 'closed',
  cancelled: 'closed',
};

export function useSellerSupportItems(sellerId?: string) {
  return useQuery({
    queryKey: ['support-items', 'seller', sellerId],
    queryFn: async () => {
      const [ticketsRes, refundsRes] = await Promise.all([
        supabase
          .from('support_tickets')
          .select('*')
          .eq('seller_id', sellerId!)
          .order('created_at', { ascending: false }),
        supabase
          .from('refund_requests')
          .select('id, order_id, status, category, reason, amount, created_at, updated_at, orders!inner(seller_id)')
          .eq('orders.seller_id', sellerId!)
          .order('created_at', { ascending: false }),
      ]);

      if (ticketsRes.error) throw ticketsRes.error;
      if (refundsRes.error) throw refundsRes.error;

      const ticketItems: UnifiedSupportItem[] = (ticketsRes.data || []).map((t: any) => ({
        kind: 'ticket',
        id: `ticket-${t.id}`,
        source_id: t.id,
        order_id: t.order_id,
        status: t.status,
        raw_status: t.status,
        issue_type: t.issue_type,
        description: t.description,
        created_at: t.created_at,
        resolved_at: t.resolved_at,
        sla_deadline: t.sla_deadline,
        sla_breached: t.sla_breached,
        ticket: t as SupportTicket,
      }));

      const refundItems: UnifiedSupportItem[] = (refundsRes.data || []).map((r: any) => ({
        kind: 'refund',
        id: `refund-${r.id}`,
        source_id: r.id,
        order_id: r.order_id,
        status: REFUND_STATUS_MAP[r.status] || 'seller_pending',
        raw_status: r.status,
        issue_type: r.category || 'refund_request',
        description: r.reason || 'Refund request',
        created_at: r.created_at,
        resolved_at: ['approved', 'auto_approved', 'processed', 'settled', 'rejected', 'cancelled'].includes(r.status) ? r.updated_at : null,
        sla_deadline: null,
        sla_breached: false,
        amount: r.amount,
      }));

      return [...ticketItems, ...refundItems].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    },
    enabled: !!sellerId,
    staleTime: 30_000,
  });
}

// Ticket for a specific order
export function useOrderTickets(orderId?: string) {
  return useQuery({
    queryKey: ['support-tickets', 'order', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('order_id', orderId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as SupportTicket[];
    },
    enabled: !!orderId,
  });
}

// Ticket messages with realtime
export function useTicketMessages(ticketId?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!ticketId) return;
    const channel = supabase
      .channel(`ticket-messages-${ticketId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'support_ticket_messages',
        filter: `ticket_id=eq.${ticketId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['ticket-messages', ticketId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [ticketId]);

  return useQuery({
    queryKey: ['ticket-messages', ticketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_ticket_messages')
        .select('*')
        .eq('ticket_id', ticketId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as SupportTicketMessage[];
    },
    enabled: !!ticketId,
  });
}

// Send message in a ticket
export function useSendTicketMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (msg: {
      ticket_id: string;
      sender_id: string;
      sender_type: string;
      message_text: string;
      action_type?: string;
    }) => {
      const { data, error } = await supabase
        .from('support_ticket_messages')
        .insert(msg)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['ticket-messages', vars.ticket_id] });
    },
  });
}

// Seller resolve/reject ticket
export function useResolveTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ticketId, action, note }: { ticketId: string; action: 'accept' | 'reject'; note?: string }) => {
      const updates = action === 'accept'
        ? { status: 'resolved', resolution_type: 'manual', resolution_note: note || 'Resolved by seller', resolved_at: new Date().toISOString() }
        : { status: 'open', resolution_note: note || 'Seller requested more info' };

      const { error } = await supabase
        .from('support_tickets')
        .update(updates)
        .eq('id', ticketId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
      toast.success('Ticket updated');
    },
  });
}

// Upload evidence image
export async function uploadEvidence(userId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from('support-evidence')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('support-evidence').getPublicUrl(path);
  return data.publicUrl;
}

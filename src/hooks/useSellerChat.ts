import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  message_text: string;
  is_read: boolean;
  created_at: string;
}

const CHAT_NOTIF_THROTTLE_MS = 60_000; // 1 minute

export function useSellerChat(buyerId: string | undefined, sellerId: string | undefined, productId: string | undefined) {
  const qc = useQueryClient();
  const [conversationId, setConversationId] = useState<string | null>(null);
  // Track last notification time per recipient to throttle
  const lastNotifRef = useRef<Record<string, number>>({});

  // Get or create conversation
  const getOrCreate = useCallback(async () => {
    if (!buyerId || !sellerId || !productId) return null;

    const { data: existing } = await supabase
      .from('seller_conversations')
      .select('id')
      .eq('buyer_id', buyerId)
      .eq('seller_id', sellerId)
      .eq('product_id', productId)
      .maybeSingle();

    if (existing) {
      setConversationId(existing.id);
      return existing.id;
    }

    const { data: created, error } = await supabase
      .from('seller_conversations')
      .insert({ buyer_id: buyerId, seller_id: sellerId, product_id: productId })
      .select('id')
      .single();

    if (error) throw error;
    setConversationId(created.id);
    return created.id;
  }, [buyerId, sellerId, productId]);

  // Messages query
  const { data: messages = [], isLoading } = useQuery<Message[]>({
    queryKey: ['seller-chat', conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('seller_conversation_messages')
        .select('*')
        .eq('conversation_id', conversationId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Message[];
    },
  });

  // Realtime subscription
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'seller_conversation_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['seller-chat', conversationId] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId, qc]);

  // Send message
  const sendMutation = useMutation({
    mutationFn: async ({ text, senderId }: { text: string; senderId: string }) => {
      let cid = conversationId;
      if (!cid) cid = await getOrCreate();
      if (!cid) throw new Error('Could not create conversation');

      const { error } = await supabase
        .from('seller_conversation_messages')
        .insert({ conversation_id: cid, sender_id: senderId, message_text: text });
      if (error) throw error;

      // Determine recipient for notification
      const recipientId = senderId === buyerId ? sellerId : buyerId;
      if (recipientId) {
        const now = Date.now();
        const lastSent = lastNotifRef.current[recipientId] || 0;

        // Only send notification if throttle window has passed
        if (now - lastSent >= CHAT_NOTIF_THROTTLE_MS) {
          lastNotifRef.current[recipientId] = now;
          await supabase.from('notification_queue').insert({
            user_id: recipientId,
            type: 'chat',
            title: '💬 New message',
            body: text.slice(0, 100),
            reference_path: `/orders`,
            payload: { type: 'seller_chat', conversationId: cid },
          });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['seller-chat', conversationId] });
    },
  });

  return {
    conversationId,
    messages,
    isLoading,
    getOrCreate,
    sendMessage: sendMutation.mutateAsync,
    isSending: sendMutation.isPending,
  };
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ChatMessage } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, MessageCircle, X, Check, CheckCheck } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface OrderChatProps {
  orderId: string;
  otherUserId: string;
  otherUserName: string;
  isOpen: boolean;
  onClose: () => void;
  disabled?: boolean;
}

export function OrderChat({ 
  orderId, 
  otherUserId, 
  otherUserName, 
  isOpen, 
  onClose,
  disabled = false 
}: OrderChatProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [viewportTop, setViewportTop] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Track visual viewport for keyboard-aware layout (mobile web + native webview)
  useEffect(() => {
    if (!isOpen) return;

    const updateViewport = () => {
      const vv = window.visualViewport;
      if (vv) {
        setViewportHeight(vv.height);
        setViewportTop(vv.offsetTop);
        return;
      }
      setViewportHeight(window.innerHeight);
      setViewportTop(0);
    };

    updateViewport();
    const vv = window.visualViewport;
    window.addEventListener('resize', updateViewport);
    vv?.addEventListener('resize', updateViewport);
    vv?.addEventListener('scroll', updateViewport);

    return () => {
      window.removeEventListener('resize', updateViewport);
      vv?.removeEventListener('resize', updateViewport);
      vv?.removeEventListener('scroll', updateViewport);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && orderId) {
      fetchMessages();
      markMessagesAsRead();
      
      const channel = supabase
        .channel(`chat-${orderId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'chat_messages',
            filter: `order_id=eq.${orderId}`,
          },
          (payload) => {
            const newMsg = payload.new as ChatMessage;
            setMessages((prev) => [...prev, newMsg]);
            if (newMsg.receiver_id === user?.id) {
              markMessagesAsRead();
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [isOpen, orderId]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const fetchMessages = async () => {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      setMessages(data);
    }
  };

  const markMessagesAsRead = async () => {
    if (!user) return;
    
    await supabase
      .from('chat_messages')
      .update({ read_status: true })
      .eq('order_id', orderId)
      .eq('receiver_id', user.id)
      .eq('read_status', false);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || isSending || disabled) return;

    setIsSending(true);
    try {
      const { error } = await supabase.from('chat_messages').insert({
        order_id: orderId,
        sender_id: user.id,
        receiver_id: otherUserId,
        message_text: newMessage.trim(),
      });

      if (error) throw error;
      setNewMessage('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsSending(false);
    }
  };

  // Auto-resize textarea
  const handleTextChange = (value: string) => {
    setNewMessage(value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  if (!isOpen) return null;

  const containerStyle: React.CSSProperties = {
    height: `${viewportHeight ?? window.innerHeight}px`,
    top: viewportTop,
    pointerEvents: 'auto' as const,
  };

  return createPortal(
    <div
      className="fixed inset-x-0 top-0 z-[60] bg-background flex flex-col overflow-hidden"
      style={containerStyle}
    >
...
      {/* Input — pinned above keyboard */}
      <div className="px-3 pt-3 border-t bg-card shrink-0 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
        {disabled ? (
          <p className="text-center text-sm text-muted-foreground">
            Chat is disabled for completed orders
          </p>
        ) : (
          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              placeholder="Type a message..."
              value={newMessage}
              onChange={(e) => handleTextChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              onFocus={() => {
                setTimeout(scrollToBottom, 300);
              }}
              rows={1}
              className="flex-1 min-h-[40px] max-h-[120px] resize-none rounded-xl text-base md:text-sm py-2.5"
            />
            <Button
              size="icon"
              className="shrink-0 h-10 w-10 rounded-xl"
              onClick={sendMessage}
              disabled={!newMessage.trim() || isSending}
            >
              <Send size={16} />
            </Button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

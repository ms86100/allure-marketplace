import { useState, useEffect, useRef, useCallback } from 'react';
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Track visual viewport for keyboard-aware layout
  useEffect(() => {
    if (!isOpen) return;
    const vv = window.visualViewport;
    if (!vv) return;

    const handleResize = () => {
      setViewportHeight(vv.height);
    };
    handleResize();
    vv.addEventListener('resize', handleResize);
    return () => vv.removeEventListener('resize', handleResize);
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

  const containerStyle: React.CSSProperties = viewportHeight
    ? { height: `${viewportHeight}px`, top: window.visualViewport?.offsetTop ?? 0 }
    : { height: '100dvh' };

  return (
    <div
      className="fixed inset-x-0 top-0 z-[60] bg-background flex flex-col"
      style={containerStyle}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <MessageCircle className="text-primary" size={20} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold truncate">{otherUserName}</p>
            <p className="text-xs text-muted-foreground">Order #{orderId.slice(0, 8)}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
          <X size={20} />
        </Button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MessageCircle className="mx-auto mb-2" size={32} />
            <p className="text-sm">No messages yet</p>
            <p className="text-xs">Start a conversation about this order</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => {
              const isMine = msg.sender_id === user?.id;
              return (
                <div
                  key={msg.id}
                  className={cn(
                    'flex',
                    isMine ? 'justify-end' : 'justify-start'
                  )}
                >
                  <div
                    className={cn(
                      'max-w-[80%] rounded-2xl px-4 py-2',
                      isMine
                        ? 'bg-primary text-primary-foreground rounded-br-sm'
                        : 'bg-muted rounded-bl-sm'
                    )}
                  >
                    <p className="text-sm">{msg.message_text}</p>
                    <div className={cn(
                      'flex items-center gap-1 mt-1',
                      isMine ? 'justify-end' : 'justify-start'
                    )}>
                      <span className={cn(
                        'text-[10px]',
                        isMine ? 'text-primary-foreground/70' : 'text-muted-foreground'
                      )}>
                        {format(new Date(msg.created_at), 'h:mm a')}
                      </span>
                      {isMine && (
                        msg.read_status ? (
                          <CheckCheck size={12} className="text-primary-foreground/70" />
                        ) : (
                          <Check size={12} className="text-primary-foreground/70" />
                        )
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Input — pinned above keyboard */}
      <div className="p-3 border-t bg-card shrink-0 safe-bottom">
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
              className="flex-1 min-h-[40px] max-h-[120px] resize-none rounded-xl text-sm py-2.5"
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
    </div>
  );
}

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useSellerChat } from '@/hooks/useSellerChat';
import { Send, MessageCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface SellerChatSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buyerId: string;
  sellerId: string;
  productId: string;
  productName: string;
  sellerName: string;
}

export function SellerChatSheet({ open, onOpenChange, buyerId, sellerId, productId, productName, sellerName }: SellerChatSheetProps) {
  const { messages, isLoading, getOrCreate, sendMessage, isSending } = useSellerChat(buyerId, sellerId, productId);
  const [text, setText] = useState('');
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) getOrCreate();
  }, [open, getOrCreate]);

  // Track visual viewport for keyboard-aware layout
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      setViewportHeight(vv.height);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [open]);

  // Auto-scroll to bottom on new messages
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Auto-resize textarea
  const handleTextChange = (value: string) => {
    setText(value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    try {
      await sendMessage({ text: trimmed, senderId: buyerId });
      setText('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (error) {
      console.error('Failed to send seller chat message:', error);
      toast.error('Could not send message. Please try again.');
    }
  };

  if (!open) return null;

  const containerStyle: React.CSSProperties = {
    height: viewportHeight ? `${viewportHeight}px` : '100dvh',
    top: viewportHeight ? (window.visualViewport?.offsetTop ?? 0) : 0,
    pointerEvents: 'auto' as const,
  };

  return createPortal(
    <div
      className="fixed inset-x-0 top-0 z-[60] bg-background flex flex-col animate-in slide-in-from-bottom duration-200 overflow-hidden"
      style={containerStyle}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <MessageCircle className="text-primary" size={20} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold truncate text-sm">{sellerName}</p>
            <p className="text-xs text-muted-foreground truncate">Re: {productName}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} className="shrink-0">
          <X size={20} />
        </Button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-2 space-y-2">
        {isLoading && <p className="text-xs text-muted-foreground text-center py-8">Loading messages…</p>}
        {!isLoading && messages.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <MessageCircle className="mx-auto mb-2" size={32} />
            <p className="text-sm">No messages yet</p>
            <p className="text-xs">Say hello to {sellerName}!</p>
          </div>
        )}
        {messages.map((m) => {
          const isMine = m.sender_id === buyerId;
          return (
            <div key={m.id} className={cn('flex', isMine ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                'max-w-[75%] px-3 py-2 rounded-2xl text-sm',
                isMine
                  ? 'bg-primary text-primary-foreground rounded-br-md'
                  : 'bg-muted text-foreground rounded-bl-md'
              )}>
                {m.message_text}
              </div>
            </div>
          );
        })}
      </div>

      {/* Input bar — pinned above keyboard */}
      <div className="shrink-0 border-t border-border p-3 flex items-end gap-2 bg-card pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder="Type a message…"
          rows={1}
          className="flex-1 min-h-[40px] max-h-[120px] resize-none rounded-xl text-sm py-2.5"
          onFocus={() => {
            setTimeout(scrollToBottom, 300);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
        />
        <Button
          size="icon"
          className="shrink-0 h-10 w-10 rounded-xl"
          onClick={() => void handleSend()}
          disabled={!text.trim() || isSending}
        >
          <Send size={16} />
        </Button>
      </div>
    </div>,
    document.body
  );
}

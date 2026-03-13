import { useState, useRef, useEffect, useCallback } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useSellerChat } from '@/hooks/useSellerChat';
import { Send, MessageCircle } from 'lucide-react';
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
  const [containerHeight, setContainerHeight] = useState('85dvh');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) getOrCreate();
  }, [open, getOrCreate]);

  // Dynamically adapt to keyboard open/close using visualViewport
  useEffect(() => {
    if (!open) return;

    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      // visualViewport.height = screen minus keyboard
      // offsetTop handles any browser chrome offset
      const h = vv.height;
      setContainerHeight(`${Math.max(280, h)}px`);
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
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (error) {
      console.error('Failed to send seller chat message:', error);
      toast.error('Could not send message. Please try again.');
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        style={{ height: containerHeight, maxHeight: containerHeight }}
        className="flex flex-col overflow-hidden"
      >
        {/* Header - fixed */}
        <DrawerHeader className="pb-2 shrink-0">
          <DrawerTitle className="flex items-center gap-2 text-sm">
            <MessageCircle size={16} className="text-primary" />
            Chat with {sellerName}
          </DrawerTitle>
          <p className="text-xs text-muted-foreground">Re: {productName}</p>
        </DrawerHeader>

        {/* Messages - scrollable */}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-2 space-y-2">
          {isLoading && <p className="text-xs text-muted-foreground text-center py-8">Loading messages…</p>}
          {!isLoading && messages.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">No messages yet. Say hello!</p>
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

        {/* Input bar - pinned to bottom, above keyboard */}
        <div className="shrink-0 border-t border-border p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] flex items-end gap-2 bg-background">
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder="Type a message…"
            rows={1}
            className="flex-1 min-h-[40px] max-h-[120px] resize-none rounded-xl text-sm py-2.5"
            onFocus={() => {
              // Give keyboard time to appear, then scroll messages to bottom
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
      </DrawerContent>
    </Drawer>
  );
}

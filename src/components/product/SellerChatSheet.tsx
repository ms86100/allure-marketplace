import { useState, useRef, useEffect } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) getOrCreate();
  }, [open, getOrCreate]);

  useEffect(() => {
    if (!open) {
      setViewportHeight(null);
      return;
    }

    const vv = window.visualViewport;
    if (!vv) return;

    const handleViewport = () => {
      setViewportHeight(Math.max(320, vv.height));
    };

    handleViewport();
    vv.addEventListener('resize', handleViewport);
    vv.addEventListener('scroll', handleViewport);

    return () => {
      vv.removeEventListener('resize', handleViewport);
      vv.removeEventListener('scroll', handleViewport);
    };
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    try {
      await sendMessage({ text: trimmed, senderId: buyerId });
      setText('');
    } catch (error) {
      console.error('Failed to send seller chat message:', error);
      toast.error('Could not send message. Please try again.');
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className="h-[85vh]"
        style={viewportHeight ? { height: `${viewportHeight}px`, maxHeight: `${viewportHeight}px` } : undefined}
      >
        <DrawerHeader className="pb-2">
          <DrawerTitle className="flex items-center gap-2 text-sm">
            <MessageCircle size={16} className="text-primary" />
            Chat with {sellerName}
          </DrawerTitle>
          <p className="text-xs text-muted-foreground">Re: {productName}</p>
        </DrawerHeader>

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

        <div className="p-4 border-t border-border flex gap-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
          <Input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message…"
            onFocus={() => setTimeout(() => inputRef.current?.scrollIntoView({ block: 'nearest' }), 120)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            className="flex-1"
          />
          <Button size="icon" onClick={() => void handleSend()} disabled={!text.trim() || isSending}>
            <Send size={16} />
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}


import { useState, useRef, useEffect } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSellerChat } from '@/hooks/useSellerChat';
import { Send, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) getOrCreate();
  }, [open, getOrCreate]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText('');
    await sendMessage({ text: trimmed, senderId: buyerId });
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="flex items-center gap-2 text-sm">
            <MessageCircle size={16} className="text-primary" />
            Chat with {sellerName}
          </DrawerTitle>
          <p className="text-xs text-muted-foreground">Re: {productName}</p>
        </DrawerHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-2 space-y-2 min-h-[200px] max-h-[50vh]">
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

        <div className="p-4 border-t border-border flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message…"
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            className="flex-1"
          />
          <Button size="icon" onClick={handleSend} disabled={!text.trim() || isSending}>
            <Send size={16} />
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

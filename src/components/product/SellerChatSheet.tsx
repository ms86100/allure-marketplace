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
  const [viewportTop, setViewportTop] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) getOrCreate();
  }, [open, getOrCreate]);

  // Track visual viewport for keyboard-aware layout (mobile web + native webview)
  useEffect(() => {
    if (!open) return;

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
      {/* Input bar — pinned above keyboard */}
      <div className="shrink-0 border-t border-border px-3 pt-3 flex items-end gap-2 bg-card pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder="Type a message…"
          rows={1}
          className="flex-1 min-h-[40px] max-h-[120px] resize-none rounded-xl text-base md:text-sm py-2.5"
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

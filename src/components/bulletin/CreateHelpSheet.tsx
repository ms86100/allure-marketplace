import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { Loader2, Handshake, AlertCircle, HelpCircle, Gift } from 'lucide-react';

const TAGS = [
  { value: 'borrow', label: 'Borrow', icon: Handshake, color: 'text-blue-600' },
  { value: 'emergency', label: 'Emergency', icon: AlertCircle, color: 'text-red-600' },
  { value: 'question', label: 'Question', icon: HelpCircle, color: 'text-purple-600' },
  { value: 'offer', label: 'Offer', icon: Gift, color: 'text-emerald-600' },
];

interface CreateHelpSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreateHelpSheet({ open, onOpenChange, onCreated }: CreateHelpSheetProps) {
  const { profile } = useAuth();
  const [tag, setTag] = useState('question');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim() || !profile?.society_id) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('help_requests').insert({
        society_id: profile.society_id,
        author_id: profile.id,
        title: title.trim(),
        description: description.trim() || null,
        tag,
      });
      if (error) throw error;
      toast({ title: 'Help request posted!' });
      setTitle('');
      setDescription('');
      setTag('question');
      onOpenChange(false);
      onCreated();
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Ask for Help</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-4">
          <div className="flex gap-2 flex-wrap">
            {TAGS.map(t => {
              const Icon = t.icon;
              return (
                <button
                  key={t.value}
                  onClick={() => setTag(t.value)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                    tag === t.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card border-border text-muted-foreground'
                  )}
                >
                  <Icon size={12} />
                  {t.label}
                </button>
              );
            })}
          </div>
          <div>
            <Label>What do you need?</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Need an Allen key set" maxLength={150} />
          </div>
          <div>
            <Label>Details (optional)</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Any extra info..." rows={3} />
          </div>
          <p className="text-[10px] text-muted-foreground">This request expires automatically in 24 hours.</p>
          <Button className="w-full" onClick={handleSubmit} disabled={loading || !title.trim()}>
            {loading ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
            Post Request
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

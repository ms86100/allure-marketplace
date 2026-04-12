// @ts-nocheck
import { useState } from 'react';
import { useSellerTickets } from '@/hooks/useSupportTickets';
import { SupportTicketCard } from '@/components/support/SupportTicketCard';
import { SupportTicketDetail } from '@/components/support/SupportTicketDetail';
import type { SupportTicket } from '@/hooks/useSupportTickets';
import { Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';

interface SellerSupportTabProps {
  sellerId: string;
}

export function SellerSupportTab({ sellerId }: SellerSupportTabProps) {
  const { data: tickets = [], isLoading } = useSellerTickets(sellerId);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [filter, setFilter] = useState<'active' | 'resolved'>('active');

  const filtered = tickets.filter(t =>
    filter === 'active'
      ? ['open', 'seller_pending'].includes(t.status)
      : ['resolved', 'auto_resolved', 'closed'].includes(t.status)
  );

  const activeCount = tickets.filter(t => ['open', 'seller_pending'].includes(t.status)).length;
  const breachedCount = tickets.filter(t => t.sla_breached && ['open', 'seller_pending'].includes(t.status)).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-muted-foreground" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="flex gap-3">
        <div className="flex-1 bg-card border border-border rounded-xl p-3 text-center">
          <p className="text-lg font-bold">{activeCount}</p>
          <p className="text-[11px] text-muted-foreground">Active tickets</p>
        </div>
        {breachedCount > 0 && (
          <div className="flex-1 bg-destructive/5 border border-destructive/20 rounded-xl p-3 text-center">
            <div className="flex items-center justify-center gap-1">
              <AlertTriangle size={14} className="text-destructive" />
              <p className="text-lg font-bold text-destructive">{breachedCount}</p>
            </div>
            <p className="text-[11px] text-destructive/80">SLA breached</p>
          </div>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setFilter('active')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            filter === 'active' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          }`}
        >
          Active {activeCount > 0 && `(${activeCount})`}
        </button>
        <button
          onClick={() => setFilter('resolved')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            filter === 'resolved' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          }`}
        >
          Resolved
        </button>
      </div>

      {/* Ticket list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <ShieldCheck className="mx-auto text-muted-foreground mb-2" size={32} />
          <p className="text-sm text-muted-foreground">
            {filter === 'active' ? 'No active support tickets' : 'No resolved tickets yet'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((ticket) => (
            <SupportTicketCard
              key={ticket.id}
              ticket={ticket}
              viewRole="seller"
              onClick={() => setSelectedTicket(ticket)}
            />
          ))}
        </div>
      )}

      <SupportTicketDetail
        ticket={selectedTicket}
        open={!!selectedTicket}
        onOpenChange={(open) => { if (!open) setSelectedTicket(null); }}
        viewRole="seller"
      />
    </div>
  );
}

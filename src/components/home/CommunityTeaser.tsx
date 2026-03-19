import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { MessageCircle, ChevronRight, Heart, ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { jitteredStaleTime } from '@/lib/query-utils';
import { useMarketplaceLabels } from '@/hooks/useMarketplaceLabels';

interface RecentPost {
  id: string;
  title: string;
  category: string;
  comment_count: number;
  vote_count: number;
  created_at: string;
}

export function CommunityTeaser() {
  const { effectiveSocietyId } = useAuth();
  const ml = useMarketplaceLabels();

  const { data } = useQuery({
    queryKey: ['community-teaser', effectiveSocietyId],
    queryFn: async () => {
      const [postsRes, helpRes] = await Promise.all([
        supabase
          .from('bulletin_posts')
          .select('id, title, category, comment_count, vote_count, created_at')
          .eq('society_id', effectiveSocietyId!)
          .eq('is_archived', false)
          .order('created_at', { ascending: false })
          .limit(2),
        supabase
          .from('help_requests')
          .select('id', { count: 'exact', head: true })
          .eq('society_id', effectiveSocietyId!)
          .eq('status', 'open'),
      ]);
      return {
        posts: (postsRes.data || []) as RecentPost[],
        helpCount: helpRes.count || 0,
      };
    },
    enabled: !!effectiveSocietyId,
    staleTime: jitteredStaleTime(3 * 60 * 1000),
  });

  const posts = data?.posts || [];
  const helpCount = data?.helpCount || 0;

  if (!effectiveSocietyId) return null;

  if (posts.length === 0 && helpCount === 0) {
    return (
      <div className="px-4 mt-6 mb-4">
        <Link to="/community" className="flex items-center gap-3 bg-card border border-border rounded-2xl p-3.5 shadow-card hover:shadow-elevated transition-shadow">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <MessageCircle size={16} className="text-primary" />
          </div>
          <span className="font-semibold text-sm text-foreground flex-1">{ml.label('label_community_first_post')}</span>
          <ChevronRight size={16} className="text-muted-foreground" />
        </Link>
      </div>
    );
  }

  return (
    <div className="px-4 mt-6 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="section-header">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <MessageCircle size={14} className="text-primary" />
          </div>
          {ml.label('label_section_community')}
        </h3>
        <Link to="/community" className="text-xs font-bold text-primary flex items-center gap-0.5 hover:underline">
          View all <ChevronRight size={13} />
        </Link>
      </div>

      <div className="space-y-2">
        {helpCount > 0 && (
          <Link to="/community">
            <div className="flex items-center gap-3 py-2.5 px-3 rounded-xl bg-warning/5 border border-warning/10 active:opacity-70 transition-opacity">
              <Heart size={14} className="text-warning shrink-0" />
              <span className="text-xs font-semibold text-foreground flex-1 truncate">
                {helpCount} neighbor{helpCount !== 1 ? 's' : ''} need{helpCount === 1 ? 's' : ''} help
              </span>
              <ArrowRight size={13} className="text-muted-foreground shrink-0" />
            </div>
          </Link>
        )}
        
        {posts.map((post) => (
          <Link key={post.id} to="/community">
            <div className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-secondary/50 active:opacity-70 transition-all">
              <span className="text-xs font-medium text-foreground flex-1 truncate">{post.title}</span>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap tabular-nums">
                {post.comment_count}💬 {post.vote_count}↑
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

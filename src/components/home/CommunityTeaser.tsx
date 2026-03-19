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

  // Gap #8: Reduced visual weight — smaller, footer-like feel
  if (posts.length === 0 && helpCount === 0) {
    return (
      <div className="px-4 mt-5 mb-4">
        <Link to="/community" className="flex items-center gap-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
          <MessageCircle size={13} className="text-primary" />
          <span className="font-semibold">{ml.label('label_community_first_post')}</span>
          <ChevronRight size={12} className="ml-auto" />
        </Link>
      </div>
    );
  }

  return (
    <div className="px-4 mt-5 mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold text-[13px] text-foreground tracking-tight flex items-center gap-1.5">
          <MessageCircle size={13} className="text-primary" />
          {ml.label('label_section_community')}
        </h3>
        <Link to="/community" className="text-[10px] font-bold text-primary flex items-center gap-0.5">
          View all <ChevronRight size={11} />
        </Link>
      </div>

      <div className="space-y-1.5">
        {helpCount > 0 && (
          <Link to="/community">
            <div className="flex items-center gap-2 py-1.5 active:opacity-70 transition-opacity">
              <Heart size={12} className="text-warning shrink-0" />
              <span className="text-[11px] font-medium text-foreground flex-1 truncate">
                {helpCount} neighbor{helpCount !== 1 ? 's' : ''} need{helpCount === 1 ? 's' : ''} help
              </span>
              <ArrowRight size={11} className="text-muted-foreground shrink-0" />
            </div>
          </Link>
        )}
        
        {posts.map((post) => (
          <Link key={post.id} to="/community">
            <div className="flex items-center gap-2 py-1.5 active:opacity-70 transition-opacity">
              <span className="text-[11px] font-medium text-foreground flex-1 truncate">{post.title}</span>
              <span className="text-[9px] text-muted-foreground whitespace-nowrap tabular-nums">
                {post.comment_count}💬 {post.vote_count}↑
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

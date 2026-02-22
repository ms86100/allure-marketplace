import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Package, Check, Lock, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { FeatureShowcase } from '@/components/admin/FeatureShowcase';

interface BuilderFeaturePlanProps {
  builderId: string;
}

interface PackageFeature {
  feature_key: string;
  feature_name: string;
  enabled: boolean;
  is_core: boolean;
  category: string;
}

export function BuilderFeaturePlan({ builderId }: BuilderFeaturePlanProps) {
  const [expanded, setExpanded] = useState(false);
  const [showcaseKey, setShowcaseKey] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['builder-feature-plan', builderId],
    queryFn: async () => {
      // Get builder's assigned package
      const { data: assignment } = await supabase
        .from('builder_feature_packages')
        .select('id, package_id, assigned_at, expires_at')
        .eq('builder_id', builderId)
        .order('assigned_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!assignment) return null;

      // Get package details
      const { data: pkg } = await supabase
        .from('feature_packages')
        .select('package_name, description, price_tier')
        .eq('id', assignment.package_id)
        .single();

      if (!pkg) return null;

      // Get package items with feature details
      const { data: items } = await supabase
        .from('feature_package_items')
        .select('feature_id, enabled')
        .eq('package_id', assignment.package_id);

      // Get all platform features
      const { data: allFeatures } = await supabase
        .from('platform_features')
        .select('id, feature_key, feature_name, is_core, category')
        .order('category')
        .order('feature_name');

      const itemMap = new Map((items || []).map(i => [i.feature_id, i.enabled]));

      const features: PackageFeature[] = (allFeatures || []).map(f => ({
        feature_key: f.feature_key,
        feature_name: f.feature_name,
        enabled: f.is_core || (itemMap.has(f.id) && itemMap.get(f.id) === true),
        is_core: f.is_core,
        category: f.category,
      }));

      const enabledCount = features.filter(f => f.enabled).length;

      return {
        packageName: pkg.package_name,
        priceTier: pkg.price_tier,
        description: pkg.description,
        assignedAt: assignment.assigned_at,
        expiresAt: assignment.expires_at,
        features,
        enabledCount,
        totalCount: features.length,
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <Skeleton className="h-24 w-full" />;

  if (!data) {
    return (
      <Card className="border-dashed border-muted-foreground/30">
        <CardContent className="p-4 text-center">
          <Package size={20} className="mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm font-medium text-muted-foreground">No package assigned</p>
          <p className="text-xs text-muted-foreground/70">Contact your platform admin to get a feature package.</p>
        </CardContent>
      </Card>
    );
  }

  const tierColors: Record<string, string> = {
    free: 'bg-muted text-muted-foreground',
    basic: 'bg-blue-500/10 text-blue-600',
    pro: 'bg-purple-500/10 text-purple-600',
    enterprise: 'bg-amber-500/10 text-amber-700',
  };

  return (
    <>
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Package size={16} className="text-primary" />
              <span className="text-sm font-semibold">Your Plan: {data.packageName}</span>
              <Badge className={`text-[10px] capitalize ${tierColors[data.priceTier] || tierColors.free}`}>
                {data.priceTier}
              </Badge>
            </div>
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>

          <p className="text-xs text-muted-foreground mb-1">
            {data.enabledCount} of {data.totalCount} features included
          </p>

          {/* Progress bar */}
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${(data.enabledCount / data.totalCount) * 100}%` }}
            />
          </div>

          {expanded && (
            <div className="mt-3 space-y-1 border-t pt-3">
              {data.features.map(f => (
                <button
                  key={f.feature_key}
                  className="flex items-center gap-2 w-full text-left py-1 hover:bg-primary/5 rounded px-1 transition-colors"
                  onClick={() => setShowcaseKey(f.feature_key)}
                >
                  {f.enabled ? (
                    <Check size={13} className="text-primary shrink-0" />
                  ) : (
                    <Lock size={13} className="text-muted-foreground/40 shrink-0" />
                  )}
                  <span className={`text-xs flex-1 ${f.enabled ? 'text-foreground' : 'text-muted-foreground/50'}`}>
                    {f.feature_name}
                  </span>
                  {f.is_core && <Badge variant="secondary" className="text-[8px] h-3.5">Core</Badge>}
                  <Info size={11} className="text-muted-foreground/30" />
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <FeatureShowcase
        featureKey={showcaseKey}
        open={!!showcaseKey}
        onOpenChange={(open) => !open && setShowcaseKey(null)}
      />
    </>
  );
}

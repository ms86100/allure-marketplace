import { ShieldAlert, Truck, ChefHat } from 'lucide-react';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

const PAINS = [
  {
    icon: ShieldAlert,
    pain: 'Ordering from unknown sellers?',
    solution: 'Every seller on the platform is a GPS-verified resident of your society. No strangers. No fraud.',
    color: 'bg-destructive/10 text-destructive',
  },
  {
    icon: Truck,
    pain: 'Paying delivery fees for items 2 floors away?',
    solution: 'Your neighbor delivers to your doorstep — within the same compound. Zero logistics overhead.',
    color: 'bg-warning/10 text-warning',
  },
  {
    icon: ChefHat,
    pain: 'Your neighbor makes amazing food but has no platform?',
    solution: 'Any resident can list products, home-cooked meals, or services in minutes. No marketing costs.',
    color: 'bg-primary/10 text-primary',
  },
];

export function LandingPainPoints() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section ref={ref} className="py-20 lg:py-28 bg-muted/30">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-14"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Sound Familiar?
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Living in a large society shouldn't feel isolating. Here's what we're fixing.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {PAINS.map(({ icon: Icon, pain, solution, color }, i) => (
            <motion.div
              key={pain}
              initial={{ opacity: 0, y: 24 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.12 }}
              className="p-6 rounded-2xl bg-card border border-border hover:shadow-md transition-shadow"
            >
              <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center mb-4`}>
                <Icon size={22} />
              </div>
              <h3 className="font-bold text-foreground mb-2 text-base">{pain}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{solution}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
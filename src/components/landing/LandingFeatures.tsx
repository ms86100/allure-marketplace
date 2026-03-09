import {
  ShoppingBag, Utensils, Wrench, MessageSquare, CreditCard, Star,
} from 'lucide-react';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

const BENEFITS = [
  { icon: ShoppingBag, title: 'Discover What Your Neighbors Create', desc: 'From handmade crafts to daily essentials - browse a marketplace curated by people you already know.' },
  { icon: Utensils, title: 'Home-Cooked Meals at Your Door', desc: 'Skip the restaurant markup. Order fresh tiffins, snacks, and meals made by neighbors who love cooking.' },
  { icon: Wrench, title: 'Book Trusted Local Services', desc: 'Plumbers, tutors, fitness trainers - all verified residents. No more gambling on strangers from the internet.' },
  { icon: MessageSquare, title: 'Chat Before You Buy', desc: "Message sellers directly. Ask about ingredients, timing, or customizations - it's like talking to a neighbor (because it is)." },
  { icon: CreditCard, title: 'Pay Your Way', desc: 'UPI, Google Pay, PhonePe, or good old cash on delivery. No credit card, no subscriptions required.' },
  { icon: Star, title: 'Real Reviews From Real Neighbors', desc: 'Every review comes from a verified resident. No fake ratings, no paid reviews - just honest feedback.' },
];

export function LandingFeatures() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section id="features" ref={ref} className="py-20 lg:py-28">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-14"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            What Changes When You Join
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            A marketplace built on trust, not algorithms. Here's what your community unlocks.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {BENEFITS.map(({ icon: Icon, title, desc }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 24 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.45, delay: i * 0.08 }}
              className="group p-6 rounded-2xl bg-card border border-border hover:shadow-md hover:-translate-y-1 transition-all duration-200"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
                <Icon className="text-primary" size={22} />
              </div>
              <h4 className="font-semibold text-foreground mb-2">{title}</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

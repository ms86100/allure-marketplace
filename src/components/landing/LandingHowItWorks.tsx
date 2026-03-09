import { MapPin, Search, ShoppingBag } from 'lucide-react';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

const STEPS = [
  {
    icon: MapPin,
    step: '1',
    title: 'Verify Your Address',
    desc: 'Sign up and verify your residence through GPS. Takes 30 seconds.',
  },
  {
    icon: Search,
    step: '2',
    title: 'Browse Your Society',
    desc: 'Explore products, food, and services listed by your verified neighbors.',
  },
  {
    icon: ShoppingBag,
    step: '3',
    title: 'Order & Receive',
    desc: 'Pay via UPI or cash. Your neighbor delivers — right to your door.',
  },
];

export function LandingHowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section id="how-it-works" ref={ref} className="py-20 lg:py-28 bg-muted/30">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-14"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Three Steps. That's It.
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            From signup to your first order — simpler than any delivery app.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8 max-w-3xl mx-auto">
          {STEPS.map(({ icon: Icon, step, title, desc }, i) => (
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 24 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              className="text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4 shadow-cta">
                <Icon className="text-primary-foreground" size={28} />
              </div>
              <span className="text-xs font-bold text-primary uppercase tracking-wider">Step {step}</span>
              <h3 className="text-lg font-bold text-foreground mt-1 mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

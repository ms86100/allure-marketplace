import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Quote } from 'lucide-react';

const TESTIMONIALS = [
  {
    quote: "I order home-cooked tiffin from my neighbor on the 3rd floor. My kids love it, and I know exactly who's making it.",
    name: 'Priya M.',
    role: 'Working Parent',
    society: 'Prestige Lakeside',
  },
  {
    quote: "I started selling my cakes and cookies here. Within a week, I had 15 orders — all from people in my own building!",
    name: 'Anita K.',
    role: 'Home Baker & Seller',
    society: 'Brigade Gateway',
  },
  {
    quote: "Managing community services used to be chaos. Now residents book electricians, plumbers — everything through one platform.",
    name: 'Rajesh S.',
    role: 'Society Committee Member',
    society: 'Sobha Dream Acres',
  },
];

export function LandingTestimonials() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section ref={ref} className="py-20 lg:py-28">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-14"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Your Neighbors Are Already Here
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Real stories from families using the platform every day.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {TESTIMONIALS.map(({ quote, name, role, society }, i) => (
            <motion.div
              key={name}
              initial={{ opacity: 0, y: 24 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.12 }}
              className="p-6 rounded-2xl bg-card border border-border"
            >
              <Quote className="text-primary/30 mb-3" size={24} />
              <p className="text-sm text-foreground leading-relaxed mb-5 italic">"{quote}"</p>
              <div>
                <p className="font-semibold text-foreground text-sm">{name}</p>
                <p className="text-xs text-muted-foreground">{role} · {society}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
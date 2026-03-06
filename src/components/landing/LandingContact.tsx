import { Mail, MapPin } from 'lucide-react';

export function LandingContact() {

  return (
    <section id="contact" className="py-20 lg:py-28">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">Contact & Support</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            We're here to help. Reach out to us through any of the channels below.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          <div className="p-6 rounded-2xl bg-card border border-border text-center">
            <Mail className="mx-auto text-primary mb-3" size={24} />
            <h3 className="font-semibold text-foreground mb-1 text-sm">General Support</h3>
            <a href="mailto:support@sociva.in" className="text-sm text-primary hover:underline break-all">support@sociva.in</a>
          </div>

          <div className="p-6 rounded-2xl bg-card border border-border text-center">
            <MapPin className="mx-auto text-primary mb-3" size={24} />
            <h3 className="font-semibold text-foreground mb-1 text-sm">Registered Address</h3>
            <p className="text-xs text-muted-foreground">Bangalore, Karnataka, India</p>
          </div>
        </div>
      </div>
    </section>
  );
}

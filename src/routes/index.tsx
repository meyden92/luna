import { createFileRoute } from '@tanstack/react-router';
import Features from '@/components/landing/Features';
import Footer from '@/components/landing/Footer';
import Hero from '@/components/landing/Hero';
import MoonlitCta from '@/components/landing/MoonlitCta';
import Stats from '@/components/landing/Stats';
import Story from '@/components/landing/Story';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return (
    <div className="min-h-screen">
      <main>
        <Hero />
        <Features />
        <Story />
        <MoonlitCta />
        <Stats />
        <Footer />
      </main>
    </div>
  );
}

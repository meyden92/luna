import { createFileRoute, Link } from '@tanstack/react-router';
import { Home, Search } from 'lucide-react';
import { useMemo } from 'react';
import Footer from '@/components/landing/Footer';
import { Button } from '@/components/ui/button';

const NOT_FOUND_MESSAGES = [
  'Oops! This page has gone to get coffee and never came back.',
  "404: Page playing hide and seek since 2023. (It's winning.)",
  'Houston, we have a problem. This page has gone to space.',
  'Looks like this page took a vacation without telling anyone.',
  'This page is hanging out with Bigfoot and the Loch Ness Monster.',
  'Error 404: Page not found. Maybe try looking under the couch?',
  "This link is as broken as my New Year's resolutions.",
  'The page you requested is social distancing right now.',
  'Plot twist: This page never existed!',
  'This page was last seen with my lost socks from the dryer.',
];

export const Route = createFileRoute('/$')({
  head: () => ({ meta: [{ title: '404 - Page Not Found | LunaShare' }] }),
  component: NotFoundPage,
});

function NotFoundPage() {
  const randomMessage = useMemo(() => NOT_FOUND_MESSAGES[Math.floor(Math.random() * NOT_FOUND_MESSAGES.length)], []);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="relative mb-8">
          <div className="relative z-10 p-6 delay-[400ms]">
            <Search
              size={80}
              className="text-ac"
            />
          </div>
          <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
            <div className="w-32 h-32 bg-foreground rounded-full opacity-20 animate-pulse-fade delay-[400ms]" />
          </div>
        </div>

        <div className="translate-y-12">
          <h1 className="text-4xl font-bold text-center mb-4 flex items-center justify-center gap-3">404 - Page Not Found</h1>

          <div className="bg-background bg-opacity-70 backdrop-blur-md border border-border rounded-lg p-6 max-w-md shadow-lg relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-ring rounded-full opacity-20" />
            <div className="absolute -bottom-10 -left-10 w-24 h-24 bg-ring rounded-full opacity-20" />

            <div className="relative">
              <div className="flex items-start mb-6">
                <div className="bg-primary p-2 rounded-full mr-3">
                  <Search className="text-foreground" />
                </div>
                <p className="text-foreground font-medium leading-relaxed">{randomMessage}</p>
              </div>

              <div className="flex justify-center mt-8">
                <Link to="/">
                  <Button variant="secondary">
                    <Home size={18} />
                    Back to Home
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          <p className="text-foreground text-sm text-center mt-8">Feel free to try another page, or click above to return home.</p>
        </div>
      </div>
      <Footer />
    </div>
  );
}

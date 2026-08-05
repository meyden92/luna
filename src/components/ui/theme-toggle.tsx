import { MoonIcon, SunIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Button } from './button';

function ThemeToggleButton() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button
        className="size-10 hover:cursor-pointer"
        variant="ghost"
        size="icon"
        disabled
      >
        <SunIcon className="size-10" />
      </Button>
    );
  }

  return (
    <Button
      className="size-10 hover:cursor-pointer"
      variant="ghost"
      size="icon"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      {resolvedTheme === 'dark' ? <SunIcon className="size-8" /> : <MoonIcon className="size-8" />}
    </Button>
  );
}

export default ThemeToggleButton;

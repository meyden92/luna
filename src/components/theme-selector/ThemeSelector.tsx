import { useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { isThemeId, type ThemeId, type ThemeInfo, themeLoader } from '@/libs/theme-loader';

function ThemeSelector() {
  const [availableThemes, setAvailableThemes] = useState<readonly ThemeInfo[]>([]);
  const [selectedTheme, setSelectedTheme] = useState<ThemeId>('default');

  useEffect(() => {
    const loadThemes = () => {
      const themes = themeLoader.getAvailableThemes();
      setAvailableThemes(themes);
    };

    const currentTheme = themeLoader.getCurrentTheme();
    setSelectedTheme(currentTheme);
    loadThemes();
  }, []);

  const handleThemeChange = async (value: string | null) => {
    if (!value || !isThemeId(value)) return;
    setSelectedTheme(value);
    themeLoader.clearPreview();
    await themeLoader.loadTheme(value);
  };

  const handleThemePreview = async (themeId: ThemeId) => {
    await themeLoader.previewTheme(themeId);
  };

  const handlePreviewEnd = () => {
    themeLoader.clearPreview();
  };

  const handleSelectOpenChange = (open: boolean) => {
    // Clear preview when select closes
    if (!open) {
      themeLoader.clearPreview();
    }
  };

  return (
    <Select
      onValueChange={(value) => handleThemeChange(value)}
      value={selectedTheme}
      onOpenChange={handleSelectOpenChange}
    >
      <SelectTrigger className="w-full sm:w-[220px]">
        <SelectValue placeholder="Select a theme" />
      </SelectTrigger>
      <SelectContent>
        {availableThemes.map((theme) => (
          <SelectItem
            key={theme.id}
            value={theme.id}
            onMouseEnter={() => handleThemePreview(theme.id)}
            onMouseLeave={handlePreviewEnd}
          >
            {theme.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default ThemeSelector;

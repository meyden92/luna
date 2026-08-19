import { createServerFn } from '@tanstack/react-start';
import { endOfDay, format, startOfDay, subDays } from 'date-fns';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

export interface SettingsOverview {
  id: string;
  username: string;
  email: string;
  avatar: string | null;
  receiveEmail: boolean;
  isProfilePublic: boolean;
  bio: string | null;
  description: string | null;
  stats: { date: string; count: number }[];
  filecount: number;
  filesize: number;
  tokens: {
    id: string;
    name: string;
    key: string;
    enabled: boolean;
    compressImage: boolean;
    convertToJpeg: boolean;
    jpegQuality: number;
    folderId: string | null;
    stripMetadata: boolean;
    flowId: string | null;
    createdAt: Date;
  }[];
  fileExtensions: { id: string; label: string; value: number; color: string }[];
  generatorStats: { totalGenerations: number; successfulGenerations: number; failedGenerations: number };
  showAllFilesIncludesFoldered: boolean;
}

export const getSettingsOverview = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .handler(async ({ context }): Promise<SettingsOverview> => {
    const [{ countTemplateGenerationsByStatus, getSettingsProfile, listOwnedUploadsInRange, listUserTokens }, { storageUsage }] =
      await Promise.all([import('@/db/queries/auth'), import('@/db/queries/files')]);
    const userId = userIdFromCtx(context);

    const today = new Date();
    const thirtyDaysAgo = startOfDay(subDays(today, 30));
    const thirtyDaysEnd = endOfDay(today);

    const [user, tokens, fileAggregate, recentFiles, generatorGroups] = await Promise.all([
      getSettingsProfile(userId),
      listUserTokens(userId),
      storageUsage(userId),
      listOwnedUploadsInRange({ ownerId: userId, from: thirtyDaysAgo, to: thirtyDaysEnd }),
      countTemplateGenerationsByStatus(userId),
    ]);

    if (!user) throw new Error('User not found');

    const formattedDate = (date: Date) => format(date, 'MMMM dd, yyyy');
    const monthlyUploadStats: { date: string; count: number }[] = [];
    for (let i = 0; i < 31; i += 1) {
      const currentDate = subDays(today, i);
      const count = recentFiles.filter(
        (file) => file.createdAt >= startOfDay(currentDate) && file.createdAt <= endOfDay(currentDate),
      ).length;
      monthlyUploadStats.push({ date: formattedDate(currentDate), count });
    }

    const extensionCounts: Record<string, number> = {};
    for (const file of recentFiles) {
      const parts = file.title.split('.');
      const ext = parts.length > 1 ? (parts[parts.length - 1] || '').toLowerCase() : 'unknown';
      extensionCounts[ext] = (extensionCounts[ext] || 0) + 1;
    }

    const colors = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];
    const fileExtensions = Object.entries(extensionCounts)
      .map(([ext, count], index) => ({
        id: ext,
        label: ext,
        value: count,
        color: colors[index % colors.length] || '#000000',
      }))
      .sort((a, b) => b.value - a.value);

    let totalGenerations = 0;
    let successfulGenerations = 0;
    let failedGenerations = 0;
    for (const group of generatorGroups) {
      totalGenerations += group.total;
      if (group.status === 'success') successfulGenerations = group.total;
      else if (group.status === 'failed') failedGenerations = group.total;
    }

    return {
      id: user.id,
      username: user.name,
      email: user.email,
      avatar: user.image,
      receiveEmail: user.receiveEmail,
      isProfilePublic: user.isProfilePublic,
      bio: user.bio,
      description: user.description,
      stats: monthlyUploadStats,
      filecount: fileAggregate.fileCount,
      filesize: fileAggregate.totalBytes,
      // Projected explicitly so the token row's other columns never cross the
      // server-function boundary.
      tokens: tokens.map((token) => ({
        id: token.id,
        name: token.name,
        key: token.key,
        enabled: token.enabled,
        compressImage: token.compressImage,
        convertToJpeg: token.convertToJpeg,
        jpegQuality: token.jpegQuality,
        folderId: token.folderId,
        stripMetadata: token.stripMetadata,
        flowId: token.flowId,
        createdAt: token.createdAt,
      })),
      fileExtensions,
      generatorStats: { totalGenerations, successfulGenerations, failedGenerations },
      showAllFilesIncludesFoldered: user.showAllFilesIncludesFoldered,
    };
  });

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
    const { default: prisma } = await import('@/libs/prismadb');
    const userId = userIdFromCtx(context);

    const today = new Date();
    const thirtyDaysAgo = startOfDay(subDays(today, 30));
    const thirtyDaysEnd = endOfDay(today);

    const [user, tokens, fileAggregate, recentFiles, generatorGroups] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          receiveEmail: true,
          isProfilePublic: true,
          bio: true,
          description: true,
          showAllFilesIncludesFoldered: true,
        },
      }),
      prisma.token.findMany({
        where: { userId },
        select: {
          id: true,
          name: true,
          key: true,
          enabled: true,
          compressImage: true,
          convertToJpeg: true,
          jpegQuality: true,
          folderId: true,
          stripMetadata: true,
          flowId: true,
          createdAt: true,
        },
      }),
      prisma.file.aggregate({
        where: { ownerId: userId, isDeleted: false },
        _count: { _all: true },
        _sum: { size: true },
      }),
      prisma.file.findMany({
        where: {
          ownerId: userId,
          isDeleted: false,
          createdAt: { gte: thirtyDaysAgo, lte: thirtyDaysEnd },
        },
        select: { createdAt: true, title: true },
      }),
      prisma.templateGeneration.groupBy({
        by: ['status'],
        where: { userId },
        _count: { _all: true },
      }),
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
      const count = group._count._all;
      totalGenerations += count;
      if (group.status === 'success') successfulGenerations = count;
      else if (group.status === 'failed') failedGenerations = count;
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
      filecount: fileAggregate._count._all,
      filesize: fileAggregate._sum.size ?? 0,
      tokens,
      fileExtensions,
      generatorStats: { totalGenerations, successfulGenerations, failedGenerations },
      showAllFilesIncludesFoldered: user.showAllFilesIncludesFoldered,
    };
  });

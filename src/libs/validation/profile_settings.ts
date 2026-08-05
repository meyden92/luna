/* eslint-disable camelcase */
import { z } from 'zod';

export const PROFILE_BIO_MAX_LENGTH = 100;
export const PROFILE_DESCRIPTION_MAX_LENGTH = 1000;

const ProfileSettingsValidator = z.object({
  language: z.string(),
  receiveEmails: z.boolean(),
  isProfilePublic: z.boolean(),
  bio: z.string().max(PROFILE_BIO_MAX_LENGTH).optional(),
  description: z.string().max(PROFILE_DESCRIPTION_MAX_LENGTH).optional(),
  showAllFilesIncludesFoldered: z.boolean().optional(),
});

export type ProfileSettingsPayload = z.infer<typeof ProfileSettingsValidator>;

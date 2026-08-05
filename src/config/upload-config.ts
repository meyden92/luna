export const UPLOAD_CONFIG = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  MAX_PROMPT_LENGTH: 100000,
  MIN_PROMPT_LENGTH: 10,
  MAX_NAME_LENGTH: 100,
  MIN_NAME_LENGTH: 3,
  MAX_DESCRIPTION_LENGTH: 500,
} as const;

-- CreateTable
CREATE TABLE `account` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` TEXT NOT NULL,
    `providerId` TEXT NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `accessToken` TEXT NULL,
    `refreshToken` TEXT NULL,
    `idToken` TEXT NULL,
    `accessTokenExpiresAt` DATETIME(3) NULL,
    `refreshTokenExpiresAt` DATETIME(3) NULL,
    `scope` TEXT NULL,
    `password` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `account_userId_fkey`(`userId` ASC),
    INDEX `account_userId_idx`(`userId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `apikey` (
    `id` VARCHAR(191) NOT NULL,
    `name` TEXT NULL,
    `start` TEXT NULL,
    `prefix` TEXT NULL,
    `key` TEXT NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `refillInterval` INTEGER NULL,
    `refillAmount` INTEGER NULL,
    `lastRefillAt` DATETIME(3) NULL,
    `enabled` BOOLEAN NULL DEFAULT true,
    `rateLimitEnabled` BOOLEAN NULL DEFAULT true,
    `rateLimitTimeWindow` INTEGER NULL DEFAULT 5000,
    `rateLimitMax` INTEGER NULL DEFAULT 1,
    `requestCount` INTEGER NULL DEFAULT 0,
    `remaining` INTEGER NULL,
    `lastRequest` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `permissions` TEXT NULL,
    `metadata` TEXT NULL,

    INDEX `apikey_key_idx`(`key`(191) ASC),
    INDEX `apikey_userId_fkey`(`userId` ASC),
    INDEX `apikey_userId_idx`(`userId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_log` (
    `id` VARCHAR(191) NOT NULL,
    `model` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `recordId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `before` LONGTEXT NULL,
    `after` LONGTEXT NULL,
    `changeSet` VARCHAR(191) NULL,
    `fieldChanges` LONGTEXT NULL,
    `metadata` LONGTEXT NULL,
    `summary` TEXT NULL,

    INDEX `audit_log_changeSet_idx`(`changeSet` ASC),
    INDEX `audit_log_model_recordId_idx`(`model` ASC, `recordId` ASC),
    INDEX `audit_log_timestamp_idx`(`timestamp` ASC),
    INDEX `audit_log_userId_fkey`(`userId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cached_image` (
    `id` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `filename` VARCHAR(191) NOT NULL,
    `contentType` VARCHAR(191) NOT NULL,
    `size` INTEGER NOT NULL,
    `hash` VARCHAR(191) NOT NULL,
    `purpose` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `lastAccessedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `cached_image_hash_idx`(`hash` ASC),
    UNIQUE INDEX `cached_image_hash_key`(`hash` ASC),
    INDEX `cached_image_lastAccessedAt_idx`(`lastAccessedAt` ASC),
    INDEX `cached_image_ownerId_idx`(`ownerId` ASC),
    INDEX `cached_image_purpose_idx`(`purpose` ASC),
    UNIQUE INDEX `cached_image_url_key`(`url` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `editing_model` (
    `id` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `apiModelName` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `imageInputField` VARCHAR(191) NOT NULL DEFAULT 'image_input',

    INDEX `editing_model_createdBy_idx`(`createdBy` ASC),
    INDEX `editing_model_isActive_idx`(`isActive` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `editing_model_field` (
    `id` VARCHAR(191) NOT NULL,
    `modelId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `isRequired` BOOLEAN NOT NULL DEFAULT false,
    `defaultValue` TEXT NULL,
    `minValue` VARCHAR(191) NULL,
    `maxValue` VARCHAR(191) NULL,
    `step` VARCHAR(191) NULL,
    `enumOptions` TEXT NULL,
    `isReadonly` BOOLEAN NOT NULL DEFAULT false,
    `isTextarea` BOOLEAN NOT NULL DEFAULT false,
    `isSlider` BOOLEAN NOT NULL DEFAULT false,
    `showCharCount` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `editing_model_field_modelId_idx`(`modelId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `file` (
    `id` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `title` TEXT NOT NULL,
    `tags` TEXT NULL,
    `size` INTEGER NOT NULL,
    `private` BOOLEAN NOT NULL DEFAULT false,
    `contentType` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `deletedAt` DATETIME(3) NULL,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `folderId` VARCHAR(191) NULL,

    INDEX `file_folderId_idx`(`folderId` ASC),
    INDEX `file_ownerId_idx`(`ownerId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `file_metadata` (
    `id` VARCHAR(191) NOT NULL,
    `fileId` VARCHAR(191) NOT NULL,
    `artist` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `genre` VARCHAR(191) NULL,
    `lyrics` TEXT NULL,
    `duration` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `file_metadata_fileId_key`(`fileId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `folder` (
    `id` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `color` VARCHAR(7) NULL,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,

    INDEX `folder_ownerId_idx`(`ownerId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `form_share` (
    `id` VARCHAR(191) NOT NULL,
    `title` TEXT NULL,
    `expiresAt` DATETIME(3) NULL,
    `maxViews` INTEGER NULL,
    `viewCount` INTEGER NOT NULL DEFAULT 0,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `expiresInMs` INTEGER NULL,

    INDEX `form_share_expiresAt_idx`(`expiresAt` ASC),
    INDEX `form_share_ownerId_idx`(`ownerId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `form_share_field` (
    `id` VARCHAR(191) NOT NULL,
    `formId` VARCHAR(191) NOT NULL,
    `label` TEXT NOT NULL,
    `value` TEXT NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `isSensitive` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `form_share_field_formId_idx`(`formId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `generation_model` (
    `id` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `apiModelName` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdBy` VARCHAR(191) NOT NULL,

    INDEX `generation_model_createdBy_idx`(`createdBy` ASC),
    INDEX `generation_model_isActive_idx`(`isActive` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `global_variable` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `defaultValue` TEXT NULL,
    `options` LONGTEXT NULL,
    `required` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `global_variable_name_key`(`name` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `model_field` (
    `id` VARCHAR(191) NOT NULL,
    `modelId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `isRequired` BOOLEAN NOT NULL DEFAULT false,
    `defaultValue` TEXT NULL,
    `minValue` VARCHAR(191) NULL,
    `maxValue` VARCHAR(191) NULL,
    `step` VARCHAR(191) NULL,
    `enumOptions` TEXT NULL,
    `isReadonly` BOOLEAN NOT NULL DEFAULT false,
    `isTextarea` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `isSlider` BOOLEAN NOT NULL DEFAULT false,
    `showCharCount` BOOLEAN NOT NULL DEFAULT false,

    INDEX `model_field_modelId_idx`(`modelId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ocr_result` (
    `id` VARCHAR(191) NOT NULL,
    `fileId` VARCHAR(191) NOT NULL,
    `fileHash` VARCHAR(191) NOT NULL,
    `text` LONGTEXT NOT NULL,
    `words` LONGTEXT NOT NULL,
    `lines` LONGTEXT NOT NULL,
    `confidence` DOUBLE NOT NULL,
    `statistics` LONGTEXT NOT NULL,
    `imageWidth` INTEGER NOT NULL,
    `imageHeight` INTEGER NOT NULL,
    `language` VARCHAR(191) NOT NULL DEFAULT 'eng+deu',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ocr_result_fileHash_idx`(`fileHash` ASC),
    INDEX `ocr_result_fileId_idx`(`fileId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permission_definition` (
    `id` VARCHAR(191) NOT NULL,
    `node` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `isAssignable` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `permission_definition_node_idx`(`node` ASC),
    UNIQUE INDEX `permission_definition_node_key`(`node` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rbac_group` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `rbac_group_key_idx`(`key` ASC),
    UNIQUE INDEX `rbac_group_key_key`(`key` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rbac_group_inheritance` (
    `parentGroupId` VARCHAR(191) NOT NULL,
    `childGroupId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `rbac_group_inheritance_childGroupId_idx`(`childGroupId` ASC),
    PRIMARY KEY (`parentGroupId` ASC, `childGroupId` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rbac_group_permission` (
    `id` VARCHAR(191) NOT NULL,
    `groupId` VARCHAR(191) NOT NULL,
    `pattern` VARCHAR(191) NOT NULL,
    `effect` ENUM('ALLOW', 'DENY') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `rbac_group_permission_groupId_idx`(`groupId` ASC),
    UNIQUE INDEX `rbac_group_permission_groupId_pattern_effect_key`(`groupId` ASC, `pattern` ASC, `effect` ASC),
    INDEX `rbac_group_permission_pattern_idx`(`pattern` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `session` (
    `id` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `ipAddress` TEXT NULL,
    `userAgent` TEXT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `impersonatedBy` TEXT NULL,

    INDEX `session_expiresAt_idx`(`expiresAt` ASC),
    UNIQUE INDEX `session_token_key`(`token` ASC),
    INDEX `session_userId_fkey`(`userId` ASC),
    INDEX `session_userId_idx`(`userId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `snippet` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL,
    `content` LONGTEXT NOT NULL,
    `language` VARCHAR(191) NULL,
    `isPublic` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ownerId` VARCHAR(191) NOT NULL,
    `deletedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `isDeleted` BOOLEAN NULL,

    INDEX `snippet_ownerId_idx`(`ownerId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `task` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `cronExpression` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdBy` VARCHAR(191) NULL,
    `args` LONGTEXT NULL,
    `lastExecutionAt` DATETIME(3) NULL,
    `maxRetries` INTEGER NOT NULL DEFAULT 3,
    `nextExecutionAt` DATETIME(3) NULL,
    `retryCount` INTEGER NOT NULL DEFAULT 0,
    `taskFunction` VARCHAR(191) NOT NULL,
    `timeout` INTEGER NULL DEFAULT 120000,

    INDEX `task_createdBy_fkey`(`createdBy` ASC),
    INDEX `task_enabled_nextExecutionAt_idx`(`enabled` ASC, `nextExecutionAt` ASC),
    UNIQUE INDEX `task_name_key`(`name` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `task_execution` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,
    `duration` INTEGER NULL,
    `result` LONGTEXT NULL,
    `error` TEXT NULL,
    `logs` LONGTEXT NULL,
    `triggeredBy` VARCHAR(191) NOT NULL,
    `executedBy` VARCHAR(191) NULL,

    INDEX `task_execution_executedBy_fkey`(`executedBy` ASC),
    INDEX `task_execution_startedAt_idx`(`startedAt` ASC),
    INDEX `task_execution_status_idx`(`status` ASC),
    INDEX `task_execution_taskId_startedAt_idx`(`taskId` ASC, `startedAt` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `template` (
    `id` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `description` TEXT NULL,
    `prompt` TEXT NOT NULL,
    `inputImageCount` INTEGER NOT NULL DEFAULT 1,
    `variables` LONGTEXT NULL,
    `previewImages` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `maxImageCount` INTEGER NOT NULL DEFAULT 4,
    `minImageCount` INTEGER NOT NULL DEFAULT 1,
    `editingModelId` VARCHAR(191) NULL,
    `editingModelFieldValues` LONGTEXT NULL,

    INDEX `template_createdBy_idx`(`createdBy` ASC),
    INDEX `template_editingModelId_idx`(`editingModelId` ASC),
    INDEX `template_isActive_idx`(`isActive` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `template_generation` (
    `id` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `variableValues` LONGTEXT NOT NULL,
    `finalPrompt` TEXT NOT NULL,
    `resultFileId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'success',
    `errorMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `replicateId` TEXT NULL,
    `replicateStatus` TEXT NULL,
    `originalImageUrls` LONGTEXT NULL,
    `customTitle` TEXT NULL,

    INDEX `template_generation_createdAt_idx`(`createdAt` ASC),
    INDEX `template_generation_resultFileId_fkey`(`resultFileId` ASC),
    INDEX `template_generation_status_idx`(`status` ASC),
    INDEX `template_generation_templateId_idx`(`templateId` ASC),
    INDEX `template_generation_userId_idx`(`userId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `template_global_variable` (
    `id` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `globalVariableId` VARCHAR(191) NOT NULL,
    `addedOptions` LONGTEXT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `required` BOOLEAN NULL,

    INDEX `template_global_variable_globalVariableId_idx`(`globalVariableId` ASC),
    UNIQUE INDEX `template_global_variable_templateId_globalVariableId_key`(`templateId` ASC, `globalVariableId` ASC),
    INDEX `template_global_variable_templateId_idx`(`templateId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT false,
    `image` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `bio` VARCHAR(150) NULL,
    `description` TEXT NULL,
    `isProfilePublic` BOOLEAN NOT NULL DEFAULT true,
    `receiveEmail` BOOLEAN NOT NULL DEFAULT true,
    `banExpires` DATETIME(3) NULL,
    `banReason` TEXT NULL,
    `banned` BOOLEAN NULL,
    `emailVerified` BOOLEAN NOT NULL DEFAULT false,
    `name` TEXT NOT NULL DEFAULT 'Mysterious User',
    `role` TEXT NULL,
    `deletedAt` DATETIME(3) NULL,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `showAllFilesIncludesFoldered` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `user_email_key`(`email` ASC),
    INDEX `user_id_idx`(`id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_group_assignment` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `groupId` VARCHAR(191) NOT NULL,
    `createdByUserId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `user_group_assignment_createdByUserId_idx`(`createdByUserId` ASC),
    INDEX `user_group_assignment_groupId_idx`(`groupId` ASC),
    UNIQUE INDEX `user_group_assignment_userId_groupId_key`(`userId` ASC, `groupId` ASC),
    INDEX `user_group_assignment_userId_idx`(`userId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `verification` (
    `id` VARCHAR(191) NOT NULL,
    `identifier` TEXT NOT NULL,
    `value` TEXT NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `verification_identifier_idx`(`identifier`(191) ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `account` ADD CONSTRAINT `account_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `apikey` ADD CONSTRAINT `apikey_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cached_image` ADD CONSTRAINT `cached_image_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `editing_model` ADD CONSTRAINT `editing_model_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `editing_model_field` ADD CONSTRAINT `editing_model_field_modelId_fkey` FOREIGN KEY (`modelId`) REFERENCES `editing_model`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `file` ADD CONSTRAINT `file_folderId_fkey` FOREIGN KEY (`folderId`) REFERENCES `folder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `file` ADD CONSTRAINT `file_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `file_metadata` ADD CONSTRAINT `file_metadata_fileId_fkey` FOREIGN KEY (`fileId`) REFERENCES `file`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `folder` ADD CONSTRAINT `folder_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `form_share` ADD CONSTRAINT `form_share_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `form_share_field` ADD CONSTRAINT `form_share_field_formId_fkey` FOREIGN KEY (`formId`) REFERENCES `form_share`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `generation_model` ADD CONSTRAINT `generation_model_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `model_field` ADD CONSTRAINT `model_field_modelId_fkey` FOREIGN KEY (`modelId`) REFERENCES `generation_model`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ocr_result` ADD CONSTRAINT `ocr_result_fileId_fkey` FOREIGN KEY (`fileId`) REFERENCES `file`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rbac_group_inheritance` ADD CONSTRAINT `rbac_group_inheritance_childGroupId_fkey` FOREIGN KEY (`childGroupId`) REFERENCES `rbac_group`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rbac_group_inheritance` ADD CONSTRAINT `rbac_group_inheritance_parentGroupId_fkey` FOREIGN KEY (`parentGroupId`) REFERENCES `rbac_group`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rbac_group_permission` ADD CONSTRAINT `rbac_group_permission_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `rbac_group`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `session` ADD CONSTRAINT `session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `snippet` ADD CONSTRAINT `snippet_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task` ADD CONSTRAINT `task_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_execution` ADD CONSTRAINT `task_execution_executedBy_fkey` FOREIGN KEY (`executedBy`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_execution` ADD CONSTRAINT `task_execution_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `template` ADD CONSTRAINT `template_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `template` ADD CONSTRAINT `template_editingModelId_fkey` FOREIGN KEY (`editingModelId`) REFERENCES `editing_model`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `template_generation` ADD CONSTRAINT `template_generation_resultFileId_fkey` FOREIGN KEY (`resultFileId`) REFERENCES `file`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `template_generation` ADD CONSTRAINT `template_generation_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `template`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `template_generation` ADD CONSTRAINT `template_generation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `template_global_variable` ADD CONSTRAINT `template_global_variable_globalVariableId_fkey` FOREIGN KEY (`globalVariableId`) REFERENCES `global_variable`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `template_global_variable` ADD CONSTRAINT `template_global_variable_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `template`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_group_assignment` ADD CONSTRAINT `user_group_assignment_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_group_assignment` ADD CONSTRAINT `user_group_assignment_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `rbac_group`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_group_assignment` ADD CONSTRAINT `user_group_assignment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


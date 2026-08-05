ALTER TABLE `token`
  ADD COLUMN `stripMetadata` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `flowId` VARCHAR(191) NULL;

CREATE INDEX `token_flowId_idx` ON `token`(`flowId`);

ALTER TABLE `file`
  ADD COLUMN `sha256` VARCHAR(64) NULL,
  ADD COLUMN `md5` VARCHAR(32) NULL,
  ADD COLUMN `phash` VARCHAR(64) NULL,
  ADD COLUMN `scrubReport` JSON NULL,
  ADD COLUMN `moderationStatus` VARCHAR(32) NOT NULL DEFAULT 'clear';

CREATE INDEX `file_sha256_idx` ON `file`(`sha256`);
CREATE INDEX `file_md5_idx` ON `file`(`md5`);
CREATE INDEX `file_phash_idx` ON `file`(`phash`);
CREATE INDEX `file_moderationStatus_idx` ON `file`(`moderationStatus`);

CREATE TABLE `file_rendition` (
  `id` VARCHAR(191) NOT NULL,
  `sourceFileId` VARCHAR(191) NOT NULL,
  `paramHash` VARCHAR(64) NOT NULL,
  `params` JSON NOT NULL,
  `s3Key` TEXT NOT NULL,
  `contentType` VARCHAR(191) NOT NULL,
  `size` INTEGER NOT NULL,
  `width` INTEGER NULL,
  `height` INTEGER NULL,
  `private` BOOLEAN NOT NULL DEFAULT false,
  `lastAccessedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
);

CREATE UNIQUE INDEX `file_rendition_paramHash_key` ON `file_rendition`(`paramHash`);
CREATE INDEX `file_rendition_sourceFileId_idx` ON `file_rendition`(`sourceFileId`);
CREATE INDEX `file_rendition_lastAccessedAt_idx` ON `file_rendition`(`lastAccessedAt`);

CREATE TABLE `denylist_entry` (
  `id` VARCHAR(191) NOT NULL,
  `hashType` VARCHAR(16) NOT NULL,
  `hash` VARCHAR(128) NOT NULL,
  `source` VARCHAR(64) NOT NULL DEFAULT 'private',
  `severity` VARCHAR(32) NOT NULL DEFAULT 'block',
  `notes` TEXT NULL,
  `addedBy` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
);

CREATE UNIQUE INDEX `denylist_entry_hashType_hash_key` ON `denylist_entry`(`hashType`, `hash`);
CREATE INDEX `denylist_entry_source_idx` ON `denylist_entry`(`source`);
CREATE INDEX `denylist_entry_addedBy_idx` ON `denylist_entry`(`addedBy`);

CREATE TABLE `moderation_case` (
  `id` VARCHAR(191) NOT NULL,
  `fileId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'quarantined',
  `matchType` VARCHAR(32) NOT NULL,
  `matchedEntryId` VARCHAR(191) NULL,
  `distance` INTEGER NULL,
  `uploaderId` VARCHAR(191) NULL,
  `reviewerId` VARCHAR(191) NULL,
  `resolution` TEXT NULL,
  `uploadMetadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `resolvedAt` DATETIME(3) NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
);

CREATE INDEX `moderation_case_fileId_idx` ON `moderation_case`(`fileId`);
CREATE INDEX `moderation_case_status_createdAt_idx` ON `moderation_case`(`status`, `createdAt`);
CREATE INDEX `moderation_case_uploaderId_idx` ON `moderation_case`(`uploaderId`);
CREATE INDEX `moderation_case_reviewerId_idx` ON `moderation_case`(`reviewerId`);

CREATE TABLE `flow` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `ownerId` VARCHAR(191) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `triggerType` VARCHAR(40) NOT NULL,
  `graph` JSON NOT NULL,
  `version` INTEGER NOT NULL DEFAULT 1,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
);

CREATE INDEX `flow_ownerId_triggerType_enabled_idx` ON `flow`(`ownerId`, `triggerType`, `enabled`);
CREATE INDEX `flow_ownerId_isActive_idx` ON `flow`(`ownerId`, `isActive`);

CREATE TABLE `flow_run` (
  `id` VARCHAR(191) NOT NULL,
  `flowId` VARCHAR(191) NOT NULL,
  `ownerId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'pending',
  `triggeredBy` VARCHAR(40) NOT NULL,
  `items` JSON NULL,
  `logs` JSON NULL,
  `error` TEXT NULL,
  `duration` INTEGER NULL,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
);

CREATE INDEX `flow_run_flowId_startedAt_idx` ON `flow_run`(`flowId`, `startedAt`);
CREATE INDEX `flow_run_ownerId_startedAt_idx` ON `flow_run`(`ownerId`, `startedAt`);
CREATE INDEX `flow_run_status_idx` ON `flow_run`(`status`);

CREATE TABLE `view_event` (
  `id` VARCHAR(191) NOT NULL,
  `targetKind` VARCHAR(32) NOT NULL,
  `targetId` VARCHAR(191) NOT NULL,
  `ownerId` VARCHAR(191) NULL,
  `country` VARCHAR(2) NULL,
  `referrerHost` VARCHAR(191) NULL,
  `deviceClass` VARCHAR(20) NOT NULL DEFAULT 'desktop',
  `visitorHash` VARCHAR(64) NOT NULL,
  `serverMs` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
);

CREATE INDEX `view_event_targetKind_targetId_createdAt_idx` ON `view_event`(`targetKind`, `targetId`, `createdAt`);
CREATE INDEX `view_event_ownerId_createdAt_idx` ON `view_event`(`ownerId`, `createdAt`);
CREATE INDEX `view_event_visitorHash_idx` ON `view_event`(`visitorHash`);

CREATE TABLE `view_daily_rollup` (
  `id` VARCHAR(191) NOT NULL,
  `targetKind` VARCHAR(32) NOT NULL,
  `targetId` VARCHAR(191) NOT NULL,
  `ownerId` VARCHAR(191) NULL,
  `day` VARCHAR(10) NOT NULL,
  `views` INTEGER NOT NULL DEFAULT 0,
  `uniques` INTEGER NOT NULL DEFAULT 0,
  `referrerBreakdown` JSON NULL,
  `countryBreakdown` JSON NULL,
  `deviceBreakdown` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
);

CREATE UNIQUE INDEX `view_daily_rollup_targetKind_targetId_day_key` ON `view_daily_rollup`(`targetKind`, `targetId`, `day`);
CREATE INDEX `view_daily_rollup_ownerId_day_idx` ON `view_daily_rollup`(`ownerId`, `day`);

CREATE TABLE `egress_event` (
  `id` VARCHAR(191) NOT NULL,
  `fileId` VARCHAR(191) NULL,
  `ownerId` VARCHAR(191) NOT NULL,
  `tokenId` VARCHAR(191) NULL,
  `formShareId` VARCHAR(191) NULL,
  `rendition` VARCHAR(32) NOT NULL DEFAULT 'original',
  `bytes` BIGINT NOT NULL,
  `wasEstimated` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
);

CREATE INDEX `egress_event_ownerId_createdAt_idx` ON `egress_event`(`ownerId`, `createdAt`);
CREATE INDEX `egress_event_fileId_createdAt_idx` ON `egress_event`(`fileId`, `createdAt`);
CREATE INDEX `egress_event_tokenId_createdAt_idx` ON `egress_event`(`tokenId`, `createdAt`);

CREATE TABLE `egress_rollup` (
  `id` VARCHAR(191) NOT NULL,
  `ownerId` VARCHAR(191) NOT NULL,
  `fileId` VARCHAR(191) NULL,
  `tokenId` VARCHAR(191) NULL,
  `rendition` VARCHAR(32) NOT NULL DEFAULT 'original',
  `period` VARCHAR(7) NOT NULL,
  `bytes` BIGINT NOT NULL DEFAULT 0,
  `requestCount` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
);

CREATE UNIQUE INDEX `egress_rollup_ownerId_period_fileId_tokenId_rendition_key` ON `egress_rollup`(`ownerId`, `period`, `fileId`, `tokenId`, `rendition`);
CREATE INDEX `egress_rollup_ownerId_period_idx` ON `egress_rollup`(`ownerId`, `period`);
CREATE INDEX `egress_rollup_fileId_period_idx` ON `egress_rollup`(`fileId`, `period`);

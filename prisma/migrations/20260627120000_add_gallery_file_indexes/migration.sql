-- Add indexes for the hottest gallery timeline reads.
CREATE INDEX `file_ownerId_isDeleted_createdAt_id_idx` ON `file`(`ownerId` ASC, `isDeleted` ASC, `createdAt` ASC, `id` ASC);

CREATE INDEX `file_ownerId_isDeleted_folderId_createdAt_id_idx` ON `file`(
    `ownerId` ASC,
    `isDeleted` ASC,
    `folderId` ASC,
    `createdAt` ASC,
    `id` ASC
);

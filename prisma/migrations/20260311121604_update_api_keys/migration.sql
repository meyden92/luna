/*
  Warnings:

  - Added the required column `configId` to the `apikey` table without a default value. This is not possible if the table is not empty.
  - Added the required column `referenceId` to the `apikey` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `apikey` ADD COLUMN `configId` TEXT NOT NULL,
    ADD COLUMN `referenceId` TEXT NOT NULL;

-- CreateIndex
CREATE INDEX `apikey_configId_idx` ON `apikey`(`configId`(191));

-- CreateIndex
CREATE INDEX `apikey_referenceId_idx` ON `apikey`(`referenceId`(191));

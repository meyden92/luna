/*
  Warnings:

  - You are about to drop the `apikey` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `apikey` DROP FOREIGN KEY `apikey_userId_fkey`;

-- DropTable
DROP TABLE `apikey`;

-- CreateTable
CREATE TABLE `token` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `key` VARCHAR(64) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `compressImage` BOOLEAN NOT NULL DEFAULT false,
    `convertToJpeg` BOOLEAN NOT NULL DEFAULT false,
    `jpegQuality` INTEGER NOT NULL DEFAULT 85,
    `folderId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `token_key_key`(`key`),
    INDEX `token_key_idx`(`key`),
    INDEX `token_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `token` ADD CONSTRAINT `token_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

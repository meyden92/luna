-- CreateTable
CREATE TABLE `nicotine_entry` (
    `id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(20) NOT NULL,
    `note` TEXT NULL,
    `occurred_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `owner_id` VARCHAR(191) NOT NULL,

    INDEX `nicotine_entry_owner_id_occurred_at_idx`(`owner_id`, `occurred_at`),
    INDEX `nicotine_entry_owner_id_kind_occurred_at_idx`(`owner_id`, `kind`, `occurred_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `nicotine_entry` ADD CONSTRAINT `nicotine_entry_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

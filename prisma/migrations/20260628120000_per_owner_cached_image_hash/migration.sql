-- Cached images are looked up and listed per owner. The old global url/hash
-- uniqueness prevented a second owner from recording their own cache row for
-- the same shared S3 cache object.
DROP INDEX `cached_image_url_key` ON `cached_image`;
DROP INDEX `cached_image_hash_key` ON `cached_image`;
DROP INDEX `cached_image_hash_idx` ON `cached_image`;

CREATE UNIQUE INDEX `cached_image_ownerId_hash_key` ON `cached_image`(`ownerId` ASC, `hash` ASC);

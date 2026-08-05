-- Preserve cleanup lookup performance now that cached_image.url is no longer
-- globally unique.
CREATE INDEX `cached_image_url_idx` ON `cached_image`(`url` ASC);

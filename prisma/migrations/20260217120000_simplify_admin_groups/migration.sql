-- Simplify authorization model to two system groups: user + admin.

DROP TABLE IF EXISTS `rbac_group_permission`;
DROP TABLE IF EXISTS `rbac_group_inheritance`;
DROP TABLE IF EXISTS `permission_definition`;

INSERT IGNORE INTO `rbac_group` (`id`, `key`, `name`, `description`, `isSystem`, `createdAt`, `updatedAt`)
VALUES
  (UUID(), 'user', 'User', 'Default access for all authenticated users.', TRUE, NOW(3), NOW(3)),
  (UUID(), 'admin', 'Admin', 'Administrative access to all admin routes and actions.', TRUE, NOW(3), NOW(3));

UPDATE `rbac_group`
SET `isSystem` = TRUE
WHERE `key` IN ('user', 'admin');

DELETE uga
FROM `user_group_assignment` uga
JOIN `rbac_group` rg ON rg.`id` = uga.`groupId`
WHERE rg.`key` NOT IN ('user', 'admin');

DELETE FROM `rbac_group`
WHERE `key` NOT IN ('user', 'admin');

INSERT INTO `user_group_assignment` (`id`, `userId`, `groupId`, `createdByUserId`, `createdAt`)
SELECT UUID(), u.`id`, user_group.`id`, NULL, NOW(3)
FROM `user` u
JOIN `rbac_group` user_group ON user_group.`key` = 'user'
LEFT JOIN `user_group_assignment` uga
  ON uga.`userId` = u.`id` AND uga.`groupId` = user_group.`id`
WHERE uga.`id` IS NULL;

-- Transition legacy pattern-based RBAC permissions to node-based permissions
-- without data loss, then enforce the new relational constraints.

-- 1) Add new column as nullable for staged migration.
ALTER TABLE `rbac_group_permission`
  ADD COLUMN IF NOT EXISTS `permissionNode` VARCHAR(191) NULL AFTER `groupId`;

-- 2) Seed known permission definitions so wildcard expansion has a catalog.
INSERT IGNORE INTO `permission_definition` (`id`, `node`, `description`, `isAssignable`, `createdAt`, `updatedAt`)
VALUES
  (UUID(), 'admin.panel.access', 'Access to the admin area', true, NOW(3), NOW(3)),
  (UUID(), 'admin.users.view', 'View users in admin', true, NOW(3), NOW(3)),
  (UUID(), 'admin.users.manage', 'Manage user profile state and sessions', true, NOW(3), NOW(3)),
  (UUID(), 'admin.users.ban', 'Suspend or reactivate users', true, NOW(3), NOW(3)),
  (UUID(), 'admin.users.delete', 'Delete users', true, NOW(3), NOW(3)),
  (UUID(), 'admin.files.view_deleted', 'View deleted files', true, NOW(3), NOW(3)),
  (UUID(), 'admin.files.delete', 'Delete files across users', true, NOW(3), NOW(3)),
  (UUID(), 'admin.templates.manage', 'Create, update and delete templates', true, NOW(3), NOW(3)),
  (UUID(), 'admin.models.manage', 'Manage generation and editing models', true, NOW(3), NOW(3)),
  (UUID(), 'admin.global_variables.manage', 'Manage global variables', true, NOW(3), NOW(3)),
  (UUID(), 'admin.tasks.view', 'View task definitions, executions and stats', true, NOW(3), NOW(3)),
  (UUID(), 'admin.tasks.manage', 'Create, update, delete and toggle tasks', true, NOW(3), NOW(3)),
  (UUID(), 'admin.tasks.execute', 'Manually execute tasks and cleanup executions', true, NOW(3), NOW(3)),
  (UUID(), 'admin.system.cache.purge', 'Delete cache and generations', true, NOW(3), NOW(3)),
  (UUID(), 'admin.audit.view', 'View audit logs', true, NOW(3), NOW(3)),
  (UUID(), 'admin.rbac.view', 'View RBAC groups and assignments', true, NOW(3), NOW(3)),
  (UUID(), 'admin.rbac.manage', 'Manage RBAC groups, inheritance and assignments', true, NOW(3), NOW(3)),
  (UUID(), 'user.ai.view', 'View AI section', true, NOW(3), NOW(3)),
  (UUID(), 'user.ai.create', 'Create AI jobs', true, NOW(3), NOW(3)),
  (UUID(), 'user.ai.edit', 'Edit AI jobs', true, NOW(3), NOW(3)),
  (UUID(), 'user.files.view', 'View files', true, NOW(3), NOW(3)),
  (UUID(), 'user.files.upload', 'Upload files', true, NOW(3), NOW(3)),
  (UUID(), 'user.files.download', 'Download files', true, NOW(3), NOW(3)),
  (UUID(), 'user.files.delete', 'Delete own files', true, NOW(3), NOW(3)),
  (UUID(), 'user.settings.view', 'View settings', true, NOW(3), NOW(3));

-- 3) Resolve old rows into explicit nodes.
CREATE TEMPORARY TABLE `tmp_resolved_rbac_group_permission` (
  `groupId` VARCHAR(191) NOT NULL,
  `permissionNode` VARCHAR(191) NOT NULL,
  `effect` ENUM('ALLOW', 'DENY') NOT NULL
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 3a) Exact legacy patterns map 1:1 to permission nodes.
INSERT INTO `tmp_resolved_rbac_group_permission` (`groupId`, `permissionNode`, `effect`)
SELECT
  `groupId`,
  LOWER(TRIM(`pattern`)) AS `permissionNode`,
  `effect`
FROM `rbac_group_permission`
WHERE `pattern` IS NOT NULL
  AND TRIM(`pattern`) <> ''
  AND `pattern` NOT LIKE '%*%';

-- 3b) Wildcards are expanded against known permission definitions.
INSERT INTO `tmp_resolved_rbac_group_permission` (`groupId`, `permissionNode`, `effect`)
SELECT
  rp.`groupId`,
  pd.`node` AS `permissionNode`,
  rp.`effect`
FROM `rbac_group_permission` rp
JOIN `permission_definition` pd
  ON (
    LOWER(TRIM(rp.`pattern`)) = '*'
    OR (
      RIGHT(LOWER(TRIM(rp.`pattern`)), 2) = '.*'
      AND (
        pd.`node` = LEFT(LOWER(TRIM(rp.`pattern`)), LENGTH(LOWER(TRIM(rp.`pattern`))) - 2)
        OR pd.`node` LIKE CONCAT(LEFT(LOWER(TRIM(rp.`pattern`)), LENGTH(LOWER(TRIM(rp.`pattern`))) - 2), '.%')
      )
    )
  )
WHERE rp.`pattern` LIKE '%*%';

-- 3c) Keep unusual wildcard-like literals as-is so no row is lost.
INSERT INTO `tmp_resolved_rbac_group_permission` (`groupId`, `permissionNode`, `effect`)
SELECT
  `groupId`,
  LOWER(TRIM(`pattern`)) AS `permissionNode`,
  `effect`
FROM `rbac_group_permission`
WHERE `pattern` IS NOT NULL
  AND TRIM(`pattern`) <> ''
  AND `pattern` LIKE '%*%'
  AND NOT (
    LOWER(TRIM(`pattern`)) = '*'
    OR RIGHT(LOWER(TRIM(`pattern`)), 2) = '.*'
  );

-- 4) Ensure every resolved node has a definition for FK integrity.
INSERT IGNORE INTO `permission_definition` (`id`, `node`, `description`, `isAssignable`, `createdAt`, `updatedAt`)
SELECT
  UUID(),
  t.`permissionNode`,
  'Migrated legacy RBAC permission node',
  true,
  NOW(3),
  NOW(3)
FROM `tmp_resolved_rbac_group_permission` t;

-- 5) Collapse conflicts with DENY precedence per (groupId, permissionNode).
CREATE TEMPORARY TABLE `tmp_collapsed_rbac_group_permission` (
  `groupId` VARCHAR(191) NOT NULL,
  `permissionNode` VARCHAR(191) NOT NULL,
  `effect` ENUM('ALLOW', 'DENY') NOT NULL
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `tmp_collapsed_rbac_group_permission` (`groupId`, `permissionNode`, `effect`)
SELECT
  `groupId`,
  `permissionNode`,
  CASE
    WHEN SUM(`effect` = 'DENY') > 0 THEN 'DENY'
    ELSE 'ALLOW'
  END AS `effect`
FROM `tmp_resolved_rbac_group_permission`
GROUP BY `groupId`, `permissionNode`;

-- 6) Replace table data with normalized node-based entries.
DELETE FROM `rbac_group_permission`;

INSERT INTO `rbac_group_permission` (`id`, `groupId`, `pattern`, `permissionNode`, `effect`, `createdAt`, `updatedAt`)
SELECT
  UUID(),
  `groupId`,
  `permissionNode`,
  `permissionNode`,
  `effect`,
  NOW(3),
  NOW(3)
FROM `tmp_collapsed_rbac_group_permission`;

-- 7) Drop legacy pattern indexes/column and enforce new constraints.
ALTER TABLE `rbac_group_permission`
  DROP INDEX `rbac_group_permission_groupId_pattern_effect_key`,
  DROP INDEX `rbac_group_permission_pattern_idx`;

ALTER TABLE `rbac_group_permission`
  MODIFY `permissionNode` VARCHAR(191) NOT NULL,
  DROP COLUMN `pattern`,
  ADD UNIQUE INDEX `rbac_group_permission_groupId_permissionNode_key`(`groupId`, `permissionNode`),
  ADD INDEX `rbac_group_permission_permissionNode_idx`(`permissionNode`);

ALTER TABLE `rbac_group_permission`
  ADD CONSTRAINT `rbac_group_permission_permissionNode_fkey`
  FOREIGN KEY (`permissionNode`) REFERENCES `permission_definition`(`node`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

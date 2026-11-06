ALTER TABLE `model`
  ADD COLUMN `model_key` VARCHAR(128) NULL AFTER `channel_id`,
  ADD COLUMN `route_weight` INT NOT NULL DEFAULT 100 AFTER `model_key`;

UPDATE `model`
SET `model_key` = `upstream_model`
WHERE `model_key` IS NULL OR `model_key` = '';

ALTER TABLE `model`
  MODIFY COLUMN `model_key` VARCHAR(128) NOT NULL,
  ADD KEY `idx_model_route` (`model_key`, `capability`, `enabled`);

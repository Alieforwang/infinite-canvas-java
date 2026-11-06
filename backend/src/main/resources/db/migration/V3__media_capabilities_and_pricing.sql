ALTER TABLE `channel`
  ADD COLUMN `capabilities` JSON NULL AFTER `protocol`;

UPDATE `channel`
SET `capabilities` = JSON_ARRAY('video')
WHERE `capabilities` IS NULL;

ALTER TABLE `channel`
  MODIFY COLUMN `capabilities` JSON NOT NULL;

ALTER TABLE `model`
  ADD COLUMN `pricing_rules` JSON NULL AFTER `credits_per_second`;

CREATE TABLE `upstream_price_snapshot` (
  `channel_id` BIGINT UNSIGNED NOT NULL,
  `pricing_version` VARCHAR(255) NULL,
  `synced_at` DATETIME(6) NOT NULL,
  PRIMARY KEY (`channel_id`),
  CONSTRAINT `fk_upstream_price_channel` FOREIGN KEY (`channel_id`) REFERENCES `channel` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `upstream_price` (
  `channel_id` BIGINT UNSIGNED NOT NULL,
  `upstream_model` VARCHAR(255) NOT NULL,
  `quota_type` INT NOT NULL,
  `model_price` DECIMAL(24,10) NULL,
  `group_ratio` DECIMAL(24,10) NULL,
  `synced_at` DATETIME(6) NOT NULL,
  PRIMARY KEY (`channel_id`, `upstream_model`),
  CONSTRAINT `fk_upstream_price_snapshot` FOREIGN KEY (`channel_id`) REFERENCES `upstream_price_snapshot` (`channel_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

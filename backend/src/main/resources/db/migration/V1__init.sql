-- V1__init.sql · 无限画布·视频生成平台
-- 约定：积分 BIGINT 整数；金额 DECIMAL(18,4)；时间 DATETIME(3) 存 UTC；不建物理外键
SET NAMES utf8mb4;

CREATE TABLE `user` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(190) NOT NULL,
  `password_hash` VARCHAR(100) NOT NULL,
  `display_name` VARCHAR(64) NOT NULL DEFAULT '',
  `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  `role` VARCHAR(16) NOT NULL DEFAULT 'USER',
  `last_login_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_email` (`email`),
  KEY `idx_user_status` (`status`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `admin_user` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(64) NOT NULL,
  `password_hash` VARCHAR(100) NOT NULL,
  `display_name` VARCHAR(64) NOT NULL DEFAULT '',
  `role` VARCHAR(16) NOT NULL DEFAULT 'SUPER_ADMIN',
  `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  `last_login_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_admin_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `user_refresh_token` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `revoked_at` DATETIME(3) NULL,
  `user_agent` VARCHAR(255) NOT NULL DEFAULT '',
  `ip` VARCHAR(45) NOT NULL DEFAULT '',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_urt_hash` (`token_hash`),
  KEY `idx_urt_user` (`user_id`,`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `credit_account` (
  `user_id` BIGINT UNSIGNED NOT NULL,
  `available` BIGINT NOT NULL DEFAULT 0,
  `frozen` BIGINT NOT NULL DEFAULT 0,
  `total_consumed` BIGINT NOT NULL DEFAULT 0,
  `total_recharged` BIGINT NOT NULL DEFAULT 0,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `credit_transaction` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `biz_type` VARCHAR(24) NOT NULL,
  `available_delta` BIGINT NOT NULL,
  `frozen_delta` BIGINT NOT NULL,
  `balance_after` BIGINT NOT NULL,
  `task_id` BIGINT UNSIGNED NULL,
  `order_id` BIGINT UNSIGNED NULL,
  `redeem_code_id` BIGINT UNSIGNED NULL,
  `idempotency_key` VARCHAR(128) NOT NULL,
  `operator_admin_id` BIGINT UNSIGNED NULL,
  `remark` VARCHAR(255) NOT NULL DEFAULT '',
  `request_id` VARCHAR(64) NOT NULL DEFAULT '',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ct_idem` (`idempotency_key`),
  KEY `idx_ct_user` (`user_id`,`created_at`),
  KEY `idx_ct_task` (`task_id`),
  KEY `idx_ct_biz` (`biz_type`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `plan` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(32) NOT NULL,
  `name` VARCHAR(64) NOT NULL,
  `type` VARCHAR(16) NOT NULL DEFAULT 'CREDIT_PACK',
  `price_amount` DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  `credits` BIGINT NOT NULL DEFAULT 0,
  `bonus_credits` BIGINT NOT NULL DEFAULT 0,
  `valid_days` INT NOT NULL DEFAULT 0,
  `description` VARCHAR(500) NOT NULL DEFAULT '',
  `sort` INT NOT NULL DEFAULT 0,
  `enabled` TINYINT NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_plan_code` (`code`),
  KEY `idx_plan_enabled` (`enabled`,`sort`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `plan_order` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_no` CHAR(26) NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `plan_id` BIGINT UNSIGNED NULL,
  `type` VARCHAR(16) NOT NULL DEFAULT 'PURCHASE',
  `pay_method` VARCHAR(16) NOT NULL DEFAULT 'MANUAL',
  `amount` DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  `credits` BIGINT NOT NULL DEFAULT 0,
  `status` VARCHAR(16) NOT NULL DEFAULT 'PAID',
  `operator_admin_id` BIGINT UNSIGNED NULL,
  `remark` VARCHAR(255) NOT NULL DEFAULT '',
  `paid_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_no` (`order_no`),
  KEY `idx_po_user` (`user_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `user_plan` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `plan_id` BIGINT UNSIGNED NOT NULL,
  `order_id` BIGINT UNSIGNED NULL,
  `credits_total` BIGINT NOT NULL DEFAULT 0,
  `credits_used` BIGINT NOT NULL DEFAULT 0,
  `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expires_at` DATETIME(3) NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_up_user` (`user_id`,`status`,`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `redeem_code` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(32) NOT NULL,
  `batch_no` VARCHAR(32) NOT NULL DEFAULT '',
  `prefix` VARCHAR(8) NOT NULL DEFAULT '',
  `credits` BIGINT NOT NULL DEFAULT 0,
  `plan_id` BIGINT UNSIGNED NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'UNUSED',
  `used_by_user_id` BIGINT UNSIGNED NULL,
  `used_at` DATETIME(3) NULL,
  `expires_at` DATETIME(3) NULL,
  `created_by_admin_id` BIGINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_redeem_code` (`code`),
  KEY `idx_rc_batch` (`batch_no`,`status`),
  KEY `idx_rc_user` (`used_by_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `channel` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(64) NOT NULL,
  `protocol` VARCHAR(32) NOT NULL DEFAULT 'openai-official',
  `base_url` VARCHAR(255) NOT NULL,
  `normalized_base_url` VARCHAR(255) NOT NULL,
  `api_key_cipher` VARBINARY(1024) NOT NULL,
  `api_key_mask` VARCHAR(32) NOT NULL DEFAULT '',
  `auth_type` VARCHAR(16) NOT NULL DEFAULT 'bearer',
  `auth_header` VARCHAR(64) NOT NULL DEFAULT '',
  `extra_headers` JSON NULL,
  `connect_timeout_ms` INT NOT NULL DEFAULT 5000,
  `read_timeout_ms` INT NOT NULL DEFAULT 60000,
  `max_concurrency` INT NOT NULL DEFAULT 8,
  `enabled` TINYINT NOT NULL DEFAULT 1,
  `last_test_at` DATETIME(3) NULL,
  `last_test_ok` TINYINT NULL,
  `last_test_message` VARCHAR(500) NOT NULL DEFAULT '',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_channel_name` (`name`),
  KEY `idx_channel_enabled` (`enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `model` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `channel_id` BIGINT UNSIGNED NOT NULL,
  `upstream_model` VARCHAR(128) NOT NULL,
  `display_name` VARCHAR(64) NOT NULL,
  `capability` VARCHAR(16) NOT NULL DEFAULT 'video',
  `enabled` TINYINT NOT NULL DEFAULT 1,
  `sort` INT NOT NULL DEFAULT 0,
  `credits_per_second` DECIMAL(12,4) NOT NULL DEFAULT 10.0000,
  `resolution_factors` JSON NOT NULL,
  `resolution_default` VARCHAR(16) NOT NULL DEFAULT '720p',
  `audio_factor` DECIMAL(6,4) NOT NULL DEFAULT 1.0000,
  `min_charge_credits` BIGINT NOT NULL DEFAULT 1,
  `supported_seconds` JSON NOT NULL,
  `supported_sizes` JSON NOT NULL,
  `supported_ratios` JSON NULL,
  `supports_audio` TINYINT NOT NULL DEFAULT 0,
  `supports_watermark` TINYINT NOT NULL DEFAULT 0,
  `supports_first_last_frame` TINYINT NOT NULL DEFAULT 0,
  `supports_reference_images` TINYINT NOT NULL DEFAULT 1,
  `max_reference_images` INT NOT NULL DEFAULT 1,
  `extra_request_params` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_model_channel_name` (`channel_id`,`upstream_model`),
  KEY `idx_model_list` (`enabled`,`sort`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `video_task` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `task_no` CHAR(26) NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `channel_id` BIGINT UNSIGNED NOT NULL,
  `model_id` BIGINT UNSIGNED NOT NULL,
  `status` VARCHAR(24) NOT NULL,
  `idempotency_key` VARCHAR(128) NULL,
  `request_hash` CHAR(64) NOT NULL,
  `prompt` TEXT NOT NULL,
  `params_json` JSON NOT NULL,
  `references_json` JSON NOT NULL,
  `upstream_task_id` VARCHAR(191) NULL,
  `upstream_status` VARCHAR(32) NULL,
  `upstream_request_id` VARCHAR(191) NULL,
  `upstream_result_url` VARCHAR(2048) NULL,
  `result_expires_at` DATETIME(3) NULL,
  `progress` INT NOT NULL DEFAULT 0,
  `file_id` BIGINT UNSIGNED NULL,
  `held_credits` BIGINT NOT NULL DEFAULT 0,
  `settled_credits` BIGINT NOT NULL DEFAULT 0,
  `error_code` VARCHAR(64) NULL,
  `error_message` VARCHAR(1024) NULL,
  `attempt_count` INT NOT NULL DEFAULT 0,
  `poll_count` INT NOT NULL DEFAULT 0,
  `next_poll_at` DATETIME(3) NULL,
  `deadline_at` DATETIME(3) NOT NULL,
  `submitted_at` DATETIME(3) NULL,
  `finished_at` DATETIME(3) NULL,
  `client_ip` VARCHAR(45) NOT NULL DEFAULT '',
  `client_request_id` VARCHAR(64) NOT NULL DEFAULT '',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_task_no` (`task_no`),
  UNIQUE KEY `uk_task_idem` (`user_id`,`idempotency_key`),
  KEY `idx_task_poll` (`status`,`next_poll_at`),
  KEY `idx_task_user` (`user_id`,`created_at`),
  KEY `idx_task_admin` (`status`,`created_at`),
  KEY `idx_task_channel` (`channel_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `video_task_event` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `task_id` BIGINT UNSIGNED NOT NULL,
  `from_status` VARCHAR(24) NOT NULL DEFAULT '',
  `to_status` VARCHAR(24) NOT NULL,
  `source` VARCHAR(16) NOT NULL DEFAULT 'SYSTEM',
  `detail` VARCHAR(1024) NOT NULL DEFAULT '',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_vte_task` (`task_id`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `upstream_call_log` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `task_id` BIGINT UNSIGNED NULL,
  `task_no` CHAR(26) NOT NULL DEFAULT '',
  `action` VARCHAR(16) NOT NULL,
  `attempt` INT NOT NULL DEFAULT 1,
  `http_status` INT NULL,
  `latency_ms` INT NULL,
  `upstream_request_id` VARCHAR(191) NULL,
  `error_code` VARCHAR(64) NULL,
  `response_snippet` VARCHAR(4096) NOT NULL DEFAULT '',
  `response_headers` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_ucl_task` (`task_id`,`created_at`),
  KEY `idx_ucl_taskno` (`task_no`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `file_object` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `file_no` CHAR(26) NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `kind` VARCHAR(16) NOT NULL,
  `storage_provider` VARCHAR(16) NOT NULL DEFAULT 'local',
  `storage_key` VARCHAR(512) NOT NULL,
  `original_name` VARCHAR(255) NOT NULL DEFAULT '',
  `content_type` VARCHAR(100) NOT NULL,
  `bytes` BIGINT NOT NULL,
  `sha256` CHAR(64) NOT NULL,
  `width` INT NULL,
  `height` INT NULL,
  `duration_ms` INT NULL,
  `ref_count` INT NOT NULL DEFAULT 0,
  `status` VARCHAR(16) NOT NULL DEFAULT 'READY',
  `source_task_id` BIGINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_file_no` (`file_no`),
  KEY `idx_fo_user` (`user_id`,`created_at`),
  KEY `idx_fo_sha` (`sha256`),
  KEY `idx_fo_task` (`source_task_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `asset` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `asset_no` CHAR(26) NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `kind` VARCHAR(16) NOT NULL,
  `title` VARCHAR(200) NOT NULL DEFAULT '',
  `file_id` BIGINT UNSIGNED NULL,
  `cover_file_id` BIGINT UNSIGNED NULL,
  `text_content` MEDIUMTEXT NULL,
  `tags` JSON NULL,
  `source` VARCHAR(32) NOT NULL DEFAULT 'UPLOAD',
  `note` VARCHAR(1000) NOT NULL DEFAULT '',
  `metadata` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_asset_no` (`asset_no`),
  KEY `idx_asset_user` (`user_id`,`deleted_at`,`created_at`),
  KEY `idx_asset_kind` (`user_id`,`kind`,`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `canvas_project` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_no` CHAR(26) NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `title` VARCHAR(200) NOT NULL DEFAULT '未命名画布',
  `document_json` JSON NOT NULL,
  `node_count` INT NOT NULL DEFAULT 0,
  `file_count` INT NOT NULL DEFAULT 0,
  `document_bytes` INT NOT NULL DEFAULT 0,
  `version` INT NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_project_no` (`project_no`),
  KEY `idx_cp_user` (`user_id`,`deleted_at`,`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `system_setting` (
  `setting_key` VARCHAR(64) NOT NULL,
  `setting_value` VARCHAR(2048) NOT NULL DEFAULT '',
  `value_type` VARCHAR(16) NOT NULL DEFAULT 'STRING',
  `description` VARCHAR(255) NOT NULL DEFAULT '',
  `updated_by_admin_id` BIGINT UNSIGNED NULL,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `audit_log` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `actor_type` VARCHAR(16) NOT NULL,
  `actor_id` BIGINT UNSIGNED NULL,
  `action` VARCHAR(64) NOT NULL,
  `target_type` VARCHAR(32) NOT NULL DEFAULT '',
  `target_id` VARCHAR(64) NOT NULL DEFAULT '',
  `detail_json` JSON NULL,
  `ip` VARCHAR(45) NOT NULL DEFAULT '',
  `request_id` VARCHAR(64) NOT NULL DEFAULT '',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_al_actor` (`actor_type`,`actor_id`,`created_at`),
  KEY `idx_al_target` (`target_type`,`target_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

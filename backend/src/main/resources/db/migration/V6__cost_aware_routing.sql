-- V6__cost_aware_routing.sql
-- Phase 1: 成本感知路由 — model 表增加成本缓存和负载字段，system_setting 增加定价参数

ALTER TABLE `model`
  ADD COLUMN `cost_per_unit` DECIMAL(24,10) NULL AFTER `extra_request_params`,
  ADD COLUMN `cost_quota_type` INT NULL AFTER `cost_per_unit`,
  ADD COLUMN `cost_synced_at` DATETIME(3) NULL AFTER `cost_quota_type`,
  ADD COLUMN `current_load` INT NOT NULL DEFAULT 0 AFTER `cost_synced_at`,
  ADD KEY `idx_model_cost` (`model_key`, `capability`, `enabled`);

INSERT IGNORE INTO `system_setting` (`setting_key`, `setting_value`, `value_type`, `description`) VALUES
  ('pricing.usd_to_yuan', '7.2', 'NUMBER', '美元兑人民币汇率'),
  ('pricing.credits_per_yuan', '100', 'NUMBER', '每元兑换积分'),
  ('pricing.target_margin_percent', '20', 'NUMBER', '目标毛利率百分比'),
  ('pricing.margin_floor_percent', '10', 'NUMBER', '最低毛利率下限百分比'),
  ('pricing.margin_ceiling_percent', '30', 'NUMBER', '最高毛利率上限百分比'),
  ('routing.strategy', 'profit_first', 'STRING', '路由策略：profit_first=利润优先 / cost_first=成本优先 / weighted_only=纯加权随机'),
  ('routing.margin_floor_weight_factor', '0.1', 'NUMBER', '低于最低毛利率时的降权系数'),
  ('routing.load_balance_factor', '1.0', 'NUMBER', '负载均衡因子（0=忽略负载，1=完全负载均衡）');

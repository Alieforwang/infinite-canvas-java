-- Present money in CNY yuan while retaining the exact historical integer ledger.
-- Do NOT rescale account balances, transaction amounts, holds, plans or model sales prices.
-- The historic credit.exchange_per_yuan value is now read-only settlement precision.
INSERT IGNORE INTO `system_setting` (`setting_key`, `setting_value`, `value_type`, `description`)
VALUES ('credit.exchange_per_yuan', '100', 'INT', '人民币内部记账精度（历史兼容，只读）');

-- Earlier cost synchronization used a separate conversion ratio. If it differed,
-- discard only derived cost caches; the next successful price sync rebuilds them
-- with the wallet's settlement precision. Raw quotes and confirmed sales stay intact.
-- String comparison is deliberately conservative (100 and 100.0 may also refresh).
UPDATE `model`
SET `cost_per_unit` = NULL, `cost_quota_type` = NULL, `cost_synced_at` = NULL
WHERE COALESCE((SELECT TRIM(`setting_value`) FROM `system_setting`
                WHERE `setting_key` = 'pricing.credits_per_yuan'), '')
      <> COALESCE((SELECT TRIM(`setting_value`) FROM `system_setting`
                   WHERE `setting_key` = 'credit.exchange_per_yuan'), '100');

UPDATE `system_setting`
SET `description` = '人民币内部记账精度（历史兼容，只读）'
WHERE `setting_key` = 'credit.exchange_per_yuan';
UPDATE `system_setting`
SET `description` = '已弃用；成本统一采用人民币内部记账精度'
WHERE `setting_key` = 'pricing.credits_per_yuan';
UPDATE `system_setting`
SET `description` = '注册赠送余额（内部记账单位；界面输入人民币元）'
WHERE `setting_key` = 'user.register_gift_credits';

-- Rename only untouched demo copy, never custom plan names or any monetary value.
UPDATE `plan` SET `name` = '体验充值包'
WHERE `code` = 'pack_10' AND `name` = '体验包 1000 积分';
UPDATE `plan` SET `name` = '标准充值包'
WHERE `code` = 'pack_50' AND `name` = '标准包 5500 积分';
UPDATE `plan` SET `name` = '专业套餐'
WHERE `code` = 'plan_pro' AND `name` = '专业套餐 20000 积分';
UPDATE `plan` SET `description` = '含赠送余额'
WHERE `code` = 'pack_50' AND `description` = '含 500 赠送积分';

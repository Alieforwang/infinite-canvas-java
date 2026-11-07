-- Phase 1: one logical sale price, independent upstream routes in the existing model table.
-- Match selectCanonicalByModelKey: the oldest id is the canonical sale price.
-- The GROUP BY derived table is materialized; it is not merged into this target-table update.
UPDATE `model` AS route
JOIN (
    SELECT model_key, capability, MIN(id) AS canonical_id
    FROM `model`
    GROUP BY model_key, capability
) AS logical_groups ON logical_groups.model_key = route.model_key
    AND logical_groups.capability = route.capability
JOIN `model` AS canonical ON canonical.id = logical_groups.canonical_id
SET route.pricing_rules = canonical.pricing_rules,
    route.credits_per_second = canonical.credits_per_second,
    route.resolution_factors = canonical.resolution_factors,
    route.audio_factor = canonical.audio_factor,
    route.min_charge_credits = canonical.min_charge_credits;

-- Initialize counters for already-running work. Runtime route selection reads actual active tasks,
-- so legacy counters or an interrupted old worker cannot distort channel load balancing.
UPDATE `model` AS route
LEFT JOIN (
    SELECT model_id, COUNT(*) AS active_count
    FROM video_task
    WHERE status IN ('CREATED','SUBMITTING','SUBMIT_UNKNOWN','QUEUED','RUNNING','DOWNLOADING')
    GROUP BY model_id
) AS loads ON loads.model_id = route.id
SET route.current_load = LEAST(COALESCE(loads.active_count, 0), 2147483647);

ALTER TABLE video_task
    ADD KEY idx_task_channel_status (channel_id, status),
    ADD KEY idx_task_model_status (model_id, status);

INSERT IGNORE INTO system_setting (setting_key, setting_value, value_type, description) VALUES
    ('pricing.cost_max_age_hours', '24', 'NUMBER', '线路成本新鲜度上限（小时，1至8760）'),
    ('routing.margin_policy', 'skip', 'STRING', '最低毛利策略：skip排除最新成本低毛利线路；downweight显式允许降权回退');

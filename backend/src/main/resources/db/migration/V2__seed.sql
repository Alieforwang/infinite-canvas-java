-- V2__seed.sql · 非敏感种子数据（可重复执行）
INSERT INTO system_setting (setting_key, setting_value, value_type, description) VALUES
 ('credit.exchange_per_yuan','100','INT','1 元兑换积分'),
 ('user.register_gift_credits','100','INT','注册赠送积分'),
 ('task.max_concurrency_per_user','2','INT','每用户并发生成上限'),
 ('task.poll_timeout_minutes','30','INT','任务总时限（分钟）'),
 ('task.base_backoff_seconds','3','INT','首次轮询间隔'),
 ('task.max_backoff_seconds','20','INT','轮询间隔上限'),
 ('file.max_upload_image_mb','20','INT','单文件上传上限（图片）'),
 ('file.max_upload_video_mb','200','INT','单文件上传上限（视频）'),
 ('file.retention_days','0','INT','0=永久保留'),
 ('security.login_max_failures','5','INT','登录失败阈值'),
 ('security.allow_private_upstream','false','BOOL','是否允许内网 Base URL（SSRF 例外）'),
 ('site.notice','','STRING','顶部维护公告（空=不展示）'),
 ('user.registration_open','true','BOOL','是否开放注册')
ON DUPLICATE KEY UPDATE description = VALUES(description);

INSERT INTO plan (code, name, type, price_amount, credits, bonus_credits, valid_days, sort, enabled, description) VALUES
 ('pack_10','体验包 1000 积分','CREDIT_PACK',10.0000,1000,0,0,10,1,'适合首次体验'),
 ('pack_50','标准包 5500 积分','CREDIT_PACK',50.0000,5000,500,0,20,1,'含 500 赠送积分'),
 ('plan_pro','专业套餐 20000 积分','PLAN',200.0000,20000,0,30,30,1,'30 天有效')
ON DUPLICATE KEY UPDATE name = VALUES(name);

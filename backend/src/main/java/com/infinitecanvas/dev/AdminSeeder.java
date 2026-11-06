package com.infinitecanvas.dev;

import com.infinitecanvas.config.AppProperties;
import com.infinitecanvas.entity.AdminUser;
import com.infinitecanvas.mapper.AdminUserMapper;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class AdminSeeder implements ApplicationRunner {

    private final AdminUserMapper adminUserMapper;
    private final PasswordEncoder passwordEncoder;
    private final AppProperties props;

    public AdminSeeder(AdminUserMapper adminUserMapper, PasswordEncoder passwordEncoder, AppProperties props) {
        this.adminUserMapper = adminUserMapper;
        this.passwordEncoder = passwordEncoder;
        this.props = props;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (adminUserMapper.countAll() > 0) {
            return;
        }
        AdminUser admin = new AdminUser();
        admin.setUsername(props.getAdmin().getInitUsername());
        admin.setPasswordHash(passwordEncoder.encode(props.getAdmin().getInitPassword()));
        admin.setDisplayName("超级管理员");
        admin.setRole("SUPER_ADMIN");
        admin.setStatus("ACTIVE");
        adminUserMapper.insert(admin);
    }
}

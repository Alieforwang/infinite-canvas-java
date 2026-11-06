package com.infinitecanvas.dev;

import com.infinitecanvas.entity.RedeemCode;
import com.infinitecanvas.mapper.RedeemCodeMapper;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/** Dev-only welcome redeem code. Channels and models are configured by administrators. */
@Component
@Profile("dev")
public class DemoDataSeeder implements ApplicationRunner {

    private final RedeemCodeMapper redeemCodeMapper;

    public DemoDataSeeder(RedeemCodeMapper redeemCodeMapper) {
        this.redeemCodeMapper = redeemCodeMapper;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (redeemCodeMapper.countAll() == 0) {
            RedeemCode code = new RedeemCode();
            code.setCode("WELCOME-1000");
            code.setBatchNo("dev");
            code.setPrefix("WELCOME");
            code.setCredits(1000L);
            code.setStatus("UNUSED");
            code.setCreatedAt(LocalDateTime.now());
            redeemCodeMapper.insert(code);
        }
    }
}

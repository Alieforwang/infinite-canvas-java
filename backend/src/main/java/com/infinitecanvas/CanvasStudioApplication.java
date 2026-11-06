package com.infinitecanvas;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
@MapperScan("com.infinitecanvas.mapper")
public class CanvasStudioApplication {

    public static void main(String[] args) {
        SpringApplication.run(CanvasStudioApplication.class, args);
    }
}

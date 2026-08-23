package net.gyangho.ucms;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
// 2026-08-23: Keep active recruitment responses current without moving scheduling work back into Node.
@EnableScheduling
public class UcmsApplication {

	public static void main(String[] args) {
		SpringApplication.run(UcmsApplication.class, args);
	}

}

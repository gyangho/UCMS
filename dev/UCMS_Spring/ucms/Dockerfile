FROM gradle:9.7.0-jdk21 AS dev
WORKDIR /app
COPY . .
# 2026-08-23: Windows-created release archives do not preserve the Gradle wrapper executable bit.
RUN chmod +x gradlew
# 2026-08-23: Keep the live dev Gradle lock outside the bind-mounted repository used by CI tests.
CMD ["./gradlew", "bootRun", "--no-daemon", "--project-cache-dir=/home/gradle/.gradle/project-cache"]

FROM gradle:9.7.0-jdk21 AS build
WORKDIR /workspace
COPY . .
RUN chmod +x gradlew
RUN ./gradlew bootJar --no-daemon

FROM eclipse-temurin:21-jre AS prod
WORKDIR /app
COPY --from=build /workspace/build/libs/*.jar /app/ucms.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/ucms.jar"]

FROM maven:3.9.9-eclipse-temurin-17 AS build
WORKDIR /src
COPY pom.xml .
COPY src ./src
RUN mvn -B -DskipTests package

FROM eclipse-temurin:17-jre-jammy
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --create-home appuser
WORKDIR /app
COPY --from=build /src/target/social-network-backend-*.jar /app/app.jar
COPY deploy/backend-entrypoint.sh /entrypoint.sh
RUN chmod 755 /entrypoint.sh \
    && mkdir -p /data/uploads \
    && chown appuser:appuser /data/uploads
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=5 \
    CMD curl -fsS http://127.0.0.1:8080/actuator/health || exit 1
ENTRYPOINT ["/entrypoint.sh"]

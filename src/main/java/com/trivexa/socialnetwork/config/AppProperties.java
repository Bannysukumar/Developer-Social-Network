package com.trivexa.socialnetwork.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.Arrays;
import java.util.List;

@ConfigurationProperties(prefix = "app")
public class AppProperties {

    private final Jwt jwt = new Jwt();
    private final Cors cors = new Cors();
    private final Password password = new Password();
    private final RateLimit rateLimit = new RateLimit();
    private final Mail mail = new Mail();
    private final Storage storage = new Storage();
    private final Security security = new Security();
    private String redisUrl = "redis://localhost:6379";

    public Jwt getJwt() {
        return jwt;
    }

    public Cors getCors() {
        return cors;
    }

    public Password getPassword() {
        return password;
    }

    public RateLimit getRateLimit() {
        return rateLimit;
    }

    public Mail getMail() {
        return mail;
    }

    public Storage getStorage() {
        return storage;
    }

    public Security getSecurity() {
        return security;
    }

    public String getRedisUrl() {
        return redisUrl;
    }

    public void setRedisUrl(String redisUrl) {
        this.redisUrl = redisUrl;
    }

    public static class Jwt {
        private String secret;
        private String issuer = "trivexa-social-network";
        private String audience = "trivexa-clients";
        private Duration accessTokenTtl = Duration.ofMinutes(15);
        private Duration refreshTokenTtl = Duration.ofDays(7);

        public String getSecret() {
            return secret;
        }

        public void setSecret(String secret) {
            this.secret = secret;
        }

        public String getIssuer() {
            return issuer;
        }

        public void setIssuer(String issuer) {
            this.issuer = issuer;
        }

        public String getAudience() {
            return audience;
        }

        public void setAudience(String audience) {
            this.audience = audience;
        }

        public Duration getAccessTokenTtl() {
            return accessTokenTtl;
        }

        public void setAccessTokenTtl(Duration accessTokenTtl) {
            this.accessTokenTtl = accessTokenTtl;
        }

        public Duration getRefreshTokenTtl() {
            return refreshTokenTtl;
        }

        public void setRefreshTokenTtl(Duration refreshTokenTtl) {
            this.refreshTokenTtl = refreshTokenTtl;
        }
    }

    public static class Cors {
        private String allowedOrigins = "http://localhost:3000,http://localhost:5173";

        public String getAllowedOrigins() {
            return allowedOrigins;
        }

        public void setAllowedOrigins(String allowedOrigins) {
            this.allowedOrigins = allowedOrigins;
        }

        public List<String> originList() {
            if (allowedOrigins == null || allowedOrigins.isBlank()) {
                return List.of();
            }
            return Arrays.stream(allowedOrigins.split(","))
                    .map(String::trim)
                    .filter(origin -> !origin.isEmpty())
                    .toList();
        }
    }

    public static class Password {
        private int saltLength = 16;
        private int hashLength = 32;
        private int parallelism = 1;
        private int memoryKb = 16384;
        private int iterations = 2;

        public int getSaltLength() {
            return saltLength;
        }

        public void setSaltLength(int saltLength) {
            this.saltLength = saltLength;
        }

        public int getHashLength() {
            return hashLength;
        }

        public void setHashLength(int hashLength) {
            this.hashLength = hashLength;
        }

        public int getParallelism() {
            return parallelism;
        }

        public void setParallelism(int parallelism) {
            this.parallelism = parallelism;
        }

        public int getMemoryKb() {
            return memoryKb;
        }

        public void setMemoryKb(int memoryKb) {
            this.memoryKb = memoryKb;
        }

        public int getIterations() {
            return iterations;
        }

        public void setIterations(int iterations) {
            this.iterations = iterations;
        }
    }

    public static class RateLimit {
        private boolean enabled = true;
        private String store = "memory";
        private int signupPerHour = 5;
        private int loginPerFifteenMinutes = 10;
        private int forgotPasswordPerHour = 5;
        private int resetPasswordPerHour = 10;
        private int verifyEmailPerHour = 10;
        private int resendVerificationPerHour = 5;
        private int searchPerMinute = 30;
        private int friendRequestPerHour = 20;
        private int messagePerMinute = 60;

        public boolean isEnabled() {
            return enabled;
        }

        public void setEnabled(boolean enabled) {
            this.enabled = enabled;
        }

        public String getStore() {
            return store;
        }

        public void setStore(String store) {
            this.store = store;
        }

        public int getSignupPerHour() {
            return signupPerHour;
        }

        public void setSignupPerHour(int signupPerHour) {
            this.signupPerHour = signupPerHour;
        }

        public int getLoginPerFifteenMinutes() {
            return loginPerFifteenMinutes;
        }

        public void setLoginPerFifteenMinutes(int loginPerFifteenMinutes) {
            this.loginPerFifteenMinutes = loginPerFifteenMinutes;
        }

        public int getForgotPasswordPerHour() {
            return forgotPasswordPerHour;
        }

        public void setForgotPasswordPerHour(int forgotPasswordPerHour) {
            this.forgotPasswordPerHour = forgotPasswordPerHour;
        }

        public int getResetPasswordPerHour() {
            return resetPasswordPerHour;
        }

        public void setResetPasswordPerHour(int resetPasswordPerHour) {
            this.resetPasswordPerHour = resetPasswordPerHour;
        }

        public int getVerifyEmailPerHour() {
            return verifyEmailPerHour;
        }

        public void setVerifyEmailPerHour(int verifyEmailPerHour) {
            this.verifyEmailPerHour = verifyEmailPerHour;
        }

        public int getResendVerificationPerHour() {
            return resendVerificationPerHour;
        }

        public void setResendVerificationPerHour(int resendVerificationPerHour) {
            this.resendVerificationPerHour = resendVerificationPerHour;
        }

        public int getSearchPerMinute() {
            return searchPerMinute;
        }

        public void setSearchPerMinute(int searchPerMinute) {
            this.searchPerMinute = searchPerMinute;
        }

        public int getFriendRequestPerHour() {
            return friendRequestPerHour;
        }

        public void setFriendRequestPerHour(int friendRequestPerHour) {
            this.friendRequestPerHour = friendRequestPerHour;
        }

        public int getMessagePerMinute() {
            return messagePerMinute;
        }

        public void setMessagePerMinute(int messagePerMinute) {
            this.messagePerMinute = messagePerMinute;
        }
    }

    public static class Mail {
        private String host = "";
        private int port = 587;
        private String username = "";
        private String password = "";
        private String from = "noreply@example.com";
        private String publicAppUrl = "http://localhost:3000";
        private boolean smtpAuth = true;
        private boolean starttls = true;

        public String getHost() {
            return host;
        }

        public void setHost(String host) {
            this.host = host;
        }

        public int getPort() {
            return port;
        }

        public void setPort(int port) {
            this.port = port;
        }

        public String getUsername() {
            return username;
        }

        public void setUsername(String username) {
            this.username = username;
        }

        public String getPassword() {
            return password;
        }

        public void setPassword(String password) {
            this.password = password;
        }

        public String getFrom() {
            return from;
        }

        public void setFrom(String from) {
            this.from = from;
        }

        public String getPublicAppUrl() {
            return publicAppUrl;
        }

        public void setPublicAppUrl(String publicAppUrl) {
            this.publicAppUrl = publicAppUrl;
        }

        public boolean isSmtpAuth() {
            return smtpAuth;
        }

        public void setSmtpAuth(boolean smtpAuth) {
            this.smtpAuth = smtpAuth;
        }

        public boolean isStarttls() {
            return starttls;
        }

        public void setStarttls(boolean starttls) {
            this.starttls = starttls;
        }

        public boolean isConfigured() {
            return host != null && !host.isBlank();
        }
    }

    public static class Storage {
        private String location = "./uploads";
        private long maxImageBytes = 2_097_152L;

        public String getLocation() {
            return location;
        }

        public void setLocation(String location) {
            this.location = location;
        }

        public long getMaxImageBytes() {
            return maxImageBytes;
        }

        public void setMaxImageBytes(long maxImageBytes) {
            this.maxImageBytes = maxImageBytes;
        }
    }

    public static class Security {
        private boolean trustProxy;
        private boolean requireEmailVerified;
        private long maxRequestBytes = 1_048_576L;

        public boolean isTrustProxy() {
            return trustProxy;
        }

        public void setTrustProxy(boolean trustProxy) {
            this.trustProxy = trustProxy;
        }

        public boolean isRequireEmailVerified() {
            return requireEmailVerified;
        }

        public void setRequireEmailVerified(boolean requireEmailVerified) {
            this.requireEmailVerified = requireEmailVerified;
        }

        public long getMaxRequestBytes() {
            return maxRequestBytes;
        }

        public void setMaxRequestBytes(long maxRequestBytes) {
            this.maxRequestBytes = maxRequestBytes;
        }
    }
}

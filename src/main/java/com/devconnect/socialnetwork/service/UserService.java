package com.devconnect.socialnetwork.service;

import com.devconnect.socialnetwork.domain.AccountStatus;
import com.devconnect.socialnetwork.domain.AccountType;
import com.devconnect.socialnetwork.domain.AuditEventType;
import com.devconnect.socialnetwork.domain.RelationshipView;
import com.devconnect.socialnetwork.dto.PageResponse;
import com.devconnect.socialnetwork.dto.request.DeleteAccountRequest;
import com.devconnect.socialnetwork.dto.request.ReplaceProfileRequest;
import com.devconnect.socialnetwork.dto.request.UpdateProfileRequest;
import com.devconnect.socialnetwork.dto.response.UserProfileResponse;
import com.devconnect.socialnetwork.dto.response.UserSummaryResponse;
import com.devconnect.socialnetwork.entity.StoredFileEntity;
import com.devconnect.socialnetwork.entity.UserEntity;
import com.devconnect.socialnetwork.exception.ForbiddenException;
import com.devconnect.socialnetwork.exception.ResourceNotFoundException;
import com.devconnect.socialnetwork.exception.UnauthorizedException;
import com.devconnect.socialnetwork.exception.ValidationFailedException;
import com.devconnect.socialnetwork.mapper.UserMapper;
import com.devconnect.socialnetwork.repository.DeviceRepository;
import com.devconnect.socialnetwork.repository.IdentityKeyRepository;
import com.devconnect.socialnetwork.repository.PreKeyRepository;
import com.devconnect.socialnetwork.repository.UserRepository;
import com.devconnect.socialnetwork.util.Ids;
import com.devconnect.socialnetwork.util.Paging;
import com.devconnect.socialnetwork.util.TextNormalizer;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

@Service
public class UserService {

    private final UserRepository userRepository;
    private final FriendshipService friendshipService;
    private final FriendRequestService friendRequestService;
    private final BlockService blockService;
    private final NotificationService notificationService;
    private final FileStorageService fileStorageService;
    private final TokenSessionService tokenSessionService;
    private final DeviceRepository deviceRepository;
    private final IdentityKeyRepository identityKeyRepository;
    private final PreKeyRepository preKeyRepository;
    private final AuditService auditService;
    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;
    private final MongoTemplate mongoTemplate;
    private final Clock clock;

    public UserService(
            UserRepository userRepository,
            FriendshipService friendshipService,
            FriendRequestService friendRequestService,
            BlockService blockService,
            NotificationService notificationService,
            FileStorageService fileStorageService,
            TokenSessionService tokenSessionService,
            DeviceRepository deviceRepository,
            IdentityKeyRepository identityKeyRepository,
            PreKeyRepository preKeyRepository,
            AuditService auditService,
            UserMapper userMapper,
            PasswordEncoder passwordEncoder,
            MongoTemplate mongoTemplate,
            Clock clock
    ) {
        this.userRepository = userRepository;
        this.friendshipService = friendshipService;
        this.friendRequestService = friendRequestService;
        this.blockService = blockService;
        this.notificationService = notificationService;
        this.fileStorageService = fileStorageService;
        this.tokenSessionService = tokenSessionService;
        this.deviceRepository = deviceRepository;
        this.identityKeyRepository = identityKeyRepository;
        this.preKeyRepository = preKeyRepository;
        this.auditService = auditService;
        this.userMapper = userMapper;
        this.passwordEncoder = passwordEncoder;
        this.mongoTemplate = mongoTemplate;
        this.clock = clock;
    }

    public UserProfileResponse me(String userId) {
        return userMapper.toSelf(require(userId));
    }

    public UserProfileResponse profile(String viewerId, String targetUserId) {
        Ids.require(targetUserId);
        if (viewerId.equals(targetUserId)) {
            return me(viewerId);
        }
        UserEntity target = userRepository.findById(targetUserId)
                .orElseThrow(() -> new ResourceNotFoundException("Resource not found"));
        if (target.getStatus() != AccountStatus.ACTIVE || blockService.eitherBlocked(viewerId, targetUserId)) {
            throw new ResourceNotFoundException("Resource not found");
        }
        RelationshipView relationship = relationshipOf(viewerId, targetUserId);
        boolean limited = target.getAccountType() == AccountType.PRIVATE && relationship != RelationshipView.FRIENDS;
        return userMapper.toVisible(target, relationship, limited);
    }

    public UserProfileResponse replace(String userId, ReplaceProfileRequest request) {
        UserEntity user = require(userId);
        user.setDisplayName(TextNormalizer.displayName(request.displayName()));
        user.setNormalizedDisplayName(TextNormalizer.displayNameKey(user.getDisplayName()));
        user.setBio(TextNormalizer.bio(request.bio()));
        user.setAccountType(request.accountType());
        if (Boolean.TRUE.equals(request.clearProfileImage())) {
            fileStorageService.delete(user.getProfileImageFileId());
            user.setProfileImageFileId(null);
        }
        user.setUpdatedAt(clock.instant());
        return userMapper.toSelf(userRepository.save(user));
    }

    public UserProfileResponse patch(String userId, UpdateProfileRequest request) {
        if (request.displayName() == null && request.bio() == null && request.accountType() == null
                && !Boolean.TRUE.equals(request.clearProfileImage())) {
            throw new ValidationFailedException("At least one profile field is required");
        }
        UserEntity user = require(userId);
        if (request.displayName() != null) {
            user.setDisplayName(TextNormalizer.displayName(request.displayName()));
            user.setNormalizedDisplayName(TextNormalizer.displayNameKey(user.getDisplayName()));
        }
        if (request.bio() != null) {
            user.setBio(TextNormalizer.bio(request.bio()));
        }
        if (request.accountType() != null) {
            user.setAccountType(request.accountType());
        }
        if (Boolean.TRUE.equals(request.clearProfileImage())) {
            fileStorageService.delete(user.getProfileImageFileId());
            user.setProfileImageFileId(null);
        }
        user.setUpdatedAt(clock.instant());
        return userMapper.toSelf(userRepository.save(user));
    }

    public UserProfileResponse storeAvatar(String userId, byte[] bytes) {
        UserEntity user = require(userId);
        String previous = user.getProfileImageFileId();
        StoredFileEntity stored = fileStorageService.storeProfileImage(userId, bytes);
        user.setProfileImageFileId(stored.getId());
        user.setUpdatedAt(clock.instant());
        UserEntity saved = userRepository.save(user);
        if (previous != null && !previous.equals(stored.getId())) {
            fileStorageService.delete(previous);
        }
        return userMapper.toSelf(saved);
    }

    public PageResponse<UserSummaryResponse> search(String viewerId, String queryText, int page, int size) {
        String queryValue = TextNormalizer.searchQuery(queryText);
        Set<String> hidden = blockService.hiddenUserIds(viewerId);
        List<Criteria> parts = new ArrayList<>();
        parts.add(Criteria.where("status").is(AccountStatus.ACTIVE));
        parts.add(Criteria.where("_id").ne(viewerId));
        if (!hidden.isEmpty()) {
            parts.add(Criteria.where("_id").nin(hidden));
        }
        parts.add(new Criteria().orOperator(
                Criteria.where("normalizedUsername").regex("^" + Pattern.quote(queryValue)),
                Criteria.where("normalizedDisplayName").regex("^" + Pattern.quote(queryValue))
        ));
        Criteria criteria = new Criteria().andOperator(parts);
        Query query = Query.query(criteria);
        long total = mongoTemplate.count(query, UserEntity.class);
        var pageable = Paging.page(page, size <= 0 ? 20 : size, 20, Sort.by(Sort.Direction.ASC, "normalizedUsername"));
        query.with(pageable);
        List<UserEntity> users = mongoTemplate.find(query, UserEntity.class);
        List<String> ids = users.stream().map(UserEntity::getId).toList();
        Set<String> friends = friendshipService.friendIdsAmong(viewerId, ids);
        Map<String, RelationshipView> pending = friendRequestService.pendingViews(viewerId, ids);
        List<UserSummaryResponse> summaries = new ArrayList<>();
        for (UserEntity user : users) {
            RelationshipView view = RelationshipView.NONE;
            if (friends.contains(user.getId())) {
                view = RelationshipView.FRIENDS;
            } else if (pending.containsKey(user.getId())) {
                view = pending.get(user.getId());
            }
            summaries.add(userMapper.toSummary(user, view));
        }
        int totalPages = pageable.getPageSize() == 0 ? 0 : (int) Math.ceil((double) total / pageable.getPageSize());
        return new PageResponse<>(summaries, pageable.getPageNumber(), pageable.getPageSize(), total, totalPages,
                (long) (pageable.getPageNumber() + 1) * pageable.getPageSize() < total);
    }

    public StoredFileEntity mediaForViewer(String viewerId, String fileId) {
        StoredFileEntity file = fileStorageService.require(fileId);
        if (file.getOwnerId().equals(viewerId)) {
            return file;
        }
        UserEntity owner = userRepository.findById(file.getOwnerId())
                .orElseThrow(() -> new ResourceNotFoundException("Resource not found"));
        if (owner.getStatus() != AccountStatus.ACTIVE || blockService.eitherBlocked(viewerId, owner.getId())) {
            throw new ResourceNotFoundException("Resource not found");
        }
        if (owner.getAccountType() == AccountType.PRIVATE && !friendshipService.areFriends(viewerId, owner.getId())) {
            throw new ForbiddenException("This profile image is not available");
        }
        if (!fileId.equals(owner.getProfileImageFileId())) {
            throw new ResourceNotFoundException("Resource not found");
        }
        return file;
    }

    public void deleteMe(String userId, DeleteAccountRequest request) {
        UserEntity user = require(userId);
        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new UnauthorizedException("Invalid username or password");
        }
        var now = clock.instant();
        String tombstone = "deleted_" + user.getId();
        user.setUsername(tombstone);
        user.setNormalizedUsername(tombstone);
        user.setEmail(tombstone + "@deleted.invalid");
        user.setNormalizedEmail(tombstone + "@deleted.invalid");
        user.setDisplayName("Deleted user");
        user.setNormalizedDisplayName("deleted user");
        user.setBio("");
        user.setProfileImageFileId(null);
        user.setStatus(AccountStatus.DELETED);
        user.setEmailVerified(false);
        user.setPasswordHash(passwordEncoder.encode(com.devconnect.socialnetwork.crypto.TokenHasher.randomToken()));
        user.setSessionValidAfter(now);
        user.setUpdatedAt(now);
        userRepository.save(user);
        tokenSessionService.revokeAll(userId);
        deviceRepository.findByUserId(userId).forEach(device -> {
            device.setRevoked(true);
            device.setRevokedAt(now);
            device.setPublicKey(null);
            deviceRepository.save(device);
        });
        identityKeyRepository.deleteByUserId(userId);
        preKeyRepository.deleteByUserId(userId);
        friendshipService.deleteAllForUser(userId);
        friendRequestService.cancelAllForUser(userId);
        blockService.deleteAllForUser(userId);
        notificationService.deleteForRecipient(userId);
        notificationService.anonymizeActor(userId);
        fileStorageService.deleteAllForOwner(userId);
        auditService.record(AuditEventType.ACCOUNT_DELETED, userId, Map.of());
    }

    public UserEntity require(String userId) {
        return userRepository.findById(userId).orElseThrow(() -> new ResourceNotFoundException("Resource not found"));
    }

    public UserEntity requireActive(String userId) {
        UserEntity user = require(userId);
        if (user.getStatus() != AccountStatus.ACTIVE) {
            throw new ResourceNotFoundException("Resource not found");
        }
        return user;
    }

    private RelationshipView relationshipOf(String viewerId, String targetUserId) {
        if (friendshipService.areFriends(viewerId, targetUserId)) {
            return RelationshipView.FRIENDS;
        }
        return friendRequestService.pendingViews(viewerId, List.of(targetUserId))
                .getOrDefault(targetUserId, RelationshipView.NONE);
    }
}

package com.devconnect.socialnetwork.mapper;

import com.devconnect.socialnetwork.domain.RelationshipView;
import com.devconnect.socialnetwork.dto.response.PresenceView;
import com.devconnect.socialnetwork.dto.response.UserProfileResponse;
import com.devconnect.socialnetwork.dto.response.UserSummaryResponse;
import com.devconnect.socialnetwork.entity.UserEntity;
import com.devconnect.socialnetwork.service.PresencePolicy;
import com.devconnect.socialnetwork.service.PresenceService;
import org.springframework.stereotype.Component;

@Component
public class UserMapper {

    private final PresenceService presenceService;

    public UserMapper(PresenceService presenceService) {
        this.presenceService = presenceService;
    }

    public UserProfileResponse toSelf(UserEntity user) {
        return new UserProfileResponse(
                user.getId(),
                user.getUsername(),
                user.getDisplayName(),
                user.getBio(),
                imageUrl(user),
                user.getAccountType(),
                user.getStatus(),
                user.isEmailVerified(),
                user.getEmail(),
                user.getRoles(),
                RelationshipView.SELF,
                user.getCreatedAt(),
                false,
                presenceService.visible(user.getId(), user, RelationshipView.SELF),
                PresencePolicy.activityVisible(user.getShowActivityStatus())
        );
    }

    public UserProfileResponse toVisible(UserEntity user, RelationshipView relationship, boolean limited, String viewerId) {
        return new UserProfileResponse(
                user.getId(),
                user.getUsername(),
                user.getDisplayName(),
                limited ? null : user.getBio(),
                limited ? null : imageUrl(user),
                user.getAccountType(),
                null,
                null,
                null,
                null,
                relationship,
                limited ? null : user.getCreatedAt(),
                limited,
                limited ? null : presenceService.visible(viewerId, user, relationship),
                null
        );
    }

    public UserSummaryResponse toSummary(UserEntity user, RelationshipView relationship, String viewerId) {
        PresenceView presence = relationship == RelationshipView.BLOCKED
                ? null
                : presenceService.visible(viewerId, user, relationship);
        return new UserSummaryResponse(
                user.getId(),
                user.getUsername(),
                user.getDisplayName(),
                imageUrl(user),
                user.getAccountType(),
                relationship,
                presence
        );
    }

    public String imageUrl(UserEntity user) {
        if (user.getProfileImageFileId() == null || user.getProfileImageFileId().isBlank()) {
            return null;
        }
        return "/api/v1/media/" + user.getProfileImageFileId();
    }
}

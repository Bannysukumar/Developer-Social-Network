package com.trivexa.socialnetwork.mapper;

import com.trivexa.socialnetwork.domain.RelationshipView;
import com.trivexa.socialnetwork.dto.response.UserProfileResponse;
import com.trivexa.socialnetwork.dto.response.UserSummaryResponse;
import com.trivexa.socialnetwork.entity.UserEntity;
import org.springframework.stereotype.Component;

@Component
public class UserMapper {

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
                false
        );
    }

    public UserProfileResponse toVisible(UserEntity user, RelationshipView relationship, boolean limited) {
        return new UserProfileResponse(
                user.getId(),
                user.getUsername(),
                user.getDisplayName(),
                limited ? null : user.getBio(),
                imageUrl(user),
                user.getAccountType(),
                null,
                null,
                null,
                null,
                relationship,
                limited ? null : user.getCreatedAt(),
                limited
        );
    }

    public UserSummaryResponse toSummary(UserEntity user, RelationshipView relationship) {
        return new UserSummaryResponse(
                user.getId(),
                user.getUsername(),
                user.getDisplayName(),
                imageUrl(user),
                user.getAccountType(),
                relationship
        );
    }

    public String imageUrl(UserEntity user) {
        if (user.getProfileImageFileId() == null || user.getProfileImageFileId().isBlank()) {
            return null;
        }
        return "/api/v1/media/" + user.getProfileImageFileId();
    }
}

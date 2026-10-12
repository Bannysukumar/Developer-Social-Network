package com.devconnect.socialnetwork.repository;

import com.devconnect.socialnetwork.entity.StoryReactionEntity;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface StoryReactionRepository extends MongoRepository<StoryReactionEntity, String> {

    Optional<StoryReactionEntity> findByStoryIdAndUserId(String storyId, String userId);

    List<StoryReactionEntity> findByUserIdAndStoryIdIn(String userId, Collection<String> storyIds);

    void deleteByStoryIdAndUserId(String storyId, String userId);

    void deleteByStoryId(String storyId);

    void deleteByStoryIdIn(Collection<String> storyIds);
}

package com.devconnect.socialnetwork.repository;

import com.devconnect.socialnetwork.entity.StoryViewEntity;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface StoryViewRepository extends MongoRepository<StoryViewEntity, String> {

    Optional<StoryViewEntity> findByStoryIdAndViewerId(String storyId, String viewerId);

    long countByStoryId(String storyId);

    List<StoryViewEntity> findByStoryId(String storyId);

    List<StoryViewEntity> findByViewerIdAndStoryIdIn(String viewerId, Collection<String> storyIds);

    void deleteByStoryId(String storyId);

    void deleteByStoryIdIn(Collection<String> storyIds);
}

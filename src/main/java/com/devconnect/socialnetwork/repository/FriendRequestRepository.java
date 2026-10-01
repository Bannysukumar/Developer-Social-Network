package com.devconnect.socialnetwork.repository;

import com.devconnect.socialnetwork.domain.FriendRequestStatus;
import com.devconnect.socialnetwork.entity.FriendRequestEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface FriendRequestRepository extends MongoRepository<FriendRequestEntity, String> {

    Optional<FriendRequestEntity> findBySenderIdAndRecipientIdAndStatus(
            String senderId, String recipientId, FriendRequestStatus status);

    Page<FriendRequestEntity> findByRecipientIdAndStatus(
            String recipientId, FriendRequestStatus status, Pageable pageable);

    Page<FriendRequestEntity> findBySenderIdAndStatus(
            String senderId, FriendRequestStatus status, Pageable pageable);

    List<FriendRequestEntity> findBySenderIdAndRecipientIdInAndStatus(
            String senderId, Collection<String> recipientIds, FriendRequestStatus status);

    List<FriendRequestEntity> findByRecipientIdAndSenderIdInAndStatus(
            String recipientId, Collection<String> senderIds, FriendRequestStatus status);

    @Query("{ 'status': ?0, '$or': [ { 'senderId': ?1 }, { 'recipientId': ?1 } ] }")
    List<FriendRequestEntity> findByStatusInvolving(FriendRequestStatus status, String userId);
}

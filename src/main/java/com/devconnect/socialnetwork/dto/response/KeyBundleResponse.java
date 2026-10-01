package com.devconnect.socialnetwork.dto.response;

import com.devconnect.socialnetwork.domain.KeyAlgorithm;

import java.util.List;

public record KeyBundleResponse(
        String userId,
        List<DeviceBundle> devices
) {
    public record DeviceBundle(
            String deviceId,
            KeyAlgorithm algorithm,
            String identityPublicKey,
            PreKeyMaterial signedPreKey,
            PreKeyMaterial oneTimePreKey,
            Integer unusedOneTimePreKeyCount
    ) {
    }

    public record PreKeyMaterial(
            int preKeyId,
            String publicKey,
            String signature
    ) {
    }
}

package com.devconnect.socialnetwork.crypto;

import com.devconnect.socialnetwork.exception.ValidationFailedException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class Ed25519SignaturesTest {

    @Test
    void verifiesASignatureOverTheRawPrekeyAndRejectsTampering() {
        var identity = Ed25519Signatures.generateIdentity();
        String preKey = Ed25519Signatures.randomPublicKey();
        String signature = Ed25519Signatures.sign(identity.privateKey(), preKey);
        Ed25519Signatures.verify(identity.publicKey(), preKey, signature);
        assertThatThrownBy(() -> Ed25519Signatures.verify(identity.publicKey(), Ed25519Signatures.randomPublicKey(), signature))
                .isInstanceOf(ValidationFailedException.class);
    }
}

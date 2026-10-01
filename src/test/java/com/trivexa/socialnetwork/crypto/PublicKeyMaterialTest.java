package com.trivexa.socialnetwork.crypto;

import com.trivexa.socialnetwork.exception.ValidationFailedException;
import org.junit.jupiter.api.Test;

import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PublicKeyMaterialTest {

    @Test
    void accepts32BytePublicKeysAndRejectsOtherLengths() {
        String key = Base64.getEncoder().encodeToString(new byte[32]);
        assertThat(PublicKeyMaterial.requirePublicKey(key)).isEqualTo(key);
        assertThatThrownBy(() -> PublicKeyMaterial.requirePublicKey(Base64.getEncoder().encodeToString(new byte[16])))
                .isInstanceOf(ValidationFailedException.class);
        assertThatThrownBy(() -> CiphertextValidator.require("not base64"))
                .isInstanceOf(ValidationFailedException.class);
    }
}

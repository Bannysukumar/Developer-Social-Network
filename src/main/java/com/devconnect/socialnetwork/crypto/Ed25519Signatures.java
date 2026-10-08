package com.devconnect.socialnetwork.crypto;

import com.devconnect.socialnetwork.exception.ValidationFailedException;

import java.math.BigInteger;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.EdECPoint;
import java.security.spec.EdECPublicKeySpec;
import java.security.spec.NamedParameterSpec;
import java.util.Arrays;
import java.util.Base64;

/** Ed25519 signatures over the raw 32-byte key the directory stores. */
public final class Ed25519Signatures {

    private Ed25519Signatures() {
    }

    public static void verify(String identityPublicKey, String signedBytes, String signature) {
        try {
            Signature verifier = Signature.getInstance("Ed25519");
            verifier.initVerify(publicKey(Base64.getDecoder().decode(identityPublicKey)));
            verifier.update(Base64.getDecoder().decode(signedBytes));
            if (!verifier.verify(Base64.getDecoder().decode(signature))) {
                throw new ValidationFailedException("Signed prekey signature is invalid");
            }
        } catch (ValidationFailedException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ValidationFailedException("Signed prekey signature is invalid");
        }
    }

    public static IdentityKeyPair generateIdentity() {
        try {
            KeyPair pair = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
            return new IdentityKeyPair(encode(rawPublic((java.security.interfaces.EdECPublicKey) pair.getPublic())), pair.getPrivate());
        } catch (Exception ex) {
            throw new IllegalStateException("Ed25519 is not available", ex);
        }
    }

    public static String sign(PrivateKey privateKey, String payloadPublicKey) {
        try {
            Signature signer = Signature.getInstance("Ed25519");
            signer.initSign(privateKey);
            signer.update(Base64.getDecoder().decode(payloadPublicKey));
            return Base64.getEncoder().encodeToString(signer.sign());
        } catch (Exception ex) {
            throw new IllegalStateException("Ed25519 signing failed", ex);
        }
    }

    public static String randomPublicKey() {
        byte[] raw = new byte[32];
        new java.security.SecureRandom().nextBytes(raw);
        raw[31] &= 0x7f;
        return Base64.getEncoder().encodeToString(raw);
    }

    private static PublicKey publicKey(byte[] raw) throws Exception {
        if (raw.length != 32) {
            throw new ValidationFailedException("Public key has an unexpected length");
        }
        byte[] little = raw.clone();
        boolean xOdd = (little[31] & 0x80) != 0;
        little[31] &= 0x7f;
        reverse(little);
        KeyFactory factory = KeyFactory.getInstance("Ed25519");
        return factory.generatePublic(new EdECPublicKeySpec(
                NamedParameterSpec.ED25519,
                new EdECPoint(xOdd, new BigInteger(1, little))
        ));
    }

    private static byte[] rawPublic(java.security.interfaces.EdECPublicKey key) {
        byte[] bigEndian = toUnsigned32(key.getPoint().getY());
        reverse(bigEndian);
        if (key.getPoint().isXOdd()) {
            bigEndian[31] |= (byte) 0x80;
        }
        return bigEndian;
    }

    private static byte[] toUnsigned32(BigInteger value) {
        byte[] bytes = value.toByteArray();
        if (bytes.length == 32) {
            return bytes;
        }
        if (bytes.length == 33 && bytes[0] == 0) {
            return Arrays.copyOfRange(bytes, 1, 33);
        }
        byte[] out = new byte[32];
        System.arraycopy(bytes, 0, out, 32 - bytes.length, bytes.length);
        return out;
    }

    private static String encode(byte[] value) {
        return Base64.getEncoder().encodeToString(value);
    }

    private static void reverse(byte[] value) {
        for (int index = 0; index < value.length / 2; index += 1) {
            byte swap = value[index];
            value[index] = value[value.length - 1 - index];
            value[value.length - 1 - index] = swap;
        }
    }

    public record IdentityKeyPair(String publicKey, PrivateKey privateKey) {
    }
}

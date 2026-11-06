package com.infinitecanvas.common;

import java.security.SecureRandom;

/**
 * Minimal ULID generator: 48-bit timestamp (10 chars) + 80-bit randomness (16 chars),
 * Crockford base32, 26 chars, lexicographically sortable.
 */
public final class Ulid {

    private static final char[] ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ".toCharArray();
    private static final SecureRandom RANDOM = new SecureRandom();

    private Ulid() {
    }

    public static String next() {
        char[] out = new char[26];
        long time = System.currentTimeMillis();
        for (int i = 9; i >= 0; i--) {
            out[i] = ALPHABET[(int) (time & 31)];
            time >>>= 5;
        }
        byte[] random = new byte[16];
        RANDOM.nextBytes(random);
        for (int i = 0; i < 16; i++) {
            out[10 + i] = ALPHABET[random[i] & 31];
        }
        return new String(out);
    }
}

package com.infinitecanvas.common;

import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class UlidTest {

    @Test
    void generates26CharsFromCrockfordAlphabet() {
        String ulid = Ulid.next();
        assertEquals(26, ulid.length());
        assertTrue(ulid.matches("[0-9A-HJKMNP-TV-Z]{26}"));
    }

    @Test
    void generatesUniqueValues() {
        Set<String> values = new HashSet<>();
        for (int i = 0; i < 2000; i++) {
            assertTrue(values.add(Ulid.next()), "duplicated ULID at " + i);
        }
    }

    @Test
    void lexicographicallySortableByTime() throws InterruptedException {
        String first = Ulid.next();
        Thread.sleep(5);
        String second = Ulid.next();
        assertTrue(first.compareTo(second) < 0, "ULID should sort by creation time: " + first + " vs " + second);
    }
}

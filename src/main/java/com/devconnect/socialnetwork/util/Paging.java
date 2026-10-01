package com.devconnect.socialnetwork.util;

import com.devconnect.socialnetwork.dto.PageResponse;
import com.devconnect.socialnetwork.exception.ValidationFailedException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

import java.util.List;

public final class Paging {

    public static final int MAX_PAGE_INDEX = 1000;

    private Paging() {
    }

    public static Pageable page(int page, int size, int maxSize, Sort sort) {
        if (page < 0 || page > MAX_PAGE_INDEX) {
            throw new ValidationFailedException("Page is out of range");
        }
        int resolved = size <= 0 ? maxSize : Math.min(size, maxSize);
        return PageRequest.of(page, resolved, sort);
    }

    public static <T> PageResponse<T> map(Page<?> page, List<T> items) {
        return new PageResponse<>(
                items,
                page.getNumber(),
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages(),
                page.hasNext()
        );
    }
}

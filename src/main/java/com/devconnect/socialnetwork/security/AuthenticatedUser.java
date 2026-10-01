package com.devconnect.socialnetwork.security;

import com.devconnect.socialnetwork.domain.Role;

import java.util.Set;

public record AuthenticatedUser(String id, String username, Set<Role> roles) {
}

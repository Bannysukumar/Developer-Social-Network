package com.trivexa.socialnetwork.security;

import com.trivexa.socialnetwork.domain.Role;

import java.util.Set;

public record AuthenticatedUser(String id, String username, Set<Role> roles) {
}

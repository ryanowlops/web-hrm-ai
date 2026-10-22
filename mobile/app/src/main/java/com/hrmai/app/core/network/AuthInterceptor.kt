package com.hrmai.app.core.network

import okhttp3.Interceptor
import okhttp3.Response

/** Cung cấp token hiện tại cho interceptor (SessionStore cài đặt interface này). */
interface TokenProvider {
    fun accessToken(): String?
    fun refreshToken(): String?
    /** Gọi refresh đồng bộ; trả về access token mới hoặc null nếu thất bại. */
    fun refreshBlocking(): String?
    fun onSessionExpired()
}

/**
 * Gắn Authorization vào mọi request (trừ auth/login, auth/refresh).
 * Gặp 401: refresh một lần (khoá đồng bộ toàn cục) rồi thử lại request;
 * refresh thất bại thì báo hết phiên để app quay về màn đăng nhập.
 */
class AuthInterceptor(private val tokens: TokenProvider) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        val path = original.url.encodedPath
        val isAuthCall = path.endsWith("/auth/login") || path.endsWith("/auth/refresh")
        val token = tokens.accessToken()
        val request = if (!isAuthCall && token != null) {
            original.newBuilder().header("Authorization", "Bearer $token").build()
        } else {
            original
        }
        val response = chain.proceed(request)
        if (response.code != 401 || isAuthCall || tokens.refreshToken() == null) {
            return response
        }
        // Thử refresh đúng một lần.
        val newToken = synchronized(REFRESH_LOCK) {
            val current = tokens.accessToken()
            if (current != null && current != token) current else tokens.refreshBlocking()
        }
        if (newToken == null) {
            tokens.onSessionExpired()
            return response
        }
        response.close()
        val retried = original.newBuilder()
            .header("Authorization", "Bearer $newToken")
            .build()
        return chain.proceed(retried)
    }

    companion object {
        private val REFRESH_LOCK = Any()
    }
}

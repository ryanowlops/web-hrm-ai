package com.hrmai.app.feature.auth

import com.hrmai.app.core.datastore.SessionUser
import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.Body
import retrofit2.http.POST

@JsonClass(generateAdapter = false)
data class LoginRequest(
    val email: String,
    val password: String,
)

@JsonClass(generateAdapter = false)
data class LoginResponse(
    @Json(name = "access_token") val accessToken: String? = null,
    @Json(name = "refresh_token") val refreshToken: String? = null,
    val user: SessionUser? = null,
    // Một số môi trường bọc trong "data" — đọc dự phòng tại ViewModel.
    val data: LoginResponseData? = null,
)

@JsonClass(generateAdapter = false)
data class LoginResponseData(
    @Json(name = "access_token") val accessToken: String? = null,
    @Json(name = "refresh_token") val refreshToken: String? = null,
    val user: SessionUser? = null,
)

interface AuthApi {
    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): LoginResponse
}

package com.hrmai.app.feature.chatbot

import com.squareup.moshi.JsonClass
import okhttp3.RequestBody
import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

/**
 * API Chatbot HR — đối chiếu client/src/features/chatbot/services.js và
 * server/app/blueprints/chat/routes.py:
 *  - POST chat/ask { question } -> TOP LEVEL (không bọc data):
 *    { answer, sources, mode, retrieval_mode, action }.
 *  - POST chat/actions/execute { type, payload } -> { result_text,
 *    leave_request }; lỗi nghiệp vụ giữ nguyên envelope của leave.
 *  - GET chat/history?page=&limit= -> { data: [...], meta }.
 * Response có các phần ĐỘNG (sources, action.payload) nên trả
 * ResponseBody thô và bóc bằng org.json ở ViewModel thay vì ép Moshi.
 */
@JsonClass(generateAdapter = false)
data class AskRequest(val question: String)

interface ChatApi {
    @POST("chat/ask")
    suspend fun ask(@Body body: AskRequest): ResponseBody

    @POST("chat/actions/execute")
    suspend fun executeAction(@Body body: RequestBody): ResponseBody

    @GET("chat/history")
    suspend fun history(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 30,
    ): ResponseBody
}

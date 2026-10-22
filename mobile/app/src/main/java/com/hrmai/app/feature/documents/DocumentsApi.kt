package com.hrmai.app.feature.documents

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * DTO + Retrofit API cho module Kho tài liệu (prefix /api/v1/documents).
 * Nguồn sự thật: server/app/blueprints/documents/routes.py + schemas.py.
 * - GET documents: scope ép ở server (employee = mình; manager = phòng;
 *   hr/admin = tất cả). Truyền employee_id của chính mình để luôn chỉ
 *   thấy tài liệu của mình ở tab "của tôi".
 * - Giấy xác nhận: cert_type chỉ nhận "salary" | "employment", purpose
 *   bắt buộc (<= 1000 ký tự). Duyệt 1 cấp bởi HR/Admin qua
 *   POST documents/certificates/{id}/decision với body
 *   { decision: "approve" | "reject", note? } — LƯU Ý: giá trị decision
 *   ở module này là approve/reject, khác mẫu approve 2 cấp của leave.
 * Mọi response bọc { data, meta? }.
 */

@JsonClass(generateAdapter = false)
data class DocumentDto(
    val id: Int? = null,
    @Json(name = "employee_id") val employeeId: Int? = null,
    @Json(name = "employee_name") val employeeName: String? = null,
    /** contract | cccd | degree | certificate | other */
    @Json(name = "doc_type") val docType: String? = null,
    val title: String? = null,
    @Json(name = "original_filename") val originalFilename: String? = null,
    @Json(name = "expiry_date") val expiryDate: String? = null,
    @Json(name = "is_expired") val isExpired: Boolean? = null,
    @Json(name = "days_to_expiry") val daysToExpiry: Int? = null,
    val note: String? = null,
    @Json(name = "uploaded_by_name") val uploadedByName: String? = null,
    @Json(name = "created_at") val createdAt: String? = null,
)

@JsonClass(generateAdapter = false)
data class CertificateDto(
    val id: Int? = null,
    @Json(name = "employee_id") val employeeId: Int? = null,
    @Json(name = "employee_name") val employeeName: String? = null,
    @Json(name = "department_name") val departmentName: String? = null,
    /** salary | employment */
    @Json(name = "cert_type") val certType: String? = null,
    val purpose: String? = null,
    /** pending | approved | rejected */
    val status: String? = null,
    @Json(name = "decided_by_name") val decidedByName: String? = null,
    @Json(name = "decided_at") val decidedAt: String? = null,
    @Json(name = "decision_note") val decisionNote: String? = null,
    @Json(name = "issued_content") val issuedContent: String? = null,
    @Json(name = "created_at") val createdAt: String? = null,
)

@JsonClass(generateAdapter = false)
data class DocumentsPageMeta(
    val page: Int? = null,
    val limit: Int? = null,
    val totalItems: Int? = null,
    val totalPages: Int? = null,
)

@JsonClass(generateAdapter = false)
data class DocumentsResponse(
    val data: List<DocumentDto>? = null,
    val meta: DocumentsPageMeta? = null,
)

@JsonClass(generateAdapter = false)
data class CertificatesResponse(
    val data: List<CertificateDto>? = null,
    val meta: DocumentsPageMeta? = null,
)

@JsonClass(generateAdapter = false)
data class CertificateSingleResponse(
    val data: CertificateDto? = null,
)

@JsonClass(generateAdapter = false)
data class CreateCertificateBody(
    @Json(name = "cert_type") val certType: String,
    val purpose: String,
)

@JsonClass(generateAdapter = false)
data class CertificateDecisionBody(
    /** "approve" | "reject" — đúng validate của documents/schemas.py. */
    val decision: String,
    val note: String? = null,
)

interface DocumentsApi {
    @GET("documents")
    suspend fun getDocuments(
        @Query("employee_id") employeeId: Int?,
        @Query("page") page: Int,
        @Query("limit") limit: Int,
    ): DocumentsResponse

    @GET("documents/certificates")
    suspend fun getCertificates(
        @Query("scope") scope: String?,
        @Query("status") status: String?,
        @Query("page") page: Int,
        @Query("limit") limit: Int,
    ): CertificatesResponse

    @POST("documents/certificates")
    suspend fun createCertificate(
        @Body body: CreateCertificateBody,
    ): CertificateSingleResponse

    @POST("documents/certificates/{id}/decision")
    suspend fun decideCertificate(
        @Path("id") id: Int,
        @Body body: CertificateDecisionBody,
    ): CertificateSingleResponse
}

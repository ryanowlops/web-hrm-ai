package com.hrmai.app.core.datastore

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.hrmai.app.BuildConfig
import com.hrmai.app.core.network.ApiClient
import com.hrmai.app.core.network.TokenProvider
import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicReference

/** Thông tin user tóm tắt lưu kèm phiên đăng nhập (lấy từ response login). */
@JsonClass(generateAdapter = false)
data class SessionUser(
    val id: Int? = null,
    @Json(name = "employee_id") val employeeId: Int? = null,
    val email: String? = null,
    @Json(name = "full_name") val fullName: String? = null,
    val role: String? = null,
    @Json(name = "department_name") val departmentName: String? = null,
    @Json(name = "position_name") val positionName: String? = null,
)

data class Session(
    val accessToken: String,
    val refreshToken: String?,
    val user: SessionUser,
    val baseUrl: String,
)

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "hrm_session")

/**
 * Lưu phiên đăng nhập bằng DataStore; đồng thời là TokenProvider cho
 * AuthInterceptor (đọc token đồng bộ từ bản sao trong bộ nhớ).
 */
class SessionStore(private val context: Context) : TokenProvider {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val cached = AtomicReference<Session?>(null)

    private val _sessionFlow = MutableStateFlow<Session?>(null)
    val sessionFlow: StateFlow<Session?> = _sessionFlow

    /**
     * false cho tới khi DataStore phát giá trị đầu tiên. UI dùng cờ này để hiện
     * màn chờ khôi phục phiên thay vì chớp màn đăng nhập khi mở app.
     */
    private val _sessionKnown = MutableStateFlow(false)
    val sessionKnown: StateFlow<Boolean> = _sessionKnown

    /** Địa chỉ server đang dùng (mặc định production, đổi được ở màn đăng nhập). */
    val baseUrlFlow: Flow<String> = context.dataStore.data.map { prefs ->
        prefs[KEY_BASE_URL] ?: BuildConfig.DEFAULT_BASE_URL
    }

    init {
        scope.launch {
            context.dataStore.data.collect { prefs ->
                val session = decode(prefs)
                cached.set(session)
                _sessionFlow.value = session
                _sessionKnown.value = true
            }
        }
    }

    private fun decode(prefs: Preferences): Session? {
        val access = prefs[KEY_ACCESS] ?: return null
        val userJson = prefs[KEY_USER] ?: return null
        val user = runCatching {
            ApiClient.moshi.adapter(SessionUser::class.java).fromJson(userJson)
        }.getOrNull() ?: return null
        return Session(
            accessToken = access,
            refreshToken = prefs[KEY_REFRESH],
            user = user,
            baseUrl = prefs[KEY_BASE_URL] ?: BuildConfig.DEFAULT_BASE_URL,
        )
    }

    suspend fun currentBaseUrl(): String = baseUrlFlow.first()

    suspend fun saveBaseUrl(url: String) {
        val normalized = normalizeBaseUrl(url)
        context.dataStore.edit { it[KEY_BASE_URL] = normalized }
    }

    suspend fun save(session: Session) {
        val userJson = ApiClient.moshi.adapter(SessionUser::class.java).toJson(session.user)
        context.dataStore.edit { prefs ->
            prefs[KEY_ACCESS] = session.accessToken
            session.refreshToken?.let { prefs[KEY_REFRESH] = it }
            prefs[KEY_USER] = userJson
            prefs[KEY_BASE_URL] = session.baseUrl
        }
    }

    suspend fun clear() {
        context.dataStore.edit { prefs ->
            prefs.remove(KEY_ACCESS)
            prefs.remove(KEY_REFRESH)
            prefs.remove(KEY_USER)
        }
    }

    // ---- TokenProvider (đồng bộ, phục vụ OkHttp interceptor) ----
    override fun accessToken(): String? = cached.get()?.accessToken
    override fun refreshToken(): String? = cached.get()?.refreshToken

    override fun refreshBlocking(): String? {
        val session = cached.get() ?: return null
        val refresh = session.refreshToken ?: return null
        return runBlocking(Dispatchers.IO) {
            runCatching {
                val api = ApiClient.plainRetrofit(session.baseUrl)
                    .create(RefreshApi::class.java)
                val resp = api.refresh(mapOf("refresh_token" to refresh))
                val body = resp.string()
                val json = JSONObject(body)
                val data = json.optJSONObject("data") ?: json
                val newAccess = data.optString("access_token").takeIf { it.isNotBlank() }
                    ?: return@runCatching null
                val newRefresh = data.optString("refresh_token").takeIf { it.isNotBlank() }
                save(session.copy(accessToken = newAccess, refreshToken = newRefresh ?: refresh))
                newAccess
            }.getOrNull()
        }
    }

    override fun onSessionExpired() {
        scope.launch { clear() }
    }

    companion object {
        private val KEY_ACCESS = stringPreferencesKey("access_token")
        private val KEY_REFRESH = stringPreferencesKey("refresh_token")
        private val KEY_USER = stringPreferencesKey("user_json")
        private val KEY_BASE_URL = stringPreferencesKey("base_url")

        /** Chuẩn hoá: thêm https:// nếu thiếu, đảm bảo kết thúc bằng /api/v1/. */
        fun normalizeBaseUrl(raw: String): String {
            var url = raw.trim()
            if (url.isBlank()) return BuildConfig.DEFAULT_BASE_URL
            if (!url.startsWith("http://") && !url.startsWith("https://")) {
                url = "https://$url"
            }
            url = url.trimEnd('/')
            if (!url.endsWith("/api/v1")) url = "$url/api/v1"
            return "$url/"
        }
    }
}

/** API tối thiểu cho refresh — tách riêng để tránh vòng phụ thuộc. */
interface RefreshApi {
    @retrofit2.http.POST("auth/refresh")
    suspend fun refresh(@retrofit2.http.Body body: Map<String, String>): okhttp3.ResponseBody
}

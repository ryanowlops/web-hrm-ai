package com.hrmai.app.core.di

import android.content.Context
import com.hrmai.app.BuildConfig
import com.hrmai.app.core.datastore.SessionStore
import com.hrmai.app.core.network.ApiClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import retrofit2.Retrofit
import java.util.concurrent.atomic.AtomicReference

/**
 * DI thủ công: khai báo tập trung dependency dùng chung.
 * Mỗi feature tự tạo API interface của mình từ [api] — container không
 * cần biết từng feature, tránh tắc nghẽn khi nhiều đội làm song song.
 */
class AppContainer(context: Context) {
    val appContext: Context = context.applicationContext

    val sessionStore: SessionStore = SessionStore(appContext)

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val currentBaseUrl = AtomicReference(BuildConfig.DEFAULT_BASE_URL)
    @Volatile private var cachedRetrofit: Retrofit? = null
    @Volatile private var cachedForUrl: String? = null

    init {
        scope.launch {
            sessionStore.baseUrlFlow.collect { url ->
                currentBaseUrl.set(url)
            }
        }
    }

    /** Retrofit theo địa chỉ server hiện hành (tự dựng lại khi đổi server). */
    fun retrofit(): Retrofit {
        val url = currentBaseUrl.get()
        val existing = cachedRetrofit
        if (existing != null && cachedForUrl == url) return existing
        val built = ApiClient.retrofit(url, sessionStore)
        cachedRetrofit = built
        cachedForUrl = url
        return built
    }

    fun <T> api(service: Class<T>): T = retrofit().create(service)
}

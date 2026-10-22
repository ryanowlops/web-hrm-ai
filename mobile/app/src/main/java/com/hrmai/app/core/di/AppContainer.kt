package com.hrmai.app.core.di

import android.content.Context

/**
 * DI thủ công: nơi khai báo tập trung các dependency dùng chung.
 * Bản khung tối thiểu — các repository/API sẽ được bổ sung tại đây
 * khi tích hợp các tính năng (parent sở hữu file này).
 */
class AppContainer(context: Context) {
    val appContext: Context = context.applicationContext
}

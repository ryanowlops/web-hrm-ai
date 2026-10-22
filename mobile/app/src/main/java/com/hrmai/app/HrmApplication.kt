package com.hrmai.app

import android.app.Application
import com.hrmai.app.core.di.AppContainer

/** Điểm khởi tạo app: giữ AppContainer (DI thủ công) cho toàn bộ vòng đời. */
class HrmApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}

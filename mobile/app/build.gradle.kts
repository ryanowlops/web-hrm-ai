plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "com.hrmai.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.hrmai.app"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"

        // Địa chỉ API mặc định (production). Người dùng đổi được trong app.
        buildConfigField(
            "String",
            "DEFAULT_BASE_URL",
            "\"https://hrm-ai-api.onrender.com/api/v1/\""
        )
    }

    // Keystore debug CO DINH luu trong repo: moi lan build CI deu ky cung mot
    // chu ky, nen APK ban sau cai de len ban truoc duoc (khong bi loi
    // INSTALL_FAILED_UPDATE_INCOMPATIBLE do may build doi key moi lan).
    signingConfigs {
        getByName("debug") {
            storeFile = rootProject.file("debug.p12")
            storeType = "PKCS12"
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.retrofit)
    implementation(libs.retrofit.moshi)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)
    implementation(libs.moshi)
    implementation(libs.moshi.kotlin)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.zxing.android.embedded)
    debugImplementation(libs.androidx.compose.ui.tooling)
}

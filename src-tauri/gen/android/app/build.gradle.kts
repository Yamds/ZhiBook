import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

// ===== 发布签名（详见 docs/02-build-and-release.md）=====
// 口令 / 别名 / 私钥路径统一放在 src-tauri/gen/android/keystore.properties（已 gitignore）。
// storeFile 相对路径按 src-tauri/gen/android 解析，也可写绝对路径（用正斜杠，属性文件里反斜杠是转义符）。
// 该文件缺失时不报错：release 产物保持未签名，debug 回退 Gradle 默认调试密钥。
val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) {
        keystorePropertiesFile.inputStream().use { load(it) }
    }
}
val hasReleaseKeystore =
    keystorePropertiesFile.exists() && !keystoreProperties.getProperty("storeFile").isNullOrBlank()

if (!hasReleaseKeystore) {
    logger.warn(
        "[zhibook] 未找到 ${keystorePropertiesFile.path}：release 产物将未签名（adb install 会拒绝），" +
            "dev/debug 回退 Gradle 调试密钥。详见 docs/02-build-and-release.md"
    )
}

android {
    compileSdk = 36
    namespace = "cafe.yamds.zhibook"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "cafe.yamds.zhibook"
        minSdk = 24
        targetSdk = 36
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    signingConfigs {
        create("release") {
            if (hasReleaseKeystore) {
                storeFile = rootProject.file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
            // minSdk 24 → API 24+ 只认 v2/v3，v1（JAR 签名）不需要。
            // v3 默认只在 minSdk ≥ 28 时才开，这里显式打开：v3 带密钥轮换能力，
            // 且与 docs/02 记录的手签结果（v2 + v3 均通过）保持一致。v4（.idsig 增量安装）不需要。
            enableV1Signing = false
            enableV2Signing = true
            enableV3Signing = true
        }
    }
    buildTypes {
        getByName("debug") {
            // 用同一把发布密钥签 debug：dev / debug / release 三者可互相覆盖安装，
            // 不再出现 INSTALL_FAILED_UPDATE_INCOMPATIBLE（docs/02「签名必须一致」）。
            if (hasReleaseKeystore) {
                signingConfig = signingConfigs.getByName("release")
            }
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            // 自动签名：签名块内容全部来自 keystore.properties。
            if (hasReleaseKeystore) {
                signingConfig = signingConfigs.getByName("release")
            }
            // 用户确认：自建 Git 仓库允许 HTTP（HTTPS 仍是推荐做法）。
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isMinifyEnabled = true
            proguardFiles(
                *fileTree(".") { include("**/*.pro") }
                    .plus(getDefaultProguardFile("proguard-android-optimize.txt"))
                    .toList().toTypedArray()
            )
        }
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        buildConfig = true
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = "tauri.build.gradle.kts")
package cafe.yamds.zhibook

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import java.io.File
import org.json.JSONObject

/**
 * 宿主 Activity。
 *
 * Tauri 的 `TauriActivity` 把 `handleBackNavigation` 固定为 false，也就是**不注册任何
 * 返回键回调**，系统默认行为是直接结束 Activity。这里补上自己的回调，让「首页按返回键
 * 弹退出确认、确认后彻底退出」真正生效。
 *
 * 与 Web 层的约定（见 src/core/platform/androidBridge.ts，两边必须同步修改）：
 *
 *  物理返回键 —— 调用 `window.__yamdsBackPressed()`，按返回值决定：
 *      'handled'  界面已消费（关闭弹层 / 回到首页 / 已弹出退出确认框），原生什么都不做
 *      'exit'     用户已在确认框里确认：结束 Activity，释放界面资源
 *      ''/未知    回落到 WebView 历史，再回落到结束
 *
 * 固定策略（不再是设置项）：
 *   - 双指缩放始终关闭：`setSupportZoom(false)` + 关闭内置缩放控件
 *   - 退到后台不做任何处理：不结束后台、不清理 WebView，回到前台即恢复
 */
class MainActivity : TauriActivity() {
    private var hostWebView: WebView? = null

    @Volatile
    private var pendingExportPath: String? = null
    private lateinit var createDocumentLauncher: ActivityResultLauncher<String>
    private lateinit var openDocumentLauncher: ActivityResultLauncher<Array<String>>

    override fun onWebViewCreate(webView: WebView) {
        hostWebView = webView
        disableZoom(webView)
        // JS → 原生：记账提醒的配置下发 + 权限/省电白名单引导。
        // 与 src/core/platform/reminderBridge.ts 成对维护。
        webView.addJavascriptInterface(ReminderBridge(), "YamdsReminder")
        // JS → 原生：备份包保存 / 导入文件选择。
        // 与 src/core/platform/fileBridge.ts 成对维护。
        webView.addJavascriptInterface(FileBridge(), "YamdsFiles")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        // 云端备份：把 JavaVM 交给 Rust（src-tauri/src/http_transport/android.rs 成对维护）。
        try {
            registerCloudHttp()
        } catch (error: Throwable) {
            android.util.Log.e("YamdsCloud", "register cloud http bridge failed", error)
        }

        // 备份导出：让用户选保存位置（SAF）。
        createDocumentLauncher = registerForActivityResult(
            ActivityResultContracts.CreateDocument("application/zip"),
        ) { uri ->
            val source = pendingExportPath
            pendingExportPath = null
            if (uri != null && source != null) copyToUri(source, uri)
        }

        // 备份导入：选一个 zip，复制到缓存后回调 JS。
        openDocumentLauncher = registerForActivityResult(
            ActivityResultContracts.OpenDocument(),
        ) { uri ->
            if (uri != null) copyImportToCache(uri)
        }

        // 在 super.onCreate 之后注册：OnBackPressedDispatcher 是后进先出，
        // 因此这个回调优先级最高，能拿到返回键。
        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    val webView = hostWebView
                    if (webView == null) {
                        finish()
                        return
                    }
                    webView.evaluateJavascript(BACK_PRESS_QUERY) { raw ->
                        when (decodeJsString(raw)) {
                            "handled" -> Unit
                            "exit" -> finish()
                            else -> if (webView.canGoBack()) webView.goBack() else finish()
                        }
                    }
                }
            },
        )
    }

    override fun onDestroy() {
        hostWebView = null
        super.onDestroy()
    }

    /**
     * 数据备份原生桥。方法在 JavaBridge 线程调用，碰 UI 的必须 `runOnUiThread`。
     * 方法签名与 `src/core/platform/fileBridge.ts` 一一对应。
     */
    inner class FileBridge {
        @JavascriptInterface
        fun saveFile(sourcePath: String, suggestedName: String) {
            pendingExportPath = sourcePath
            runOnUiThread {
                try {
                    createDocumentLauncher.launch(suggestedName)
                } catch (_: Exception) {
                    pendingExportPath = null
                }
            }
        }

        @JavascriptInterface
        fun pickImportFile() {
            runOnUiThread {
                try {
                    openDocumentLauncher.launch(
                        arrayOf("application/zip", "application/octet-stream", "*/*"),
                    )
                } catch (_: Exception) {
                    // 没有文件选择器：忽略（JS 侧会提示不可用）
                }
            }
        }
    }

    /** 把沙箱里的备份 zip 复制到用户选择的位置。 */
    private fun copyToUri(sourcePath: String, uri: Uri) {
        Thread {
            try {
                contentResolver.openOutputStream(uri)?.use { output ->
                    File(sourcePath).inputStream().use { input -> input.copyTo(output) }
                }
            } catch (_: Exception) {
                // 用户取消 / 写入失败：JS 侧已有提示
            }
        }.start()
    }

    /** 把用户选择的备份 zip 复制到缓存目录，再回调 JS 去预览 / 导入。 */
    private fun copyImportToCache(uri: Uri) {
        Thread {
            try {
                val target = File(cacheDir, "import-backup.zip")
                contentResolver.openInputStream(uri)?.use { input ->
                    target.outputStream().use { output -> input.copyTo(output) }
                }
                val quoted = JSONObject.quote(target.absolutePath)
                runOnUiThread {
                    hostWebView?.evaluateJavascript(
                        "window.__yamdsImportFileReady && window.__yamdsImportFileReady($quoted)",
                        null,
                    )
                }
            } catch (_: Exception) {
                // 读取失败：不回调（JS 侧会停在等待状态）
            }
        }.start()
    }

    /** 关闭双指缩放与内置缩放控件：记账界面不需要缩放，误触会打乱金额输入。 */
    private fun disableZoom(webView: WebView) {
        webView.settings.setSupportZoom(false)
        webView.settings.builtInZoomControls = false
        webView.settings.displayZoomControls = false
    }

    /**
     * 记账提醒原生桥。方法在 JavaBridge 线程调用，碰 UI 的必须 `runOnUiThread`。
     * 方法签名与 `src/core/platform/reminderBridge.ts` 一一对应。
     */
    inner class ReminderBridge {
        @JavascriptInterface
        fun schedule(enabled: Boolean, hour: Int, minute: Int, title: String, body: String) {
            ReminderScheduler.schedule(this@MainActivity, enabled, hour, minute, title, body)
        }

        @JavascriptInterface
        fun requestNotificationPermission() {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
            runOnUiThread {
                val granted = ContextCompat.checkSelfPermission(
                    this@MainActivity,
                    Manifest.permission.POST_NOTIFICATIONS,
                ) == PackageManager.PERMISSION_GRANTED
                if (!granted) {
                    ActivityCompat.requestPermissions(
                        this@MainActivity,
                        arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                        NOTIFICATION_PERMISSION_REQUEST,
                    )
                }
            }
        }

        @JavascriptInterface
        fun isNotificationPermissionGranted(): Boolean {
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                ContextCompat.checkSelfPermission(
                    this@MainActivity,
                    Manifest.permission.POST_NOTIFICATIONS,
                ) == PackageManager.PERMISSION_GRANTED
            } else {
                NotificationManagerCompat.from(this@MainActivity).areNotificationsEnabled()
            }
        }

        @JavascriptInterface
        fun isIgnoringBatteryOptimizations(): Boolean {
            val powerManager =
                getSystemService(Context.POWER_SERVICE) as PowerManager
            return powerManager.isIgnoringBatteryOptimizations(packageName)
        }

        @JavascriptInterface
        fun openBatterySettings() {
            runOnUiThread {
                try {
                    startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
                } catch (_: Exception) {
                    startActivity(Intent(Settings.ACTION_SETTINGS))
                }
            }
        }
    }

    /// evaluateJavascript 的返回值是 JSON 编码的 JS 值：字符串带引号，空值是 "null"。
    private fun decodeJsString(raw: String?): String {
        if (raw == null || raw == "null") return ""
        return raw.trim().removeSurrounding("\"")
    }

    /**
     * Rust 侧注册入口：JNI 符号 = Java_cafe_yamds_zhibook_MainActivity_registerCloudHttp。
     * 与 src-tauri/src/http_transport/android.rs 成对维护。
     */
    private external fun registerCloudHttp()

    private companion object {
        const val BACK_PRESS_QUERY =
            "(function(){try{return (window.__yamdsBackPressed && window.__yamdsBackPressed()) || '';}catch(e){return '';}})()"
        const val NOTIFICATION_PERMISSION_REQUEST = 5502
    }
}

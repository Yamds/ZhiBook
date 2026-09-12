package cafe.yamds.bill

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import org.json.JSONObject
import java.io.File

/**
 * 宿主 Activity。
 *
 * Tauri 的 `TauriActivity` 把 `handleBackNavigation` 固定为 false，也就是**不注册任何
 * 返回键回调**，系统默认行为是直接结束 Activity。这里补上自己的回调，让设置页里
 * 的「返回键行为」真正生效。
 *
 * 与 Web 层的约定（见 src/core/platform/androidBridge.ts，两边必须同步修改）：
 *
 * 1. 物理返回键 —— 调用 `window.__yamdsBackPressed()`，按返回值决定：
 *      'handled'     界面已消费（关闭抽屉 / 回到首页），原生什么都不做
 *      'background'  退到后台（设置 = 退到后台）
 *      'exit'        结束进程（设置 = 退出程序，且用户已在确认框里确认）
 *      ''/未知       回落到 WebView 历史，再回落到结束
 *
 * 2. 退到后台后的界面内存策略 —— onStop 时调用 `window.__yamdsBackgroundPolicy()`，
 *    拿到 "mode|delaySecs"，按设置决定是否在延迟后结束后台任务以释放 WebView 内存。
 *    查询失败一律按「保持后台」处理，绝不误杀。
 *
 * 3. 双指缩放 —— 只在**关闭**时显式设置（开启是 WebView 默认值，不去动它），
 *    值来自应用设置文件。运行中切换开关由 Web 侧改写 viewport meta 立即生效，
 *    原生这层负责冷启动后的状态一致。
 */
class MainActivity : TauriActivity() {
    private var hostWebView: WebView? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private var pendingBackgroundExit: Runnable? = null

    override fun onWebViewCreate(webView: WebView) {
        hostWebView = webView
        applyZoomPreference(webView)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

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
                            "background" -> moveTaskToBack(true)
                            "exit" -> finish()
                            else -> if (webView.canGoBack()) webView.goBack() else finish()
                        }
                    }
                }
            },
        )
    }

    override fun onStart() {
        super.onStart()
        cancelPendingBackgroundExit()
    }

    override fun onStop() {
        super.onStop()
        scheduleBackgroundPolicy()
    }

    override fun onDestroy() {
        cancelPendingBackgroundExit()
        hostWebView = null
        super.onDestroy()
    }

    /// 读一次 Web 层的后台策略并据此安排「结束后台」。
    private fun scheduleBackgroundPolicy() {
        val webView = hostWebView ?: return
        webView.evaluateJavascript(BACKGROUND_POLICY_QUERY) { raw ->
            val payload = decodeJsString(raw)
            if (payload.isEmpty()) return@evaluateJavascript
            val parts = payload.split('|', limit = 2)
            val mode = parts.getOrNull(0).orEmpty()
            val delaySecs = parts.getOrNull(1)?.toLongOrNull() ?: DEFAULT_DELAY_SECS
            when (mode) {
                "immediate_lightweight" -> mainHandler.post { finishAndRemoveTask() }
                "delayed_lightweight" -> {
                    cancelPendingBackgroundExit()
                    val task = Runnable { finishAndRemoveTask() }
                    pendingBackgroundExit = task
                    mainHandler.postDelayed(task, delaySecs.coerceIn(0L, MAX_DELAY_SECS) * 1000L)
                }
                else -> Unit
            }
        }
    }

    private fun cancelPendingBackgroundExit() {
        pendingBackgroundExit?.let { mainHandler.removeCallbacks(it) }
        pendingBackgroundExit = null
    }

    /**
     * 关闭双指缩放。
     *
     * 只在设置明确为 false 时动手：WebView 默认支持缩放，开启时保持默认即可，
     * 免得改动 pinch / 双击缩放的既有行为。
     */
    private fun applyZoomPreference(webView: WebView) {
        if (readAllowPinchZoom()) return
        webView.settings.setSupportZoom(false)
        webView.settings.builtInZoomControls = false
    }

    /**
     * 直接从应用设置文件读 allowPinchZoom。
     *
     * 数据根就是 app_data_dir（= context.dataDir），配置在 `<dataDir>/config/app-settings.json`，
     * 与 Rust 侧 tk_config::DataPaths 的布局一致。读不到一律按开启处理。
     */
    private fun readAllowPinchZoom(): Boolean = runCatching {
        val file = File(applicationInfo.dataDir, SETTINGS_RELATIVE_PATH)
        if (!file.exists()) return true
        val ui = JSONObject(file.readText()).optJSONObject("uiPreferences") ?: return true
        if (!ui.has("allowPinchZoom")) return true
        ui.optBoolean("allowPinchZoom", true)
    }.getOrDefault(true)

    /// evaluateJavascript 的返回值是 JSON 编码的 JS 值：字符串带引号，空值是 "null"。
    private fun decodeJsString(raw: String?): String {
        if (raw == null || raw == "null") return ""
        return raw.trim().removeSurrounding("\"")
    }

    private companion object {
        const val SETTINGS_RELATIVE_PATH = "config/app-settings.json"
        const val DEFAULT_DELAY_SECS = 300L
        const val MAX_DELAY_SECS = 24L * 60L * 60L

        const val BACK_PRESS_QUERY =
            "(function(){try{return (window.__yamdsBackPressed && window.__yamdsBackPressed()) || '';}catch(e){return '';}})()"

        const val BACKGROUND_POLICY_QUERY =
            "(function(){try{var p = window.__yamdsBackgroundPolicy && window.__yamdsBackgroundPolicy();return p ? (p.mode + '|' + p.delaySecs) : '';}catch(e){return '';}})()"
    }
}

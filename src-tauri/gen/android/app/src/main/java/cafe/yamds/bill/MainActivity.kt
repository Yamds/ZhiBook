package cafe.yamds.bill

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge

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

    override fun onWebViewCreate(webView: WebView) {
        hostWebView = webView
        disableZoom(webView)
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

    /** 关闭双指缩放与内置缩放控件：记账界面不需要缩放，误触会打乱金额输入。 */
    private fun disableZoom(webView: WebView) {
        webView.settings.setSupportZoom(false)
        webView.settings.builtInZoomControls = false
        webView.settings.displayZoomControls = false
    }

    /// evaluateJavascript 的返回值是 JSON 编码的 JS 值：字符串带引号，空值是 "null"。
    private fun decodeJsString(raw: String?): String {
        if (raw == null || raw == "null") return ""
        return raw.trim().removeSurrounding("\"")
    }

    private companion object {
        const val BACK_PRESS_QUERY =
            "(function(){try{return (window.__yamdsBackPressed && window.__yamdsBackPressed()) || '';}catch(e){return '';}})()"
    }
}

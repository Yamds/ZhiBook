package cafe.yamds.zhibook

import org.json.JSONArray
import org.json.JSONObject
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Rust → Kotlin 的 HTTP 桥（云端备份：git smart HTTP 与 raw 下载）。
 *
 * 与 `src-tauri/src/http_transport/android.rs` 成对维护：
 * - Kotlin 只负责「发请求、把响应原样带回」，协议与加密逻辑全在 Rust；
 * - 返回帧 = `[u32 status][u32 headersJsonLen][headersJson][body]`；
 * - `status = 0` 表示请求失败，`headersJson` 里带 `error` 文案；
 * - 鉴权头（Authorization / PRIVATE-TOKEN）由 Rust 组装后原样透传。
 */
object YamdsHttp {
    private const val CONNECT_TIMEOUT_MS = 20_000
    private const val READ_TIMEOUT_MS = 180_000
    private const val MAX_REDIRECTS = 5

    @JvmStatic
    fun request(method: String, url: String, headersJson: String, body: ByteArray?): ByteArray {
        return try {
            val response = execute(method, url, headersJson, body, 0)
            frame(response.status, response.headers, response.body, null)
        } catch (error: Throwable) {
            frame(0, emptyMap(), ByteArray(0), error.message ?: error.javaClass.simpleName)
        }
    }

    private data class Response(
        val status: Int,
        val headers: Map<String, String>,
        val body: ByteArray,
    )

    private fun execute(
        method: String,
        url: String,
        headersJson: String,
        body: ByteArray?,
        redirects: Int,
    ): Response {
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.instanceFollowRedirects = false
            connection.connectTimeout = CONNECT_TIMEOUT_MS
            connection.readTimeout = READ_TIMEOUT_MS
            val headers = JSONObject(headersJson)
            headers.keys().forEach { key ->
                connection.setRequestProperty(key, headers.getString(key))
            }
            if (body != null && body.isNotEmpty() && method != "GET") {
                connection.doOutput = true
                connection.setFixedLengthStreamingMode(body.size)
                connection.outputStream.use { it.write(body) }
            }
            val status = connection.responseCode
            // GET 的同主机重定向（Gitea 不同版本的 raw 路径会有 302）自己跟，最多 5 跳。
            if (method == "GET" && status in 301..308 && redirects < MAX_REDIRECTS) {
                val location = connection.getHeaderField("Location")
                if (!location.isNullOrEmpty()) {
                    val next = URL(URL(url), location)
                    if (next.host == URL(url).host) {
                        connection.disconnect()
                        return execute(method, next.toString(), headersJson, null, redirects + 1)
                    }
                }
            }
            return read(connection, status)
        } finally {
            connection.disconnect()
        }
    }

    private fun read(connection: HttpURLConnection, status: Int): Response {
        val stream: InputStream = if (status in 200..299) {
            connection.inputStream
        } else {
            connection.errorStream ?: InputStream.nullInputStream()
        }
        val body = stream.use { it.readBytes() }
        val headers = LinkedHashMap<String, String>()
        for ((name, values) in connection.headerFields) {
            if (name.isNullOrEmpty() || values.isEmpty()) continue
            headers[name] = values.joinToString(", ")
        }
        return Response(status, headers, body)
    }

    private fun frame(
        status: Int,
        headers: Map<String, String>,
        body: ByteArray,
        error: String?,
    ): ByteArray {
        val headersArray = JSONArray()
        for ((name, value) in headers) {
            headersArray.put(JSONArray().put(name).put(value))
        }
        val payload = JSONObject()
        payload.put("headers", headersArray)
        if (error != null) {
            payload.put("error", error)
        }
        val headerBytes = payload.toString().toByteArray(Charsets.UTF_8)
        return ByteBuffer.allocate(8 + headerBytes.size + body.size)
            .order(ByteOrder.BIG_ENDIAN)
            .putInt(status)
            .putInt(headerBytes.size)
            .put(headerBytes)
            .put(body)
            .array()
    }
}

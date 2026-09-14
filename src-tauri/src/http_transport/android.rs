//! Android HTTP 传输：Rust → Kotlin `YamdsHttp.request`（JNI）。
//!
//! 主密钥、Token、pack 字节都不经过 WebView；Kotlin 只做「发 HTTP、把响应原样带回」，
//! 协议逻辑全在 Rust。JavaVM 由 MainActivity.onCreate 调用 `registerCloudHttp()`
//! （Kotlin `external fun`）时交给 Rust，两边必须同步维护。

use std::sync::OnceLock;

use jni::objects::{GlobalRef, JByteArray, JObject, JValue};
use jni::{JNIEnv, JavaVM};
use tk_cloud::{CloudError, CloudResult, HttpMethod, HttpRequest, HttpResponse, HttpTransport};

struct Bridge {
    vm: JavaVM,
    class: GlobalRef,
}

static BRIDGE: OnceLock<Bridge> = OnceLock::new();

/// Kotlin 侧的 `MainActivity.registerCloudHttp()`。
///
/// 符号名 = `Java_` + 包名 + 类名 + 方法名（`cafe.yamds.zhibook.MainActivity`）。
#[allow(unsafe_code)] // Rust 2024 要求 no_mangle 写成 unsafe(...)，这里只导出 JNI 符号
#[unsafe(no_mangle)]
pub extern "system" fn Java_cafe_yamds_zhibook_MainActivity_registerCloudHttp<'local>(
    mut env: JNIEnv<'local>,
    this: JObject<'local>,
) {
    let result = (|| -> jni::errors::Result<()> {
        let vm = env.get_java_vm()?;
        let loader = env
            .call_method(&this, "getClassLoader", "()Ljava/lang/ClassLoader;", &[])?
            .l()?;
        let name = env.new_string("cafe.yamds.zhibook.YamdsHttp")?;
        let class = env
            .call_method(
                &loader,
                "loadClass",
                "(Ljava/lang/String;)Ljava/lang/Class;",
                &[JValue::Object(&name)],
            )?
            .l()?;
        let class = env.new_global_ref(class)?;
        let _ = BRIDGE.set(Bridge { vm, class });
        Ok(())
    })();
    if let Err(error) = result {
        // 注册失败不崩溃：后续请求会返回「原生 HTTP 桥尚未就绪」。
        crate::app_log::write_session_line("ERROR", "cloud_http_register", &error.to_string());
    }
}

/// 平台传输实现。
pub struct AndroidHttpTransport;

impl HttpTransport for AndroidHttpTransport {
    fn execute(&self, request: &HttpRequest) -> CloudResult<HttpResponse> {
        let bridge = BRIDGE
            .get()
            .ok_or_else(|| CloudError::Http("原生 HTTP 桥尚未就绪".to_string()))?;
        let mut env = bridge
            .vm
            .attach_current_thread()
            .map_err(|error| CloudError::Http(format!("JNI 线程挂载失败：{error}")))?;

        let method = env
            .new_string(match request.method {
                HttpMethod::Get => "GET",
                HttpMethod::Post => "POST",
            })
            .map_err(jni_error)?;
        let url = env.new_string(&request.url).map_err(jni_error)?;
        // Kotlin 侧是 `JSONObject(headersJson)` → 必须序列化成对象（不是 [(k,v)] 数组）。
        let headers_json = super::frame::headers_to_json(&request.headers);
        let headers = env.new_string(headers_json).map_err(jni_error)?;
        let body_array = match &request.body {
            Some(bytes) => env.byte_array_from_slice(bytes).map_err(jni_error)?,
            None => env.new_byte_array(0).map_err(jni_error)?,
        };
        let body_object: JObject<'_> = body_array.into();

        // 缓存的类是 GlobalRef；转成本地 JClass 才能走 call_static_method。
        let class_local: JObject<'_> = env
            .new_local_ref(bridge.class.as_obj())
            .map_err(jni_error)?;
        let class = jni::objects::JClass::from(class_local);
        let result = env
            .call_static_method(
                class,
                "request",
                "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;[B)[B",
                &[
                    JValue::Object(&method),
                    JValue::Object(&url),
                    JValue::Object(&headers),
                    JValue::Object(&body_object),
                ],
            )
            .map_err(jni_error)?;
        let response_object = result.l().map_err(jni_error)?;
        let response_array = JByteArray::from(response_object);
        let bytes = env
            .convert_byte_array(&response_array)
            .map_err(jni_error)?;
        super::frame::parse_response(&bytes)
    }
}

fn jni_error(error: jni::errors::Error) -> CloudError {
    CloudError::Http(format!("原生 HTTP 调用失败：{error}"))
}


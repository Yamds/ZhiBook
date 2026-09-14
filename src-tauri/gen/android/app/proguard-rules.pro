# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile
# ===== P15 云端备份 =====
# Rust（src-tauri/src/http_transport/android.rs）通过 JNI 按「类名 + 方法名」
# 调用 YamdsHttp.request，Kotlin/Java 侧没有任何引用，R8 会把它改名导致
# UnsatisfiedLinkError / NoSuchMethodError，必须整类保留。
-keep class cafe.yamds.zhibook.YamdsHttp { *; }

# MainActivity 的 registerCloudHttp() 是 native 方法（由 Rust 导出符号实现），
# 方法名参与 JNI 符号拼接，同样不能改名。
-keepclassmembers class cafe.yamds.zhibook.MainActivity {
    native <methods>;
}

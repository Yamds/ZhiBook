package cafe.yamds.bill

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import java.util.Calendar

/**
 * 记账提醒的定时与通知。
 *
 * - 用 `AlarmManager.setAndAllowWhileIdle`（一次性闹钟，不需要「精确闹钟」权限），
 *   触发后由 Receiver 重排下一天；Doze 下也能响，通常准点、偶尔晚几分钟。
 * - 配置存在 `SharedPreferences`，所以 App 不在前台 / 被划掉 / 重启后都能恢复。
 * - 开机与 App 升级后由 [BootReceiver] 重新排。
 */
object ReminderScheduler {
    private const val PREFS = "yamds_reminder"
    private const val KEY_ENABLED = "enabled"
    private const val KEY_HOUR = "hour"
    private const val KEY_MINUTE = "minute"
    private const val KEY_TITLE = "title"
    private const val KEY_BODY = "body"

    const val CHANNEL_ID = "bill_reminder"
    private const val REQUEST_CODE = 5501

    /** 同步配置并重排闹钟；enabled=false 时取消。 */
    fun schedule(context: Context, enabled: Boolean, hour: Int, minute: Int, title: String, body: String) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs.edit()
            .putBoolean(KEY_ENABLED, enabled)
            .putInt(KEY_HOUR, hour)
            .putInt(KEY_MINUTE, minute)
            .putString(KEY_TITLE, title)
            .putString(KEY_BODY, body)
            .apply()

        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pending = buildPendingIntent(context, title, body)
        alarmManager.cancel(pending)
        if (enabled) {
            ensureChannel(context)
            alarmManager.setAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                nextTriggerMillis(hour, minute),
                pending,
            )
        }
    }

    /** 触发后 / 开机后按已保存的配置重排。 */
    fun rescheduleIfEnabled(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (!prefs.getBoolean(KEY_ENABLED, false)) return
        schedule(
            context,
            true,
            prefs.getInt(KEY_HOUR, 20),
            prefs.getInt(KEY_MINUTE, 0),
            prefs.getString(KEY_TITLE, "Hello~") ?: "Hello~",
            prefs.getString(KEY_BODY, "今天要记得记账哦?~") ?: "今天要记得记账哦?~",
        )
    }

    /** 发一条通知（Receiver 里调用）。 */
    fun notifyNow(context: Context, title: String, body: String) {
        ensureChannel(context)
        val manager = NotificationManagerCompat.from(context)
        if (!manager.areNotificationsEnabled()) return
        val tapIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val tapPending = PendingIntent.getActivity(
            context,
            REQUEST_CODE,
            tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(tapPending)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()
        try {
            manager.notify(REQUEST_CODE, notification)
        } catch (_: SecurityException) {
            // Android 13+ 未授权：忽略，设置页会引导授权
        }
    }

    /** 下一个 hour:minute 的时间戳（今天过了就排明天）。 */
    fun nextTriggerMillis(hour: Int, minute: Int): Long {
        val now = Calendar.getInstance()
        val target = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        if (target.timeInMillis <= now.timeInMillis) {
            target.add(Calendar.DAY_OF_YEAR, 1)
        }
        return target.timeInMillis
    }

    private fun buildPendingIntent(context: Context, title: String, body: String): PendingIntent {
        val intent = Intent(context, ReminderReceiver::class.java).apply {
            putExtra("title", title)
            putExtra("body", body)
        }
        return PendingIntent.getBroadcast(
            context,
            REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "记账提醒",
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = "每天提醒记账"
        }
        manager.createNotificationChannel(channel)
    }
}

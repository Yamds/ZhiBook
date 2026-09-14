package cafe.yamds.zhibook

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** 闹钟触发：发通知并排下一天。 */
class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        // 文案由设置页下发；缺省值走 strings.xml（多语言时加 values-<locale>/ 即可）。
        val title = intent.getStringExtra("title") ?: context.getString(R.string.reminder_default_title)
        val body = intent.getStringExtra("body") ?: context.getString(R.string.reminder_default_body)
        ReminderScheduler.notifyNow(context, title, body)
        ReminderScheduler.rescheduleIfEnabled(context)
    }
}

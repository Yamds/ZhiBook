package cafe.yamds.zhibook

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** 闹钟触发：发通知并排下一天。 */
class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val title = intent.getStringExtra("title") ?: "Hello~"
        val body = intent.getStringExtra("body") ?: "今天要记得记账哦?~"
        ReminderScheduler.notifyNow(context, title, body)
        ReminderScheduler.rescheduleIfEnabled(context)
    }
}

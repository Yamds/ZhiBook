package cafe.yamds.bill

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** 开机 / App 升级后重新排闹钟（系统会清空已注册的 alarm）。 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            -> ReminderScheduler.rescheduleIfEnabled(context)
        }
    }
}

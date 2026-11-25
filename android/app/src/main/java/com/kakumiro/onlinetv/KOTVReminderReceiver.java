package com.kakumiro.onlinetv;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class KOTVReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        int id = intent.getIntExtra(
            KOTVNotificationsPlugin.EXTRA_NOTIF_ID,
            (int) (System.currentTimeMillis() & 0x7fffffff)
        );
        String title = intent.getStringExtra(KOTVNotificationsPlugin.EXTRA_NOTIF_TITLE);
        String body = intent.getStringExtra(KOTVNotificationsPlugin.EXTRA_NOTIF_BODY);
        String category = intent.getStringExtra(KOTVNotificationsPlugin.EXTRA_NOTIF_CATEGORY);
        String channelId = intent.getStringExtra(KOTVNotificationsPlugin.EXTRA_CHANNEL_ID);

        KOTVNotificationsPlugin.showNativeNotification(
            context,
            id,
            title,
            body,
            category != null ? category : "reminder",
            channelId
        );
    }
}

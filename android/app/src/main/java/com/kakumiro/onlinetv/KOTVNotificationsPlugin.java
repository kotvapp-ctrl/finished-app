package com.kakumiro.onlinetv;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "KOTVNotifications",
    permissions = {
        @Permission(
            alias = "notifications",
            strings = { Manifest.permission.POST_NOTIFICATIONS }
        )
    }
)
public class KOTVNotificationsPlugin extends Plugin {
    public static final String EXTRA_CHANNEL_ID = "kotv_channel_id";
    public static final String EXTRA_NOTIF_ID = "kotv_notif_id";
    public static final String EXTRA_NOTIF_TITLE = "kotv_notif_title";
    public static final String EXTRA_NOTIF_BODY = "kotv_notif_body";
    public static final String EXTRA_NOTIF_CATEGORY = "kotv_notif_category";
    private static String pendingChannelId = null;

    public static void setPendingChannelId(String channelId) {
        if (channelId != null && !channelId.isEmpty()) {
            pendingChannelId = channelId.replaceAll("[^a-zA-Z0-9_-]", "");
        }
    }

    @Override
    public void load() {
        ensureNotificationChannels(getContext());
    }

    public static void ensureNotificationChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null) return;

        createChannel(
            nm,
            "kotv_news",
            "Breaking News",
            "Urgent breaking news bulletins from Kakumiro Online TV",
            NotificationManager.IMPORTANCE_HIGH
        );
        createChannel(
            nm,
            "kotv_sports",
            "Live Sports",
            "Live sports kick-offs and match updates",
            NotificationManager.IMPORTANCE_HIGH
        );
        createChannel(
            nm,
            "kotv_tvGuide",
            "TV Guide Updates",
            "Schedule changes and upcoming TV guide broadcasts",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        createChannel(
            nm,
            "kotv_reminders",
            "Programme Reminders",
            "Scheduled show and movie start alerts",
            NotificationManager.IMPORTANCE_HIGH
        );
        createChannel(
            nm,
            "kotv_live",
            "Now Streaming Live",
            "Live broadcasts and station notifications",
            NotificationManager.IMPORTANCE_HIGH
        );
    }

    private static void createChannel(
        NotificationManager nm,
        String id,
        String name,
        String description,
        int importance
    ) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(id, name, importance);
        channel.setDescription(description);
        channel.enableVibration(true);
        channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(channel);
    }

    public static String resolveChannelId(String category) {
        if ("news".equals(category)) return "kotv_news";
        if ("sports".equals(category)) return "kotv_sports";
        if ("tvGuide".equals(category)) return "kotv_tvGuide";
        if ("reminder".equals(category)) return "kotv_reminders";
        return "kotv_live";
    }

    public static void showNativeNotification(
        Context context,
        int notificationId,
        String title,
        String body,
        String category,
        String streamChannelId
    ) {
        ensureNotificationChannels(context);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
                return;
            }
        }

        String channelId = resolveChannelId(category);
        Intent launchIntent = new Intent(context, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (streamChannelId != null && !streamChannelId.isEmpty()) {
            launchIntent.putExtra(EXTRA_CHANNEL_ID, streamChannelId);
            launchIntent.setData(Uri.parse("kotv://watch?channel=" + Uri.encode(streamChannelId)));
        }

        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            notificationId,
            launchIntent,
            pendingFlags
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title != null && !title.isEmpty() ? title : "Kakumiro Online TV")
            .setContentText(body != null && !body.isEmpty() ? body : "New live broadcast update.")
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setContentIntent(contentIntent);

        if (streamChannelId != null && !streamChannelId.isEmpty()) {
            builder.addAction(0, "Watch Live", contentIntent);
        }

        NotificationManagerCompat.from(context).notify(notificationId, builder.build());
    }

    private boolean isOsNotificationGranted() {
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED
                && NotificationManagerCompat.from(ctx).areNotificationsEnabled();
        }
        return NotificationManagerCompat.from(ctx).areNotificationsEnabled();
    }

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            PermissionState state = getPermissionState("notifications");
            if (state == PermissionState.GRANTED && NotificationManagerCompat.from(getContext()).areNotificationsEnabled()) {
                ret.put("display", "granted");
            } else if (state == PermissionState.DENIED) {
                ret.put("display", "denied");
            } else {
                ret.put("display", isOsNotificationGranted() ? "granted" : "prompt");
            }
        } else {
            ret.put("display", isOsNotificationGranted() ? "granted" : "denied");
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (isOsNotificationGranted()) {
                JSObject ret = new JSObject();
                ret.put("display", "granted");
                call.resolve(ret);
                return;
            }
            requestPermissionForAlias("notifications", call, "notificationsPermissionCallback");
        } else {
            JSObject ret = new JSObject();
            ret.put("display", isOsNotificationGranted() ? "granted" : "denied");
            call.resolve(ret);
        }
    }

    @PermissionCallback
    private void notificationsPermissionCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("display", isOsNotificationGranted() ? "granted" : "denied");
        call.resolve(ret);
    }

    @PluginMethod
    public void showSystemNotification(PluginCall call) {
        if (!isOsNotificationGranted()) {
            call.reject("Android notification permission is not granted.");
            return;
        }
        String rawId = call.getString("id", "kotv-alert");
        int notifId = rawId != null ? rawId.hashCode() : (int) (System.currentTimeMillis() & 0x7fffffff);
        String title = call.getString("title", "Kakumiro Online TV");
        String body = call.getString("body", "New live update available.");
        String category = call.getString("category", "live");
        String channelId = call.getString("channelId", "");

        showNativeNotification(getContext(), notifId, title, body, category, channelId);
        JSObject ret = new JSObject();
        ret.put("ok", true);
        ret.put("id", notifId);
        call.resolve(ret);
    }

    @PluginMethod
    public void scheduleReminder(PluginCall call) {
        String key = call.getString("id", "");
        long triggerAtMs = call.getLong("triggerAtMs", 0L);
        String title = call.getString("title", "Starting soon");
        String body = call.getString("body", "Tune in live on Kakumiro Online TV");
        String channelId = call.getString("channelId", "");

        if (key == null || key.isEmpty() || triggerAtMs <= System.currentTimeMillis()) {
            call.resolve(new JSObject().put("scheduled", false));
            return;
        }

        AlarmManager am = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
        if (am == null) {
            call.resolve(new JSObject().put("scheduled", false));
            return;
        }

        int requestCode = key.hashCode();
        Intent intent = new Intent(getContext(), KOTVReminderReceiver.class);
        intent.putExtra(EXTRA_NOTIF_ID, requestCode);
        intent.putExtra(EXTRA_NOTIF_TITLE, title);
        intent.putExtra(EXTRA_NOTIF_BODY, body);
        intent.putExtra(EXTRA_NOTIF_CATEGORY, "reminder");
        intent.putExtra(EXTRA_CHANNEL_ID, channelId);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pi = PendingIntent.getBroadcast(getContext(), requestCode, intent, flags);
        am.set(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);

        call.resolve(new JSObject().put("scheduled", true));
    }

    @PluginMethod
    public void cancelReminder(PluginCall call) {
        String key = call.getString("id", "");
        if (key == null || key.isEmpty()) {
            call.resolve();
            return;
        }
        AlarmManager am = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
        if (am != null) {
            Intent intent = new Intent(getContext(), KOTVReminderReceiver.class);
            int flags = PendingIntent.FLAG_NO_CREATE;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent existing = PendingIntent.getBroadcast(getContext(), key.hashCode(), intent, flags);
            if (existing != null) {
                am.cancel(existing);
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void openSystemNotificationSettings(PluginCall call) {
        Intent intent = new Intent();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent.setAction(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        } else {
            intent.setAction(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.fromParts("package", getContext().getPackageName(), null));
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void getPendingChannelId(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("channelId", pendingChannelId != null ? pendingChannelId : "");
        pendingChannelId = null;
        call.resolve(ret);
    }
}

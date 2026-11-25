package com.kakumiro.onlinetv;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KOTVNotificationsPlugin.class);
        super.onCreate(savedInstanceState);
        dispatchChannelTap(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        dispatchChannelTap(intent);
    }

    private void dispatchChannelTap(Intent intent) {
        if (intent == null) return;
        String channelId = intent.getStringExtra(KOTVNotificationsPlugin.EXTRA_CHANNEL_ID);
        if ((channelId == null || channelId.isEmpty()) && intent.getData() != null) {
            channelId = intent.getData().getQueryParameter("channel");
        }
        if (channelId == null || channelId.isEmpty() || getBridge() == null) return;

        final String safeChannelId = channelId.replaceAll("[^a-zA-Z0-9_-]", "");
        if (safeChannelId.isEmpty()) return;

        KOTVNotificationsPlugin.setPendingChannelId(safeChannelId);

        getBridge().execute(() -> {
            if (getBridge().getWebView() != null) {
                getBridge().getWebView().post(() ->
                    getBridge().getWebView().evaluateJavascript(
                        "window.dispatchEvent(new CustomEvent('kotv-open-channel',{detail:{channelId:'" + safeChannelId + "'}}));",
                        null
                    )
                );
            }
        });
    }
}

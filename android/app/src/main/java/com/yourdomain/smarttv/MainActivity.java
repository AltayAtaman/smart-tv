package com.yourdomain.smarttv;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WakeOnLanPlugin.class);
        super.onCreate(savedInstanceState);
    }
}


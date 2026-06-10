package com.nexuspro.it.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Keep all navigation inside Capacitor BridgeActivity — no Custom Tabs / external intents.
    }
}

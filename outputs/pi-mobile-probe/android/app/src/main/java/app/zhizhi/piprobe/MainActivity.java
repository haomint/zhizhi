package app.zhizhi.piprobe;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(PiProbePlugin.class);
        super.onCreate(savedInstanceState);
    }
}

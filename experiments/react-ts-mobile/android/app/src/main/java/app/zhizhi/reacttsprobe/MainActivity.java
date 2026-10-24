package app.zhizhi.reacttsprobe;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ProbePlugin.class);
        super.onCreate(savedInstanceState);
    }
}

package app.zhizhi.personal;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(android.os.Bundle state) {
        registerPlugin(PersonalPlugin.class);
        super.onCreate(state);
    }
}

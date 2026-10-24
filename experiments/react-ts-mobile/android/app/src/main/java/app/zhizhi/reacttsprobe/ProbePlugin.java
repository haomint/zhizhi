package app.zhizhi.reacttsprobe;

import android.content.pm.PackageInfo;
import android.os.Build;
import android.webkit.WebView;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "Probe")
public class ProbePlugin extends Plugin {
    @PluginMethod
    public void echo(PluginCall call) {
        JSObject result = new JSObject();
        result.put("value", call.getString("value", ""));
        result.put("sdk", Build.VERSION.SDK_INT);
        String version = "unknown";
        if (Build.VERSION.SDK_INT >= 26) {
            PackageInfo info = WebView.getCurrentWebViewPackage();
            if (info != null) version = info.versionName;
        }
        result.put("webview", version);
        call.resolve(result);
    }
}

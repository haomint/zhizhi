package app.zhizhi.reading;

import android.app.Activity;
import android.os.Bundle;
import android.graphics.Color;
import android.webkit.*;
import android.net.Uri;
import android.view.View;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private WebView web;
    private final ExecutorService network = Executors.newFixedThreadPool(3);
    private final java.util.Set<HttpURLConnection> active = ConcurrentHashMap.newKeySet();
    private static final String ORIGIN = "https://appassets.androidplatform.net";

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(247,243,231));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.addJavascriptInterface(new NetworkBridge(), "ZhizhiAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !isOwned(request.getUrl());
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (!isOwned(request.getUrl())) return null;
                try {
                    return new WebResourceResponse("text/html", "UTF-8", getAssets().open("index.html"));
                } catch(IOException e) { return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0])); }
            }
        });
        setContentView(web);
        web.setOnApplyWindowInsetsListener((view,insets)->{
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars=insets.getInsets(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.ime());
                view.setPadding(bars.left,bars.top,bars.right,bars.bottom);
            } else view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());
            return insets;
        });
        web.loadUrl(ORIGIN + "/index.html");
    }
    private boolean isOwned(Uri uri) {
        return "https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost());
    }
    private void respond(String id, JSONObject result) {
        runOnUiThread(()->{if(web!=null)web.evaluateJavascript("window.zhizhiHttpResult("+JSONObject.quote(id)+","+result.toString()+")",null);});
    }
    public class NetworkBridge {
        @JavascriptInterface public void request(String id,String endpoint,String key,String body) {
            if(id==null||id.length()>80||endpoint==null||endpoint.length()>2048||key==null||key.length()>2000||body==null||body.length()>2000000)return;
            network.execute(()->{
                HttpURLConnection connection=null;
                try {
                    URL url=new URL(endpoint);
                    if(!"https".equals(url.getProtocol())||url.getUserInfo()!=null)throw new IOException("仅支持HTTPS接口");
                    new JSONObject(body);
                    connection=(HttpURLConnection)url.openConnection();active.add(connection);
                    connection.setInstanceFollowRedirects(false);
                    connection.setConnectTimeout(15000);connection.setReadTimeout(90000);
                    connection.setRequestMethod("POST");connection.setDoOutput(true);
                    connection.setRequestProperty("Content-Type","application/json");
                    connection.setRequestProperty("Authorization","Bearer "+key);
                    try(OutputStream out=connection.getOutputStream()){out.write(body.getBytes(StandardCharsets.UTF_8));}
                    int status=connection.getResponseCode();
                    InputStream input=status<400?connection.getInputStream():connection.getErrorStream();
                    String text="";
                    if(input!=null)try(InputStream in=input;ByteArrayOutputStream buffer=new ByteArrayOutputStream()){
                        byte[] chunk=new byte[8192];int n;
                        while((n=in.read(chunk))!=-1){buffer.write(chunk,0,n);if(buffer.size()>4000000)throw new IOException("模型返回内容过长");}
                        text=buffer.toString("UTF-8");
                    }
                    JSONObject payload;
                    try {payload=new JSONObject(text);}catch(Exception ignored){payload=new JSONObject().put("error",new JSONObject().put("message","服务没有返回有效JSON"));}
                    respond(id,new JSONObject().put("status",status).put("payload",payload));
                } catch(Exception error) {
                    try {respond(id,new JSONObject().put("error",error instanceof SocketTimeoutException?"连接超时，请重试":"连接失败，请检查接口地址和网络"));}catch(Exception ignored){}
                } finally {if(connection!=null){active.remove(connection);connection.disconnect();}}
            });
        }
    }
    @Override public void onBackPressed() {
        web.evaluateJavascript("(function(){var s=document.querySelector('.screen.is-active');if(!s||s.dataset.screen==='home')return false;var b=s.querySelector('[data-action=back-tree],[data-action=go-home],[data-action=back-home]');if(b)b.click();return !!b;})()",result->{if(!"true".equals(result))super.onBackPressed();});
    }
    @Override protected void onDestroy() {
        for(HttpURLConnection connection:active)connection.disconnect();network.shutdownNow();
        if(web!=null){web.removeJavascriptInterface("ZhizhiAndroid");web.destroy();web=null;}super.onDestroy();
    }
}

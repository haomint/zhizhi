package app.zhizhi.piprobe;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.security.KeyStore;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.*;

@CapacitorPlugin(name="PiProbe")
public class PiProbePlugin extends Plugin {
    private static final String ALIAS="zhizhi-pi-probe-api";
    private final AtomicBoolean busy=new AtomicBoolean(false);
    private final ConcurrentHashMap<String, RequestState> requests=new ConcurrentHashMap<>();
    private static class RequestState { volatile HttpURLConnection conn; volatile boolean cancelled=false; }
    private android.content.SharedPreferences prefs(){return getContext().getSharedPreferences("pi-probe",0);}
    private javax.crypto.SecretKey secret() throws Exception {
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
        if(!store.containsAlias(ALIAS)) {
            KeyGenerator gen=KeyGenerator.getInstance("AES","AndroidKeyStore");
            gen.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            gen.generateKey();
        }
        return (javax.crypto.SecretKey)store.getKey(ALIAS,null);
    }
    private String key() throws Exception {
        String value=prefs().getString("key","");if(value.isEmpty())return "";
        byte[] raw=Base64.decode(value,Base64.NO_WRAP);
        if(raw.length<29)throw new Exception("Invalid ciphertext");
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE,secret(),new GCMParameterSpec(128,raw,0,12));
        return new String(cipher.doFinal(raw,12,raw.length-12),StandardCharsets.UTF_8);
    }
    @PluginMethod public void keyStatus(PluginCall call){call.resolve(new JSObject().put("configured",!prefs().getString("key","").isEmpty()));}
    @PluginMethod public void setKey(PluginCall call){
        try {
            String value=call.getString("key","").trim();
            if(!value.matches("[!-~]{1,1000}")){call.reject("请填写有效 API Key");return;}
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,secret());
            byte[] encrypted=cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)),iv=cipher.getIV();
            if(iv.length!=12)throw new Exception("Unexpected IV");
            byte[] raw=new byte[iv.length+encrypted.length];System.arraycopy(iv,0,raw,0,iv.length);System.arraycopy(encrypted,0,raw,iv.length,encrypted.length);
            if(!prefs().edit().putString("key",Base64.encodeToString(raw,Base64.NO_WRAP)).commit())throw new Exception("Save failed");
            call.resolve();
        }catch(Exception e){call.reject("无法安全保存密钥，请重试。");}
    }
    @PluginMethod public void clearKey(PluginCall call){if(prefs().edit().remove("key").commit())call.resolve();else call.reject("清除未成功，请重试。");}
    @PluginMethod public void cancel(PluginCall call){
        RequestState state=requests.get(call.getString("requestId",""));
        if(state!=null){state.cancelled=true;if(state.conn!=null)state.conn.disconnect();}
        call.resolve();
    }
    @PluginMethod public void complete(PluginCall call){
        String requestId=call.getString("requestId","");JSObject supplied=call.getObject("payload");
        if(requestId.isEmpty()||requestId.length()>80||supplied==null||supplied.toString().length()>60000){call.reject("请求格式不正确或上下文过长。");return;}
        final JSONObject payload;
        try {
            payload=new JSONObject(supplied.toString());
            String model=payload.getString("model");if(!model.matches("[a-zA-Z0-9_.:-]{1,100}"))throw new Exception();
            JSONArray messages=payload.getJSONArray("messages");if(messages.length()<1||messages.length()>12)throw new Exception();
            JSONArray tools=payload.getJSONArray("tools");if(tools.length()!=1||!tools.getJSONObject(0).getJSONObject("function").getString("name").equals("read_learning_context"))throw new Exception();
            payload.put("stream",false).put("max_tokens",1200).put("thinking",new JSONObject().put("type","disabled"));
        }catch(Exception e){call.reject("模型消息或工具定义格式无效。");return;}
        if(!busy.compareAndSet(false,true)){call.reject("上一个网络请求尚未结束，请稍后重试。");return;}
        RequestState state=new RequestState();requests.put(requestId,state);
        getBridge().execute(()->{
            try {
                String token=key();if(token.isEmpty()){call.reject("请先加密保存自己的 DeepSeek API Key。");return;}
                if(state.cancelled){call.reject("已取消。");return;}
                HttpURLConnection conn=(HttpURLConnection)new URL("https://api.deepseek.com/chat/completions").openConnection();state.conn=conn;
                conn.setInstanceFollowRedirects(false);conn.setConnectTimeout(15000);conn.setReadTimeout(65000);
                conn.setRequestMethod("POST");conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type","application/json");conn.setRequestProperty("Authorization","Bearer "+token);
                if(state.cancelled){call.reject("已取消。");return;}
                try(java.io.OutputStream out=conn.getOutputStream()){out.write(payload.toString().getBytes(StandardCharsets.UTF_8));}
                int code=conn.getResponseCode();
                if(code!=200){call.reject(code==401?"API Key 无效（401）。":code==402?"API 账户余额不足（402）。":code==404?"模型或接口不存在（404），请检查模型名称。":code==429?"请求限流（429），请稍后重试。":"DeepSeek 请求失败（HTTP "+code+"）。");return;}
                String body;
                try(java.io.InputStream in=conn.getInputStream();java.io.ByteArrayOutputStream buffer=new java.io.ByteArrayOutputStream()){
                    byte[] chunk=new byte[8192];int n;
                    while((n=in.read(chunk))!=-1){if(state.cancelled)throw new java.io.IOException();buffer.write(chunk,0,n);if(buffer.size()>1000000)throw new java.io.IOException();}
                    body=buffer.toString(StandardCharsets.UTF_8.name());
                }
                if(state.cancelled){call.reject("已取消。");return;}
                JSObject response=new JSObject(body);if(!response.has("choices"))throw new Exception("Missing choices");
                call.resolve(response);
            }catch(java.net.SocketTimeoutException e){call.reject("网络请求超时，已保存结果仍保留，请重试。");}
            catch(Exception e){call.reject(state.cancelled?"已取消。":"网络或返回格式异常，请检查网络后重试。");}
            finally{if(state.conn!=null)state.conn.disconnect();requests.remove(requestId);busy.set(false);}
        });
    }
    @PluginMethod public void exportReport(PluginCall call){
        try {
            String text=call.getString("text","");if(text.length()>200000)throw new Exception();new JSONObject(text);
            java.io.File folder=new java.io.File(getContext().getCacheDir(),"reports");if(!folder.exists()&&!folder.mkdirs())throw new Exception();
            java.io.File file=new java.io.File(folder,"pi-probe-report.json");
            try(java.io.FileOutputStream out=new java.io.FileOutputStream(file)){out.write(text.getBytes(StandardCharsets.UTF_8));}
            android.net.Uri uri=androidx.core.content.FileProvider.getUriForFile(getContext(),getContext().getPackageName()+".fileprovider",file);
            android.content.Intent intent=new android.content.Intent(android.content.Intent.ACTION_SEND).setType("application/json").putExtra(android.content.Intent.EXTRA_STREAM,uri).addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().runOnUiThread(()->{try{getActivity().startActivity(android.content.Intent.createChooser(intent,"导出 Pi 验证报告"));call.resolve();}catch(Exception e){call.reject("无法打开系统分享。");}});
        }catch(Exception e){call.reject("无法生成验证报告。");}
    }
    @Override protected void handleOnDestroy(){for(RequestState state:requests.values()){state.cancelled=true;if(state.conn!=null)state.conn.disconnect();}super.handleOnDestroy();}
}

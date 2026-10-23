package app.zhizhi.personal;

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
import org.json.*;

@CapacitorPlugin(name="Personal")
public class PersonalPlugin extends Plugin {
    private javax.crypto.SecretKey secret() throws Exception {
        KeyStore store=KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if(!store.containsAlias("zhizhi-api")) {
            KeyGenerator gen=KeyGenerator.getInstance("AES","AndroidKeyStore");
            gen.init(new KeyGenParameterSpec.Builder("zhizhi-api",KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            gen.generateKey();
        }
        return (javax.crypto.SecretKey)store.getKey("zhizhi-api",null);
    }
    private android.content.SharedPreferences prefs(){return getContext().getSharedPreferences("personal",0);}
    private String key() throws Exception {
        String saved=prefs().getString("key",""); if(saved.isEmpty())return "";
        byte[] raw=Base64.decode(saved,Base64.NO_WRAP);
        Cipher c=Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.DECRYPT_MODE,secret(),new GCMParameterSpec(128,raw,0,12));
        return new String(c.doFinal(raw,12,raw.length-12),StandardCharsets.UTF_8);
    }
    @PluginMethod public void configure(PluginCall call){
        try {
            String value=call.getString("key","").trim();
            if(value.isEmpty()||!value.matches("[!-~]{1,1000}")){call.reject("请填写有效 API Key");return;}
            Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,secret());
            byte[] encrypted=c.doFinal(value.getBytes(StandardCharsets.UTF_8));
            byte[] raw=new byte[c.getIV().length+encrypted.length];
            System.arraycopy(c.getIV(),0,raw,0,c.getIV().length);System.arraycopy(encrypted,0,raw,c.getIV().length,encrypted.length);
            if(!prefs().edit().putString("key",Base64.encodeToString(raw,Base64.NO_WRAP)).commit())throw new Exception();
            call.resolve();
        }catch(Exception e){call.reject("无法安全保存密钥，请重试。");}
    }
    @PluginMethod public void status(PluginCall call){call.resolve(new JSObject().put("configured",!prefs().getString("key","").isEmpty()));}
    @PluginMethod public void clearKey(PluginCall call){prefs().edit().remove("key").commit();call.resolve();}
    @PluginMethod public void exportBackup(PluginCall call){
        try {
            String text=call.getString("text","");new JSONObject(text);
            java.io.File file=new java.io.File(getContext().getCacheDir(),"zhizhi-backup.json");
            try(java.io.FileOutputStream out=new java.io.FileOutputStream(file)){out.write(text.getBytes(StandardCharsets.UTF_8));}
            android.net.Uri uri=androidx.core.content.FileProvider.getUriForFile(getContext(),getContext().getPackageName()+".fileprovider",file);
            android.content.Intent intent=new android.content.Intent(android.content.Intent.ACTION_SEND).setType("application/json").putExtra(android.content.Intent.EXTRA_STREAM,uri).addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().runOnUiThread(()->{try{getActivity().startActivity(android.content.Intent.createChooser(intent,"保存学习档案"));call.resolve();}catch(Exception e){call.reject("无法打开系统分享，请稍后重试。");}});
        }catch(Exception e){call.reject("无法导出学习档案。");}
    }
    @PluginMethod public void generate(PluginCall call){
        String topic=call.getString("topic","").trim();String model=call.getString("model","").trim();
        if(topic.isEmpty()||topic.length()>100000||model.isEmpty()){call.reject("请填写学习主题和模型名称，或缩短上下文。");return;}
        getBridge().execute(()->{
            HttpURLConnection conn=null;
            try {
                String token=key();if(token.isEmpty()){call.reject("请先保存 API Key。");return;}
                conn=(HttpURLConnection)new URL("https://api.deepseek.com/chat/completions").openConnection();
                conn.setInstanceFollowRedirects(false);conn.setConnectTimeout(20000);conn.setReadTimeout(100000);
                conn.setRequestMethod("POST");conn.setDoOutput(true);conn.setRequestProperty("Content-Type","application/json");conn.setRequestProperty("Authorization","Bearer "+token);
                JSONObject payload=new JSONObject().put("model",model).put("stream",false).put("max_tokens",6000)
                    .put("messages",new JSONArray().put(new JSONObject().put("role","system").put("content",call.getString("system","你是知枝学习助手。生成一张简洁中文学习卡片：标题、一个核心概念、一个例子、一道可选思考题。约300字。不编造实时来源。")))
                    .put(new JSONObject().put("role","user").put("content",topic)));
                try(java.io.OutputStream out=conn.getOutputStream()){out.write(payload.toString().getBytes(StandardCharsets.UTF_8));}
                int code=conn.getResponseCode();if(code!=200){call.reject(code==401?"密钥无效，请检查 API Key。":code==402?"API 余额不足。":code==429?"请求过于频繁，请稍后重试。":"模型请求失败（"+code+"），请检查模型名称或稍后重试。");return;}
                String body;try(java.io.InputStream in=conn.getInputStream();java.io.ByteArrayOutputStream buffer=new java.io.ByteArrayOutputStream()){
                    byte[] chunk=new byte[8192];int count;
                    while((count=in.read(chunk))!=-1){buffer.write(chunk,0,count);if(buffer.size()>2000000)throw new Exception();}
                    body=new String(buffer.toByteArray(),StandardCharsets.UTF_8);
                }
                String content=new JSONObject(body).getJSONArray("choices").getJSONObject(0).getJSONObject("message").getString("content");
                call.resolve(new JSObject().put("content",content));
            }catch(Exception e){call.reject("连接失败或请求超时，请检查网络后重试。");}
            finally{if(conn!=null)conn.disconnect();}
        });
    }
}

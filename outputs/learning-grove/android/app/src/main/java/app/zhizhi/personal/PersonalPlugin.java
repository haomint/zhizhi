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
    private final java.util.concurrent.atomic.AtomicBoolean busy=new java.util.concurrent.atomic.AtomicBoolean(false);
    private final java.util.concurrent.ConcurrentHashMap<String, RequestState> requests=new java.util.concurrent.ConcurrentHashMap<>();
    private static class RequestState { volatile HttpURLConnection conn; volatile boolean cancelled=false; }
    @PluginMethod public void searchMaterials(PluginCall call){
        String query=call.getString("query", "").trim();
        if(query.isEmpty()||query.length()>160){call.reject("检索词需要 1—160 字。");return;}
        getBridge().execute(()->{
            HttpURLConnection conn=null;
            try {
                String encoded=java.net.URLEncoder.encode(query,"UTF-8");
                String address="https://zh.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=0&gsrlimit=3&prop=extracts&exintro=1&explaintext=1&exlimit=3&exchars=1200&gsrsearch="+encoded;
                conn=(HttpURLConnection)new URL(address).openConnection();conn.setInstanceFollowRedirects(false);conn.setConnectTimeout(12000);conn.setReadTimeout(20000);
                conn.setRequestProperty("User-Agent","ZhizhiLearning/1.0 (personal educational Android application)");
                if(conn.getResponseCode()!=200){call.reject("百科服务暂不可用，请换关键词或导入文字材料。");return;}
                try(java.io.InputStream in=conn.getInputStream();java.io.ByteArrayOutputStream buffer=new java.io.ByteArrayOutputStream()){
                    byte[] chunk=new byte[8192];int n;while((n=in.read(chunk))!=-1){buffer.write(chunk,0,n);if(buffer.size()>250000)throw new Exception();}
                    call.resolve(new JSObject(buffer.toString("UTF-8")));
                }
            }catch(Exception e){call.reject("资料检索失败，请检查网络或导入文字材料。");}
            finally{if(conn!=null)conn.disconnect();}
        });
    }
    @PluginMethod public void cancel(PluginCall call){
        RequestState state=requests.get(call.getString("requestId",""));
        if(state!=null){state.cancelled=true;if(state.conn!=null)state.conn.disconnect();}
        call.resolve();
    }
    @PluginMethod public void complete(PluginCall call){
        String requestId=call.getString("requestId","");JSObject supplied=call.getObject("payload");
        if(requestId.isEmpty()||requestId.length()>80||supplied==null||supplied.toString().length()>120000){call.reject("请求格式不正确或上下文过长。");return;}
        final JSONObject payload;
        try {
            payload=new JSONObject(supplied.toString());
            String model=payload.getString("model");if(!model.matches("[a-zA-Z0-9_.:-]{1,100}"))throw new Exception();
            JSONArray messages=payload.getJSONArray("messages");if(messages.length()<1||messages.length()>32)throw new Exception();
            JSONArray tools=payload.getJSONArray("tools");if(tools.length()>3)throw new Exception();
            for(int i=0;i<tools.length();i++){String name=tools.getJSONObject(i).getJSONObject("function").getString("name");if(!java.util.Arrays.asList("read_learning_context","read_learning_memory","read_materials").contains(name))throw new Exception();}
            payload.put("stream",false).put("max_tokens",6000).put("thinking",new JSONObject().put("type","disabled"));
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
    @Override protected void handleOnDestroy(){for(RequestState state:requests.values()){state.cancelled=true;if(state.conn!=null)state.conn.disconnect();}super.handleOnDestroy();}
}

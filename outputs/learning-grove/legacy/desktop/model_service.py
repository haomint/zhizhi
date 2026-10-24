"""Provider configuration, Windows-protected credentials, and DeepSeek requests."""
from __future__ import annotations

import base64
import ctypes
import json
import os
import re
import socket
import ssl
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse, urlunparse
from urllib.request import Request, urlopen

DEFAULT_BASE = 'https://api.deepseek.com'
DEFAULT_MODEL = 'deepseek-flash'


def protect_secret(text: str, decrypt: bool = False) -> str:
    """Windows DPAPI, current Windows user. Never falls back to plaintext."""
    if os.name != 'nt':
        raise ValueError('当前系统不支持 Windows 加密保存，请取消“在本机加密保存”。')

    class Blob(ctypes.Structure):
        _fields_ = [('size', ctypes.c_uint32), ('data', ctypes.POINTER(ctypes.c_ubyte))]

    raw = base64.b64decode(text, validate=True) if decrypt else text.encode('utf-8')
    buffer = ctypes.create_string_buffer(raw)
    source = Blob(len(raw), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_ubyte)))
    result = Blob()
    crypt = ctypes.WinDLL('crypt32', use_last_error=True)
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    if decrypt:
        function = crypt.CryptUnprotectData
        function.argtypes = [ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p,
                             ctypes.c_void_p, ctypes.c_uint32, ctypes.POINTER(Blob)]
    else:
        function = crypt.CryptProtectData
        function.argtypes = [ctypes.POINTER(Blob), ctypes.c_wchar_p, ctypes.c_void_p, ctypes.c_void_p,
                             ctypes.c_void_p, ctypes.c_uint32, ctypes.POINTER(Blob)]
    function.restype = ctypes.c_int
    description = None if decrypt else 'Learning Grove API credential'
    if not function(ctypes.byref(source), description, None, None, None, 1, ctypes.byref(result)):
        raise ValueError('无法使用当前 Windows 账号加密或读取密钥，请重新填写，或暂时取消加密保存。')
    try:
        data = ctypes.string_at(result.data, result.size)
        return data.decode('utf-8') if decrypt else base64.b64encode(data).decode('ascii')
    finally:
        kernel.LocalFree.argtypes = [ctypes.c_void_p]
        kernel.LocalFree.restype = ctypes.c_void_p
        kernel.LocalFree(ctypes.cast(result.data, ctypes.c_void_p))


def normalize_base(value: str) -> str:
    value = str(value or DEFAULT_BASE).strip().rstrip('/')
    parsed = urlparse(value)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError('API 地址格式不正确。DeepSeek 默认地址为 https://api.deepseek.com。')
    if parsed.scheme == 'http' and parsed.hostname not in ('localhost', '127.0.0.1', '::1'):
        raise ValueError('远程 API 地址需要使用 HTTPS，本机测试服务可以使用 HTTP。')
    path = parsed.path.rstrip('/')
    if path.endswith('/chat/completions'):
        path = path[:-len('/chat/completions')].rstrip('/')
    return urlunparse((parsed.scheme, parsed.netloc, path, '', '', ''))


def sanitize_key(value: str) -> str:
    key = str(value or '').strip().strip('"\'')
    key = re.sub(r'^(?:Authorization:\s*)?Bearer\s+', '', key, flags=re.I).strip()
    if any(ch.isspace() or ord(ch) < 33 or ord(ch) > 126 for ch in key):
        raise ValueError('密钥中含有空格或无效字符，请只粘贴完整的 API Key。')
    if len(key) > 1000:
        raise ValueError('密钥内容过长，请确认没有粘贴整个请求示例。')
    return key


class ModelClient:
    def __init__(self, data_dir: Path):
        self.path = data_dir / 'model-settings.json'
        self.config = {'provider': 'deepseek', 'base_url': DEFAULT_BASE, 'model': DEFAULT_MODEL, 'key': '',
                       'enabled': False, 'remember': False, 'test_status': 'untested', 'notice': ''}
        if self.path.exists():
            try:
                saved = json.loads(self.path.read_text(encoding='utf-8'))
                self.config.update({k: saved[k] for k in ('provider', 'base_url', 'model', 'enabled', 'remember') if k in saved})
                if saved.get('key_protected'):
                    self.config['key'] = protect_secret(saved['key_protected'], decrypt=True)
                if saved.get('requires_key') and not self.config['key']:
                    self.config.update(enabled=False, notice='已恢复地址和模型设置，请重新填写 API Key。')
            except (ValueError, OSError, TypeError):
                self.config.update(enabled=False, notice='无法读取保存的模型设置，请重新填写 API Key。')
        env_base, env_model = os.environ.get('MODEL_BASE_URL'), os.environ.get('MODEL_NAME')
        env_key = os.environ.get('DEEPSEEK_API_KEY') or os.environ.get('MODEL_API_KEY')
        if env_base or env_model or env_key:
            self.config.update(base_url=normalize_base(env_base or DEFAULT_BASE), model=env_model or DEFAULT_MODEL,
                               key=sanitize_key(env_key or ''), enabled=True)
            self.config['provider'] = 'deepseek' if urlparse(self.config['base_url']).hostname == 'api.deepseek.com' else 'compatible'
            if self.config['provider'] == 'deepseek' and not self.config['key']:
                self.config['enabled'] = False

    def public(self):
        return {k: self.config[k] for k in ('provider', 'base_url', 'model', 'enabled', 'remember', 'test_status', 'notice')} | {
            'has_key': bool(self.config['key']), 'mode': 'live' if self.config['enabled'] else 'demo',
            'can_remember': os.name == 'nt'}

    def configure(self, data):
        old = self.config
        base = normalize_base(data.get('base_url') or old['base_url'] or DEFAULT_BASE)
        provider = data.get('provider') or ('deepseek' if urlparse(base).hostname == 'api.deepseek.com' else 'compatible')
        if provider not in ('deepseek', 'compatible'):
            raise ValueError('请选择 DeepSeek 或自定义兼容通道。')
        enabled = bool(data.get('enabled', True))
        model = str(data.get('model') or (DEFAULT_MODEL if provider == 'deepseek' else old['model'])).strip()[:100]
        if not model:
            raise ValueError('请填写模型名称。')
        key = old['key']
        if urlparse(base).netloc != urlparse(old['base_url']).netloc or provider != old['provider']:
            key = ''
        if data.get('clear_key'):
            key = ''
        elif data.get('key'):
            key = sanitize_key(data['key'])
        if enabled and provider == 'deepseek' and not key:
            raise ValueError('请先粘贴你的 DeepSeek API Key，再点击“保存并测试”。')
        remember = bool(data.get('remember', old['remember']))
        candidate = dict(old, provider=provider, base_url=base, model=model, key=key, enabled=enabled,
                         remember=remember, test_status='untested', notice='')
        stored = {k: candidate[k] for k in ('provider', 'base_url', 'model', 'enabled', 'remember')}
        stored['requires_key'] = bool(key) or provider == 'deepseek'
        stored['key_protected'] = protect_secret(key) if remember and key else ''
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix('.tmp')
        temporary.write_text(json.dumps(stored, ensure_ascii=False, indent=2), encoding='utf-8')
        temporary.replace(self.path)
        self.config.update(candidate)

    def complete(self, messages, *, json_output=False, max_tokens=3000, timeout=90):
        if not self.config['enabled']:
            raise ValueError('请先在 DeepSeek 设置中填写 API Key，并保存连接设置。')
        body = {'model': self.config['model'], 'messages': messages, 'stream': False, 'max_tokens': max_tokens}
        if json_output:
            body['response_format'] = {'type': 'json_object'}
        if self.config['provider'] == 'deepseek':
            body['thinking'] = {'type': 'disabled'}
        headers = {'Content-Type': 'application/json', 'User-Agent': 'LearningGrove/0.2 (local app)'}
        if self.config['key']:
            headers['Authorization'] = 'Bearer ' + self.config['key']
        request = Request(self.config['base_url'] + '/chat/completions', data=json.dumps(body).encode(), headers=headers)
        try:
            with urlopen(request, timeout=timeout) as response:
                raw = response.read(3_000_001)
            if len(raw) > 3_000_000:
                raise ValueError('模型返回内容过大，请缩小本次学习范围。')
            payload = json.loads(raw)
            choice = payload['choices'][0]
            if choice.get('finish_reason') == 'length':
                raise ValueError('模型回答被截断，本次没有覆盖原有内容。请减少本次内容后重试。')
            content = choice['message'].get('content')
            if not isinstance(content, str) or not content.strip():
                raise ValueError('模型已响应，但没有返回正文。请重试；本次没有保存不完整的内容。')
            self.config['test_status'] = 'passed'
            return content.strip()
        except HTTPError as error:
            self.config['test_status'] = 'failed'
            descriptions = {400: '请求格式或模型参数不正确，请检查高级设置。',
                            401: 'API Key 验证失败，请重新复制 DeepSeek 开放平台中的密钥。',
                            402: 'DeepSeek API 账户余额不足，请在开放平台检查账户余额。',
                            403: '该 API Key 或网络当前没有访问权限。',
                            404: '模型或接口地址不存在，请检查高级设置中的地址和模型名。',
                            422: '模型服务不接受当前参数，请检查模型名称。',
                            429: '请求过于频繁，请稍后重试。',
                            500: '模型服务暂时发生错误，请稍后重试。',
                            502: '模型服务的网关暂时不可用，请稍后重试。',
                            503: '模型服务繁忙，请稍后重试。'}
            raise ValueError(f'HTTP {error.code}：' + descriptions.get(error.code, '模型服务请求失败，请稍后重试。')) from None
        except (TimeoutError, socket.timeout):
            self.config['test_status'] = 'failed'
            raise ValueError('等待模型响应超时。原有学习内容已保留，可以稍后重试。') from None
        except URLError as error:
            self.config['test_status'] = 'failed'
            if isinstance(error.reason, ssl.SSLError):
                raise ValueError('HTTPS 证书校验失败，请检查系统时间、网络代理或证书配置。') from None
            raise ValueError('无法连接模型服务，请检查网络连接、代理和 API 地址。') from None
        except (json.JSONDecodeError, KeyError, IndexError, TypeError):
            raise ValueError('接口已响应，但返回格式不是预期的对话结果。请检查是否填写了正确的 API 地址。') from None

    def probe(self):
        self.complete([{'role': 'system', 'content': 'This is a connection test. Reply only OK.'},
                       {'role': 'user', 'content': 'OK'}], max_tokens=32, timeout=30)
        return '连接成功。DeepSeek 已可以用于需求整理、学习路线和问答。' if self.config['provider'] == 'deepseek' else '连接成功，模型服务已可以使用。'

    def structured(self, prompt, context, max_tokens=3000):
        answer = self.complete([{'role': 'system', 'content': prompt},
                                {'role': 'user', 'content': json.dumps(context, ensure_ascii=False)}],
                               json_output=True, max_tokens=max_tokens)
        answer = re.sub(r'^```(?:json)?\s*|\s*```$', '', answer.strip(), flags=re.I)
        try:
            result = json.loads(answer)
        except json.JSONDecodeError:
            raise ValueError('模型未按约定返回完整 JSON，本次内容未保存。可以重试。') from None
        if not isinstance(result, dict):
            raise ValueError('模型返回的结构不正确，本次内容未保存。')
        return result

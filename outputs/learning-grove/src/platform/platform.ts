import { Capacitor, registerPlugin } from "@capacitor/core";
import { list, record, requireThat } from "../contracts.ts";
import type { Material, ModelPayload } from "../contracts.ts";
import { material, uid } from "../core/domain.ts";
export interface Platform {
  native: boolean;
  status(): Promise<{ configured: boolean }>;
  configure(key: string): Promise<void>;
  clearKey(): Promise<void>;
  complete(payload: ModelPayload, signal?: AbortSignal): Promise<unknown>;
  test(model: string): Promise<void>;
  search(query: string): Promise<Material[]>;
  loadRule(name: string): Promise<string>;
  loadDemo(): Promise<unknown>;
  exportArchive(text: string): Promise<void>;
}
interface PersonalPlugin {
  status(): Promise<{ configured: boolean }>;
  configure(input: { key: string }): Promise<void>;
  clearKey(): Promise<void>;
  complete(input: {
    requestId: string;
    payload: ModelPayload;
  }): Promise<unknown>;
  cancel(input: { requestId: string }): Promise<void>;
  generate(input: {
    model: string;
    system: string;
    topic: string;
  }): Promise<unknown>;
  searchMaterials(input: { query: string }): Promise<unknown>;
  exportBackup(input: { text: string }): Promise<void>;
}
export function parseSearch(raw: unknown): Material[] {
  const response = record(raw);
  requireThat(!response.error, "百科服务暂不可用，请导入文字材料");
  const query = response.query ? record(response.query) : {};
  const pages = query.pages ? Object.values(record(query.pages)) : [];
  return pages
    .map(record)
    .filter((p) => typeof p.extract === "string" && typeof p.title === "string")
    .slice(0, 3)
    .map((p) =>
      material({
        title: String(p.title),
        text: String(p.extract).slice(0, 24000),
        url: "https://zh.wikipedia.org/?curid=" + String(p.pageid),
        location: "条目导言；pageid=" + String(p.pageid),
        kind: "wikipedia",
        license: "Wikipedia 贡献者，CC BY-SA；仅供学习参考",
      }),
    );
}
export function createPlatform(): Platform {
  const native = Capacitor.isNativePlatform(),
    plugin = registerPlugin<PersonalPlugin>("Personal");
  const textResource = async (path: string) => {
    const response = await fetch("./" + path);
    requireThat(response.ok, "应用资源读取失败：" + path);
    return response.text();
  };
  const noModel = () => {
    throw Error("浏览器预览仅支持本地功能；请在安卓应用中设置模型 Key。");
  };
  return {
    native,
    status: () =>
      native ? plugin.status() : Promise.resolve({ configured: false }),
    configure: async (key) => {
      if (!native) noModel();
      await plugin.configure({ key });
    },
    clearKey: async () => {
      if (native) await plugin.clearKey();
    },
    complete: async (payload, signal) => {
      if (!native) return noModel();
      const requestId = uid();
      const cancel = () => {
        void plugin.cancel({ requestId }).catch(() => {});
      };
      if (signal?.aborted) throw Error("已取消");
      signal?.addEventListener("abort", cancel, { once: true });
      try {
        return await plugin.complete({ requestId, payload });
      } finally {
        signal?.removeEventListener("abort", cancel);
      }
    },
    test: async (model) => {
      if (!native) noModel();
      await plugin.generate({ model, system: "只回复OK", topic: "连接测试" });
    },
    search: async (query) => {
      if (native) return parseSearch(await plugin.searchMaterials({ query }));
      const url = new URL("https://zh.wikipedia.org/w/api.php");
      url.search = new URLSearchParams({
        action: "query",
        generator: "search",
        gsrsearch: query,
        gsrlimit: "3",
        prop: "extracts",
        exintro: "1",
        explaintext: "1",
        format: "json",
        origin: "*",
      }).toString();
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      requireThat(response.ok, "百科检索失败，请导入文字材料");
      return parseSearch(await response.json());
    },
    loadRule: (name) => textResource("skills/" + name + ".md"),
    loadDemo: async () =>
      JSON.parse(await textResource("demo.json")) as unknown,
    exportArchive: async (text) => {
      if (native) {
        await plugin.exportBackup({ text });
        return;
      }
      const url = URL.createObjectURL(
        new Blob([text], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download =
        "知枝-学习档案-" + new Date().toISOString().slice(0, 10) + ".json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  };
}
